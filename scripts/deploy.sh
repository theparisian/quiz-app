#!/usr/bin/env bash
# Déploiement sur le VPS (appelé par .github/workflows/deploy.yml, ou à la main).
#
# Usage, depuis la racine du projet sur le VPS :
#   BRANCH=master FORCE=0 bash scripts/deploy.sh
#
# Étapes : garde « séance en cours » -> mise à jour du code -> install, build, migrations,
# redémarrage PM2 -> contrôle de santé -> retour arrière automatique en cas d'échec.
#
# Codes de sortie :
#   0  déploiement réussi
#   1  échec (compilation, migration ou contrôle de santé) ; retour arrière tenté
#   3  déploiement refusé : session(s) en cours (relancer avec FORCE=1 pour passer outre)
#
# IMPORTANT : les migrations Prisma ne sont JAMAIS annulées. En cas de retour arrière, le code
# précédent tourne sur le schéma déjà migré : chaque migration doit donc rester compatible avec
# la version précédente du code (ajouts uniquement, pas de suppression ni de renommage).
#
# Le corps du script est dans main(), appelée en dernière ligne : bash lit ainsi tout le fichier
# avant d'exécuter quoi que ce soit, même si git réécrit scripts/deploy.sh pendant le déploiement.

set -euo pipefail

API_URL='http://127.0.0.1:4000'
APP_PORTS=(4001 4002 4003 4004)
HEALTH_ATTEMPTS=30
HEALTH_DELAY_S=2

log() {
  printf '[deploy] %s\n' "$*"
}

# Valeur d'une clé du .env (dernière occurrence, guillemets et CR retirés), sans sourcer le fichier.
read_env_value() {
  local wanted="$1" raw
  [ -f .env ] || return 0
  raw="$(grep -E "^${wanted}=" .env | tail -n 1 | cut -d= -f2- | tr -d '\r')" || true
  if [ "${#raw}" -ge 2 ]; then
    case "$raw" in
      \"*\" | \'*\') raw="${raw:1:${#raw}-2}" ;;
    esac
  fi
  printf '%s' "$raw"
}

# Code HTTP d'une URL ("000" si pas de réponse). Arguments supplémentaires passés à curl.
http_code() {
  local url="$1"
  shift
  curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$@" "$url" 2>/dev/null || true
}

# Garde : refuse de redémarrer pendant une séance (sauf FORCE=1).
guard_active_sessions() {
  local token body_file code blocking

  if [ "$FORCE" = "1" ]; then
    log "FORCE=1 : garde des sessions en cours ignorée."
    return 0
  fi

  token="$(read_env_value HEALTH_CHECK_TOKEN)"
  if [ -z "$token" ]; then
    log "ATTENTION : HEALTH_CHECK_TOKEN absent de .env, impossible de vérifier les sessions en cours. Déploiement poursuivi sans garde."
    return 0
  fi

  body_file="$(mktemp)"
  code="$(curl -s -o "$body_file" -w '%{http_code}' --max-time 5 \
    -H "x-health-token: ${token}" "${API_URL}/health/active-sessions" 2>/dev/null)" || code='000'
  [ -n "$code" ] || code='000'

  case "$code" in
    000)
      rm -f "$body_file"
      log "L'API ne répond pas (premier déploiement ou API arrêtée) : garde ignorée."
      return 0
      ;;
    404)
      rm -f "$body_file"
      log "Route /health/active-sessions absente de la version en place : garde ignorée."
      return 0
      ;;
    200) ;;
    *)
      rm -f "$body_file"
      log "Garde impossible : /health/active-sessions a répondu HTTP ${code} (jeton différent de celui de l'API en place ?)."
      echo "Déploiement refusé : sessions en cours non vérifiables. Relancer avec FORCE=1 si aucune séance n'est en cours."
      exit 3
      ;;
  esac

  blocking="$(grep -oE '"blocking":[0-9]+' "$body_file" | head -n 1 | cut -d: -f2)" || true
  rm -f "$body_file"
  if [ -z "$blocking" ]; then
    echo "Déploiement refusé : réponse de /health/active-sessions illisible. Relancer avec FORCE=1 si aucune séance n'est en cours."
    exit 3
  fi

  if [ "$blocking" -gt 0 ]; then
    echo "Déploiement refusé : ${blocking} session(s) en cours"
    exit 3
  fi
  log "Aucune session en cours."
}

