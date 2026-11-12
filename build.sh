#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

UUID="animated-wallpaper@jeremy"
DIST="dist"

rm -rf "$DIST"
mkdir -p "$DIST"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/lib" "$STAGE/schemas"

cp metadata.json extension.js prefs.js "$STAGE"/
cp lib/*.js "$STAGE/lib"/
cp schemas/org.gnome.shell.extensions.animated-wallpaper.gschema.xml "$STAGE/schemas"/

# Valide le schéma puis retire le binaire compilé : GNOME 45+ le régénère
# à l'installation, et le guide de revue demande de ne pas le livrer.
glib-compile-schemas --strict "$STAGE/schemas"
rm -f "$STAGE/schemas/gschemas.compiled"

cp LICENSE "$STAGE"/

OUT="$(pwd)/$DIST/$UUID.zip"
(
    cd "$STAGE"
    zip -qr "$OUT" \
        metadata.json extension.js prefs.js lib schemas LICENSE
)

echo "Paquet prêt pour extensions.gnome.org :"
echo "  $OUT"
