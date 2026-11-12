#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

UUID="animated-wallpaper@jeremy"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

rm -rf "$DEST"
mkdir -p "$DEST"
cp -r metadata.json extension.js prefs.js lib schemas README.md "$DEST"/
glib-compile-schemas --strict "$DEST/schemas"

echo "Extension installée dans : $DEST"
echo
echo "Déconnectez-vous puis reconnectez-vous, ensuite :"
echo "  gnome-extensions enable $UUID"
