#!/usr/bin/env bash
# Lancement Chromium kiosque (client X11 pour xinit). Ne pas modifier sur la machine : source = repo.
#
# Flux URL : tant que /etc/quiz-app/provisioned est absent → /provision avec nuc_uid et auth_key
# (première navigation ou ré-provision). Une fois le marqueur posé → PLAYER_URL racine (/).
#
# Dépendances : paquets chromium + unclutter + xinit (voir provision-nuc.sh).

set -euo pipefail

set -a
# shellcheck disable=SC1091
source /etc/quiz-app/nuc.env
set +a

urlencode() {
  python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$1"
}

detect_chromium() {
  local c
  c=$(command -v chromium-browser 2>/dev/null || true)
  [[ -n "$c" ]] && echo "$c" && return
  c=$(command -v chromium 2>/dev/null || true)
  [[ -n "$c" ]] && echo "$c" && return
  echo >&2 "[quiz-kiosk] binaire chromium introuvable"
  exit 1
}

CHROMIUM_BIN=$(detect_chromium)

# Masquer curseur ; réduire veille écran sous X si xset disponible.
if command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 0 -root &
fi

if command -v xset >/dev/null 2>&1; then
  xset s off >/dev/null 2>&1 || true
  xset -dpms >/dev/null 2>&1 || true
  xset s noblank >/dev/null 2>&1 || true
fi

BASE_URL="${PLAYER_URL%/}"

if [[ -f /etc/quiz-app/provisioned ]]; then
  APP_URL="${BASE_URL}/"
else
  APP_URL="${BASE_URL}/provision?nuc_uid=$(urlencode "${NUC_UID}")&auth_key=$(urlencode "${AUTH_KEY}")"
fi

exec "${CHROMIUM_BIN}" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-translate \
  --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --disable-features=HeavyAdIntervention \
  "--app=${APP_URL}"
