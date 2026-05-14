#!/usr/bin/env bash
# Provisioning Quiz App — NUC Ubuntu Server x86_64 (pilote terrain).
# Exécuter : sudo ./provision-nuc.sh
# Commit 1 (squelette) : vérifs + saisie + récap uniquement ; installation au commit 3.

set -euo pipefail

readonly PROVISION_MARKER="/etc/quiz-app/provisioned"
readonly CONFIG_DIR="/etc/quiz-app"
die() {
  echo "Erreur: $*" >&2
  exit 1
}

log() {
  echo "[quiz-nuc] $*"
}

require_root() {
  if [[ "${EUID:-0}" -ne 0 ]]; then
    die "Ce script doit être lancé en root (ex. sudo ./provision-nuc.sh)."
  fi
}

require_ubuntu_amd64() {
  [[ -f /etc/os-release ]] || die "Fichier /etc/os-release introuvable."
  # shellcheck disable=SC1091
  source /etc/os-release
  [[ "${ID:-}" == "ubuntu" ]] || die "Ce script ne cible que Ubuntu Server (ID=${ID:-?})."

  local arch
  arch=$(uname -m)
  [[ "$arch" == "x86_64" ]] || die "Architecture non supportée: $arch (attendu x86_64)."

  log "Ubuntu ${VERSION_ID:-?} (${arch}) détecté."
}

show_intro() {
  cat <<'EOF'

╔══════════════════════════════════════════════════════════════╗
║  Quiz App — provisioning NUC (Ubuntu Server x86_64)           ║
╚══════════════════════════════════════════════════════════════╝

Ce script prépare Chromium en mode kiosque, systemd et la configuration
locale (/etc/quiz-app/).

⚠️  Créez d'abord la NUC dans l'interface admin et copiez nuc_uid +
    auth_key (la clé n'est affichée qu'une seule fois).

Voir les commits suivants du dépôt pour l'étape apt / systemd complète.

EOF
}

prompt_install_mode() {
  if [[ ! -d "$CONFIG_DIR" ]] || { [[ ! -f "$CONFIG_DIR/nuc.env" ]] && [[ ! -f "$PROVISION_MARKER" ]]; }; then
    INSTALL_MODE="full"
    log "Mode : première installation."
    return
  fi

  echo
  log "Une configuration existe déjà sous ${CONFIG_DIR}."
  echo "  [R] Ré-provisionnement : retirer le marqueur de première ouverture"
  echo "       (Chromium utilisera /provision avec la clé une fois au prochain démarrage)."
  echo "  [M] Mettre à jour nuc.env uniquement (le marqueur provisioned est conservé)."
  echo "  [N] Réinstallation complète (écrase nuc-id / nuc.env)."
  echo "  [Q] Quitter sans rien changer."
  read -rp "Votre choix [r/m/n/Q] : " mode_choice
  case "${mode_choice^^}" in
    R)
      INSTALL_MODE="reprovision"
      rm -f "$PROVISION_MARKER"
      log "Mode : ré-provisionnement (marqueur retiré)."
      ;;
    M) INSTALL_MODE="update_env" ;;
    N)
      INSTALL_MODE="full"
      rm -f "$PROVISION_MARKER" "$CONFIG_DIR/nuc-id" "$CONFIG_DIR/nuc.env"
      log "Mode : nouvelle installation (fichiers de config précédents supprimés)."
      ;;
    Q | '') exit 0 ;;
    *) die "Choix invalide." ;;
  esac
}

collect_params() {
  read -rp "Collez le nuc_uid (interface admin, obligatoire) : " NUC_UID
  [[ -n "${NUC_UID// /}" ]] || die "nuc_uid obligatoire."

  read -rsp "auth_key (saisie masquée, obligatoire) : " AUTH_KEY
  echo || true
  [[ -n "$AUTH_KEY" ]] || die "auth_key obligatoire."

  read -rp "URL de l’API HTTPS [https://demo.uxii.fr] : " api_in
  API_URL="${api_in:-https://demo.uxii.fr}"

  local derived_player
  derived_player="https://player.demo.uxii.fr"
  read -rp "URL du player (interface A) [${derived_player}] : " player_in
  PLAYER_URL="${player_in:-$derived_player}"

  read -rp "Nom du cinéma (optionnel, affichage uniquement local) [] : " CINEMA_NAME
  CINEMA_NAME="${CINEMA_NAME:-}"
}

summarize_and_confirm() {
  echo
  log "Récapitulatif :"
  echo "  nuc_uid       : $NUC_UID"
  echo "  auth_key      : ********"
  echo "  API_URL       : $API_URL"
  echo "  PLAYER_URL    : $PLAYER_URL"
  echo "  CINEMA_NAME   : ${CINEMA_NAME:-<vide>}"
  echo "  mode          : ${INSTALL_MODE:-?}"
  echo
  read -rp "Continuer avec ces valeurs ? [o/N] " ok
  if [[ ! "${ok^^}" =~ ^O(|UI)$ ]]; then
    log "Annulé."
    exit 0
  fi
}

main() {
  require_root
  require_ubuntu_amd64
  INSTALL_MODE=""
  prompt_install_mode
  show_intro
  collect_params
  summarize_and_confirm

  log "Squelette : aucune étape d'installation système encore (voir commit suivants)."
}

main "$@"
