#!/bin/sh
# Prépare et publie une nouvelle version : CHANGELOG, numéro de version, build, commit, tag, push.
# Le push du tag déclenche .github/workflows/release.yml, qui publie le paquet sur GitHub Releases.
# Usage : sh .github/scripts/release.sh <version>   (ex. 1.2.0)
set -eu
VERSION="${1:?Version attendue, ex. 1.2.0}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLUGIN="$ROOT/.obsidian/plugins/trip-buddy"
cd "$ROOT"
fail() { echo "❌ $*" >&2; exit 1; }

echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || fail "version au format X.Y.Z attendue"
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || fail "à lancer depuis la branche main"
[ -z "$(git status --porcelain)" ] || fail "des modifications ne sont pas commitées"
git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null && fail "le tag v$VERSION existe déjà"

# CHANGELOG : la section « Non publié » devient la section de la version (sauf si elle existe déjà)
if ! grep -q "^## \[$VERSION\]" CHANGELOG.md; then
  python3 - "$VERSION" <<'PY'
import sys, re, datetime
v = sys.argv[1]
s = open('CHANGELOG.md', encoding='utf-8').read()
m = re.search(r'^## \[Non publié\]\n(.*?)(?=^## \[|\Z)', s, re.S | re.M)
if not m or not m.group(1).strip():
    sys.exit('❌ La section « ## [Non publié] » du CHANGELOG est vide : décrire les changements avant de publier')
today = datetime.date.today().isoformat()
new = f'## [Non publié]\n\n## [{v}] - {today}\n{m.group(1).rstrip()}\n\n'
open('CHANGELOG.md', 'w', encoding='utf-8').write(s[:m.start()] + new + s[m.end():])
PY
fi

# numéro de version : manifest du module + mode d'emploi
sed -i.bak "s/\"version\": *\"[^\"]*\"/\"version\": \"$VERSION\"/" "$PLUGIN/manifest.json" && rm "$PLUGIN/manifest.json.bak"
sed -i.bak "s/version [0-9][0-9.]*, Obsidian/version $VERSION, Obsidian/" README.md && rm README.md.bak

# build + vérifications, puis paquet de contrôle en local (non commité)
sh "$PLUGIN/build.sh" >/dev/null
node --check "$PLUGIN/main.js"
git add -A
git diff --cached --quiet || git commit -q -m "Version $VERSION"
sh .github/scripts/package.sh "$VERSION" "$(mktemp -d)"

git tag -a "v$VERSION" -m "Trip Buddy $VERSION"
git push -q origin main "v$VERSION"
echo "🚀 v$VERSION poussée : le paquet sera publié par GitHub Actions"
echo "   https://github.com/blamouche/obsidian-trip-buddy/releases/tag/v$VERSION"
