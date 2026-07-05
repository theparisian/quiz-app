#!/usr/bin/env bash
# Provisioning shh — NUC Ubuntu Server x86_64 (pilote terrain).
# Exécuter : sudo ./provision-nuc.sh
#
# Arborescence cible :
#   /etc/quiz-app/nuc-id         — uid NUC (ligne unique)
#   /etc/quiz-app/nuc.env        — secrets (chmod 600) — jamais committé sur la machine
#   /etc/quiz-app/provisioned    — témoin : Chromium ouvre alors PLAYER_URL/ (sinon /provision avec clés)
#
# Paquets : X minimal pour kiosque (xinit + serveur X, pas GNOME desktop).

set -euo pipefail

readonly CONFIG_DIR="/etc/quiz-app"
readonly PROVISION_MARKER="${CONFIG_DIR}/provisioned"
readonly QUIZ_KIOSK_USER="${QUIZ_KIOSK_USER:-quizkiosk}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly TEMPLATE_DIR="${SCRIPT_DIR}/templates"

die() {
  echo "Erreur: $*" >&2
  exit 1
}

log() {
  echo "[quiz-nuc] $*"
}

require_root() {
  [[ "${EUID:-0}" -ne 0 ]] && die "Lancer avec sudo ou en root."
}

require_ubuntu_amd64() {
  [[ -f /etc/os-release ]] || die "/etc/os-release introuvable."
  # shellcheck disable=SC1091
  source /etc/os-release
  [[ "${ID:-}" == "ubuntu" ]] || die "Seul Ubuntu Server est supporté (ID=${ID:-?})."
  local arch
  arch="$(uname -m)"
  [[ "$arch" == "x86_64" ]] || die "Architecture invalide : $arch (attendu x86_64)."
  log "Détection : Ubuntu ${VERSION_ID:-?}, $arch"
}

ensure_quiz_user() {
  if id -u "$QUIZ_KIOSK_USER" &>/dev/null; then
    log "Utilisateur système '${QUIZ_KIOSK_USER}' déjà présent."
  else
    useradd --system --create-home --shell /bin/bash --groups video,input,audio,tty "$QUIZ_KIOSK_USER"
    log "Utilisateur '${QUIZ_KIOSK_USER}' créé (groupes video,input,audio,tty)."
  fi
  loginctl enable-linger "$QUIZ_KIOSK_USER" 2>/dev/null || log "loginctl indisponible — ignorer linger"
}

detect_chromium_package() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  if apt-cache show chromium >/dev/null 2>&1; then
    echo chromium
    return
  fi
  if apt-cache show chromium-browser >/dev/null 2>&1; then
    echo chromium-browser
    return
  fi
  die "Aucun paquet 'chromium' ou 'chromium-browser' disponible sur cette version Ubuntu."
}

install_packages() {
  local chromium_pkg
  chromium_pkg="$(detect_chromium_package)"
  log "Installation paquets système (chromium=${chromium_pkg})…"

  apt-get install -y --no-install-recommends \
    "$chromium_pkg" \
    dbus-user-session \
    fonts-liberation \
    python3 \
    unclutter \
    x11-utils \
    x11-xserver-utils \
    xdotool \
    xinit \
    xserver-xorg-core \
    xserver-xorg-input-all

  [[ -d /etc/X11/xorg.conf.d ]] || mkdir -p /etc/X11/xorg.conf.d
}

prompt_install_mode() {
  INSTALL_MODE=""
  if [[ ! -d "$CONFIG_DIR" ]] ||
    { [[ ! -f "$CONFIG_DIR/nuc.env" ]] && [[ ! -f "$PROVISION_MARKER" ]]; }; then
    INSTALL_MODE="full"
    log "Mode : première installation."
    return
  fi

  echo
  log "Configuration existante détectée sous ${CONFIG_DIR}."
  echo "  [R] Ré-provisionnement navigateur — supprime le marqueur (prochain démarrage : URL /provision une fois)."
  echo "  [M] Mettre à jour nuc.env uniquement (garde ${PROVISION_MARKER})."
  echo "  [N] Réinstaller config (supprime nuc-id/nuc.env/marqueur avant re-saisie)."
  echo "  [Q] Quitter."
  read -rp "Choix [r/m/n/Q] : " mode_choice

  case "${mode_choice^^}" in
    R)
      INSTALL_MODE="reprovision"
      rm -f "$PROVISION_MARKER"
      ;;
    M)
      INSTALL_MODE="update_env"
      ;;
    N)
      INSTALL_MODE="full"
      rm -f "$PROVISION_MARKER" "${CONFIG_DIR}/nuc-id" "${CONFIG_DIR}/nuc.env"
      ;;
    Q | '')
      exit 0
      ;;
    *)
      die "Choix invalide."
      ;;
  esac
}

show_intro() {
  cat <<'EOF'

═══════════════════════════════════════════════════════════════
 shh — provisioning NUC (Ubuntu Server amd64)

 • Installe Chromium, Xorg minimal via xinit, systemd (Restart=always + timer).
 • Le nuc_uid doit exister dans l’admin avant de lancer ce script.
 • Ré-provisionnement (profil Chromium perdu mais témoin présent) :
   voir docs/nuc-deployment.md et docs/runbook-cinema.md.
═══════════════════════════════════════════════════════════════

EOF
}

