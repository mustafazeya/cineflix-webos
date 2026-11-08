#!/usr/bin/env bash
# Builds the .ipk for the TV, including js/config.local.js if present.
#   ./package.sh            -> ../com.makeflix.catalog_<version>_all.ipk
#   ./package.sh install [device] [--launch]   -> also installs (e.g. ./package.sh install my-lg-tv); --launch opens the app afterwards
#                                      tries <device> (LAN) then <device>-wifi, whichever answers
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f js/config.local.js ]; then
  echo "Note: js/config.local.js not found. The app will ask for the TMDB key in Settings."
  echo "      cp js/config.local.example.js js/config.local.js  # then edit it"
elif grep -q 'PASTE_YOUR_TMDB' js/config.local.js; then
  echo "Error: js/config.local.js still has the placeholder TMDB key." >&2
  exit 1
fi

# Stage only the files the TV app needs (server tools, docs and examples stay out of the package).
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/js"
cp -R appinfo.json index.html css icons fonts "$stage/"
mkdir -p "$stage/js/vendor"
cp js/vendor/* "$stage/js/vendor/"
for f in js/*.js; do
  case "$f" in *.example.js) ;; *) cp "$f" "$stage/js/" ;; esac
done
ares-package "$stage" -o ..

if [ "${1:-}" = "install" ]; then
  version=$(python3 -c 'import json;print(json.load(open("appinfo.json"))["version"])')
  device_args=()
  if [ -n "${2:-}" ] && [ "${2:-}" != "--launch" ]; then
    # Try the device, then any "<device>-*" alternates (e.g. my-lg-tv-wifi); use the first that answers.
    chosen=""
    for dev in $(ares-setup-device -l 2>/dev/null | awk -v d="$2" '$1==d || index($1, d"-")==1 {print $1}'); do
      hostport=$(ares-setup-device -l 2>/dev/null | awk -v d="$dev" '$1==d {print $2}' | sed 's/.*@//')
      if nc -z -G 3 "${hostport%:*}" "${hostport##*:}" 2>/dev/null; then chosen="$dev"; break; fi
      echo "  $dev (${hostport}) not reachable"
    done
    if [ -z "$chosen" ]; then
      echo "Error: no reachable TV for '$2'. Is the TV on and Developer Mode active?" >&2
      exit 1
    fi
    echo "Installing to $chosen"
    device_args=(-d "$chosen")
  fi
  ares-install ${device_args[@]+"${device_args[@]}"} "../com.makeflix.catalog_${version}_all.ipk"
  case " $* " in
    *" --launch "*) ares-launch ${device_args[@]+"${device_args[@]}"} com.makeflix.catalog ;;
  esac
fi