# Install, build, migrations, redémarrage : commandes reprises du workflow, dans le même ordre.
# Chaque commande est suivie de "|| return 1" : set -e ne s'applique pas dans une fonction
# appelée depuis un "if".
build_and_restart() {
  corepack enable || return 1
  corepack prepare pnpm@9.15.4 --activate || return 1
  pnpm install --frozen-lockfile || return 1
  pnpm --filter @quiz-app/api db:generate || return 1
  sed -i 's/\r$//' .env || return 1
  if [ -f api/.env ]; then sed -i 's/\r$//' api/.env || return 1; fi
  # shellcheck source=scripts/load-env.sh
  source scripts/load-env.sh || return 1
  pnpm turbo build --concurrency=1 || return 1
  pnpm --filter @quiz-app/api db:migrate:deploy || return 1
  pm2 startOrReload ecosystem.config.js --update-env || return 1
  pm2 save || return 1
}

# Contrôle de santé : API en 200, apps Next.js en < 500, jusqu'à HEALTH_ATTEMPTS essais.
health_check() {
  local attempt code port ok
  for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt++)); do
    ok=1
    code="$(http_code "${API_URL}/health")"
    if [ "$code" != "200" ]; then
      ok=0
    else
      for port in "${APP_PORTS[@]}"; do
        code="$(http_code "http://127.0.0.1:${port}/")"
        if [ "$code" = "000" ] || [ "$code" -ge 500 ]; then
          ok=0
          break
        fi
      done
    fi
    if [ "$ok" = "1" ]; then
      log "Contrôle de santé OK (essai ${attempt}/${HEALTH_ATTEMPTS})."
      return 0
    fi
    sleep "$HEALTH_DELAY_S"
  done
  log "Contrôle de santé en échec après ${HEALTH_ATTEMPTS} essais (dernier code : ${code})."
  return 1
}

# Retour à PREV_SHA. Les migrations ne sont pas annulées (voir en-tête).
rollback() {
  log "Retour arrière vers ${PREV_SHA}..."
  if git reset --hard "$PREV_SHA" &&
    pnpm install --frozen-lockfile &&
    pnpm --filter @quiz-app/api db:generate &&
    source scripts/load-env.sh &&
    pnpm turbo build --concurrency=1 &&
    pm2 startOrReload ecosystem.config.js --update-env &&
    pm2 save; then
    if ! health_check; then
      log "ATTENTION : la version restaurée ne répond pas correctement, intervention manuelle requise."
    fi
    echo "ROLLBACK effectué vers ${PREV_SHA}"
  else
    echo "ROLLBACK ÉCHOUÉ vers ${PREV_SHA} : intervention manuelle requise."
  fi
  exit 1
}

main() {
  BRANCH="${BRANCH:?BRANCH doit être défini (ex. BRANCH=master)}"
  FORCE="${FORCE:-0}"

  PREV_SHA="$(git rev-parse HEAD)"
  log "Branche ${BRANCH}, version en place ${PREV_SHA}, FORCE=${FORCE}."

  guard_active_sessions

  # -f : écrase les modifications locales des fichiers suivis (remplace l'ancien git stash).
  git fetch origin "$BRANCH"
  git checkout -f "$BRANCH"
  git reset --hard "origin/$BRANCH"
  log "Code mis à jour : $(git rev-parse HEAD)."

  if ! build_and_restart; then
    log "Échec de l'installation, de la compilation, des migrations ou du redémarrage."
    rollback
  fi

  if ! health_check; then
    rollback
  fi

  echo "Déploiement (${BRANCH}) terminé : $(git rev-parse HEAD)."
}

main "$@"
exit
