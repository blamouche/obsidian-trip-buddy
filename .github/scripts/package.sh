#!/bin/sh
# Construit le paquet d'une version : un coffre Obsidian prêt à ouvrir, zippé.
# Usage : sh .github/scripts/package.sh <version> [dossier de sortie] [étiquette de développement]
#   ex. 1.2.0 dist            → paquet de la version 1.2.0
#   ex. 1.2.0 dist dev.42-abc1234 → paquet de développement (contenu de main, pas encore publié)
# Produit : <sortie>/trip-buddy-v<version>[-<étiquette>].zip (dossier « Trip Buddy » à l'intérieur)
#           <sortie>/release-notes.md (section du CHANGELOG : la version, ou « Non publié » en développement)
set -eu
VERSION="${1:?Version attendue, ex. 1.2.0}"
OUT="${2:-dist}"
LABEL="${3:-}"
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
NAME="trip-buddy-v$VERSION${LABEL:+-$LABEL}"
ZIP="$OUT/$NAME.zip"
echo "$NAME" > "$OUT/package-name.txt"
rm -f "$ZIP"
(cd "$STAGE" && zip -rqX "$ZIP" "Trip Buddy")
rm -rf "$STAGE"

# 4. notes de version = section du CHANGELOG
SECTION="$VERSION"
[ -n "$LABEL" ] && SECTION="Non publié"
{
  if [ -n "$LABEL" ]; then
    echo "> ⚠️ **Version de développement**, construite automatiquement à partir de la branche \`main\` (après la $VERSION). Elle peut contenir des nouveautés inachevées : pour un usage normal, préférez la [dernière version publiée](https://github.com/blamouche/obsidian-trip-buddy/releases/latest)."
    echo
    echo "**Changements depuis la $VERSION :**"
  fi
  awk -v v="$SECTION" '
  index($0, "## [" v "]") == 1 { on = 1; next }
  on && /^## \[/ { exit }
  on { print }
' CHANGELOG.md
} > "$OUT/release-notes.md"
cat >> "$OUT/release-notes.md" <<NOTES

---
### 📦 Installation
1. Téléchargez **$NAME.zip** ci-dessous et décompressez-le.
2. Dans Obsidian : *Ouvrir un dossier comme coffre* → choisissez le dossier **Trip Buddy**.
3. À la question d'Obsidian, cliquez **Faire confiance à l'auteur et activer les plugins** : l'accueil du voyage s'ouvre.

Le coffre contient un voyage d'exemple fictif ; pour partir de zéro : commande *Trip Buddy : Vider les données d'exemple (nouveau voyage)*.
NOTES

echo "✅ $ZIP ($(du -h "$ZIP" | cut -f1))"
