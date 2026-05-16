#!/usr/bin/env bash
# Charge .env sans eval/source shell : valeurs avec espaces ou métacaractères restent littérales.
# Usage : depuis la racine du repo (là où se trouve .env), après normalisation CRLF si besoin.
# À sourcer (.) depuis le déploiement — pas en sous-processus, sinon les export ne survivent pas.

ENV_FILE="${1:-.env}"

set -a
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    '' | '#'*) continue ;;
  esac
  [[ "$line" == *'='* ]] || continue

  key="${line%%=*}"
  val="${line#*=}"
  [[ -n "$key" ]] || continue

  len=${#val}
  if ((len >= 2)); then
    first="${val:0:1}"
    last="${val:len - 1:1}"
    if [[ "$first" == '"' && "$last" == '"' ]]; then
      val="${val:1:len - 2}"
    elif [[ "$first" == "'" && "$last" == "'" ]]; then
      val="${val:1:len - 2}"
    fi
  fi

  export "${key}=${val}"
done <"$ENV_FILE"
set +a
