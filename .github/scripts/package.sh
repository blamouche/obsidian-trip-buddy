#!/bin/sh
# Construit le paquet d'une version : un coffre Obsidian prêt à ouvrir, zippé.
# Usage : sh .github/scripts/package.sh <version> [dossier de sortie]   (ex. 1.2.0 dist)
# Produit : <sortie>/trip-buddy-v<version>.zip (dossier « Trip Buddy » à l'intérieur)
#           <sortie>/release-notes.md (section du CHANGELOG pour cette version)
set -eu
VERSION="${1:?Version attendue, ex. 1.2.0}"
OUT="${2:-dist}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLUGIN="$ROOT/.obsidian/plugins/trip-buddy"
cd "$ROOT"

fail() { echo "❌ $*" >&2; exit 1; }

# 1. cohérence de la version
MANIFEST_VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$PLUGIN/manifest.json" | head -1)"
[ "$MANIFEST_VERSION" = "$VERSION" ] || fail "manifest.json est en $MANIFEST_VERSION, version demandée $VERSION"
grep -q "^## \[$VERSION\]" CHANGELOG.md || fail "CHANGELOG.md n'a pas de section « ## [$VERSION] »"

# 2. le module compilé doit correspondre aux sources commitées
sh "$PLUGIN/build.sh" >/dev/null
node --check "$PLUGIN/main.js" || fail "main.js invalide"
if [ -d .git ] && ! git diff --quiet -- "$PLUGIN/main.js" "$PLUGIN/styles.css"; then
  fail "main.js / styles.css ne correspondent pas à src/ : lancer build.sh et commiter"
fi

# 3. le coffre : fichiers suivis par git (hors .github, .gitignore… marqués export-ignore)
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
STAGE="$(mktemp -d)"
git archive --format=tar --prefix="Trip Buddy/" HEAD | tar -x -C "$STAGE"
ZIP="$OUT/trip-buddy-v$VERSION.zip"
rm -f "$ZIP"
(cd "$STAGE" && zip -rqX "$ZIP" "Trip Buddy")
rm -rf "$STAGE"

# 4. notes de version = section du CHANGELOG
awk -v v="$VERSION" '
  $0 ~ "^## \\[" v "\\]" { on = 1; next }
  on && /^## \[/ { exit }
  on { print }
' CHANGELOG.md > "$OUT/release-notes.md"
cat >> "$OUT/release-notes.md" <<NOTES

---
### 📦 Installation
1. Téléchargez **trip-buddy-v$VERSION.zip** ci-dessous et décompressez-le.
2. Dans Obsidian : *Ouvrir un dossier comme coffre* → choisissez le dossier **Trip Buddy**.
3. À la question d'Obsidian, cliquez **Faire confiance à l'auteur et activer les plugins** : l'accueil du voyage s'ouvre.

Le coffre contient un voyage d'exemple fictif ; pour partir de zéro : commande *Trip Buddy : Vider les données d'exemple (nouveau voyage)*.
NOTES

echo "✅ $ZIP ($(du -h "$ZIP" | cut -f1))"