collect_params() {
  read -rp "Collez le nuc_uid (admin, obligatoire) : " NUC_UID
  NUC_UID="${NUC_UID// /}"
  [[ -n "$NUC_UID" ]] || die "nuc_uid obligatoire."

  read -rsp "auth_key (masquée, obligatoire) : " AUTH_KEY
  echo
  [[ -n "$AUTH_KEY" ]] || die "auth_key obligatoire."

  read -rp "URL API HTTPS [https://api.shh.show] : " api_in
  API_URL="${api_in:-https://api.shh.show}"

  local def_player="https://screen.shh.show"
  read -rp "URL player (interface A) [${def_player}] : " player_in
  PLAYER_URL="${player_in:-$def_player}"

  read -rp "Nom du cinéma (optionnel, pour référence locale uniquement) [] : " CINEMA_NAME
  CINEMA_NAME="${CINEMA_NAME:-}"
}

summarize_and_confirm() {
  echo
  log "Récapitulatif :"
  printf '  %-14s %s\n' nuc_uid "$NUC_UID"
  printf '  %-14s %s\n' auth_key ********
  printf '  %-14s %s\n' API_URL "$API_URL"
  printf '  %-14s %s\n' PLAYER_URL "$PLAYER_URL"
  printf '  %-14s %s\n' CINEMA_NAME "${CINEMA_NAME:-—}"
  printf '  %-14s %s\n' mode "${INSTALL_MODE:-?}"
  echo
  read -rp "Continuer ? [o/N] " ok
  [[ "${ok^^}" =~ ^O(|UI)$ ]] || { log "Annulé." && exit 0; }
}

write_config_files() {
  install -o root -g root -m 0755 -d "$CONFIG_DIR"
  printf '%s\n' "$NUC_UID" >"${CONFIG_DIR}/nuc-id"
  chmod 644 "${CONFIG_DIR}/nuc-id"

  umask 077
  {
    printf 'NUC_UID=%s\n' "$NUC_UID"
    printf 'AUTH_KEY=%s\n' "$AUTH_KEY"
    printf 'API_URL=%s\n' "$API_URL"
    printf 'PLAYER_URL=%s\n' "$PLAYER_URL"
    printf 'CINEMA_NAME=%s\n' "${CINEMA_NAME:-}"
  } >"${CONFIG_DIR}/nuc.env"
  chmod 600 "${CONFIG_DIR}/nuc.env"
  umask 022
}

install_kiosk_binary() {
  install -o root -g root -m 0755 "${TEMPLATE_DIR}/chromium-kiosk.sh" \
    /usr/local/bin/quiz-nuc-chromium-kiosk.sh
}

install_systemd_units() {
  id -u "$QUIZ_KIOSK_USER" &>/dev/null ||
    die "Utilisateur système '${QUIZ_KIOSK_USER}' introuvable (installe normalement?)."

  sed -e "s/__QUIZKIOSK_USER__/${QUIZ_KIOSK_USER}/g" "$TEMPLATE_DIR/quiz-nuc-chromium.service" \
    >/etc/systemd/system/quiz-nuc-chromium.service

  cp -f "$TEMPLATE_DIR/quiz-nuc-restart.service" /etc/systemd/system/quiz-nuc-restart.service
  cp -f "$TEMPLATE_DIR/quiz-nuc-restart.timer" /etc/systemd/system/quiz-nuc-restart.timer

  systemctl daemon-reload
  systemctl enable quiz-nuc-chromium.service
  systemctl enable --now quiz-nuc-restart.timer

  log "Démarrage du service kiosque…"
  systemctl restart quiz-nuc-chromium.service
  sleep 3
}

finalize_provision_marker() {
  log "Quand Chromium a fini la page de provisionnement et affiche la salle (ou logo d’attente) :"
  read -rp ">>> Entrée pour créer ${PROVISION_MARKER}, puis redémarrage Chromium avec PLAYER_URL racine » " _
  : >"$PROVISION_MARKER"
  chmod 644 "$PROVISION_MARKER"
  systemctl restart quiz-nuc-chromium.service
}

maybe_finalize_marker() {
  case "${INSTALL_MODE:-full}" in
    update_env) log "Marqueur de provision conservé (mode mise à jour config)." ;;
    *)
      finalize_provision_marker
      ;;
  esac
}

post_install_checks() {
  if systemctl is-active --quiet quiz-nuc-chromium.service; then
    log "quiz-nuc-chromium.service est actif."
  else
    log "Attention : quiz-nuc-chromium.service n'est pas actif — vérifiez journalctl -u quiz-nuc-chromium -b"
  fi
}

print_footer() {
  echo
  log "═══════════════════════════════════════════════════════════════"
  log "Provisioning terminé."
  log "Références fichiers :"
  log " • ${CONFIG_DIR}/nuc.env (secret, 600)"
  log " • ${CONFIG_DIR}/nuc-id"
  log " • ${PROVISION_MARKER}"
  log "Diagnostics utiles :"
  echo "   systemctl status quiz-nuc-chromium"
  echo "   journalctl -u quiz-nuc-chromium -b -n 120 --no-pager"
  echo "   systemctl list-timers quiz-nuc-restart.timer"
  echo
  systemctl list-timers quiz-nuc-restart.timer --no-pager || true
  echo
  log "En cas de souci hors ligne : docs/runbook-cinema.md (personnel lieu)."
}

install_core() {
  ensure_quiz_user
  [[ "$INSTALL_MODE" != "update_env" ]] && install_packages
  write_config_files
  install_kiosk_binary
  install_systemd_units
}

run_install_pipeline() {
  case "${INSTALL_MODE:-full}" in
    update_env)
      collect_params
      summarize_and_confirm
      write_config_files
      install_kiosk_binary
      install_systemd_units
      systemctl restart quiz-nuc-chromium.service
      post_install_checks
      print_footer
      ;;
    *)
      collect_params
      summarize_and_confirm
      install_core
      maybe_finalize_marker
      post_install_checks
      print_footer
      ;;
  esac
}

main() {
  require_root
  require_ubuntu_amd64
  INSTALL_MODE=""
  prompt_install_mode
  show_intro
  run_install_pipeline
}

main "$@"
