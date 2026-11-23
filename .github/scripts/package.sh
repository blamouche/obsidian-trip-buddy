#!/bin/sh
# Construit le paquet d'une version : un coffre Obsidian prêt à ouvrir, zippé.
# Usage : sh .github/scripts/package.sh <version> [dossier de sortie] [étiquette de développement]
#   ex. 1.2.0 dist            → paquet de la version 1.2.0
#   ex. 1.2.0 dist dev.42-abc1234 → paquet de développement (contenu de main, pas encore publié)
# Produit : <sortie>/trip-buddy-v<version>[-<étiquette>].zip (dossier « Trip Buddy » à l'intérieur)
#           <sortie>/trip-buddy-update-v<version>[-<étiquette>].json (module + skills, pour la mise à jour depuis les réglages)
#           <sortie>/trip-buddy-skill-<nom>-v<version>[-<étiquette>].zip (un skill, à importer dans ChatGPT ou Claude)
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

# 1 bis. les skills pour Codex / ChatGPT (.agents/skills) doivent être la copie exacte de .claude/skills
sh "$ROOT/.github/scripts/sync-skills.sh" --check

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

# paquet de mise à jour : uniquement le module et les skills IA (jamais les notes ni les réglages)
UPDATE="$OUT/trip-buddy-update-v$VERSION${LABEL:+-$LABEL}.json"
python3 - "$STAGE/Trip Buddy" "$VERSION" "$UPDATE" <<'PY'
import base64, hashlib, json, os, sys, datetime
root, version, out = sys.argv[1:4]
roots = {'plugin': '.obsidian/plugins/trip-buddy', 'skills': '.claude/skills'}
skip = {'.obsidian/plugins/trip-buddy/data.json'}
files = []
for key, rel in roots.items():
    base = os.path.join(root, rel)
    for d, _, names in os.walk(base):
        for n in sorted(names):
            full = os.path.join(d, n)
            vpath = os.path.relpath(full, root).replace(os.sep, '/')
            if vpath in skip or n == '.DS_Store':
                continue
            data = open(full, 'rb').read()
            files.append({
                'path': key + '/' + os.path.relpath(full, base).replace(os.sep, '/'),
                'size': len(data),
                'sha256': hashlib.sha256(data).hexdigest(),
                'data': base64.b64encode(data).decode('ascii'),
            })
files.sort(key=lambda f: f['path'])
if not any(f['path'] == 'plugin/main.js' for f in files) or not any(f['path'] == 'plugin/manifest.json' for f in files):
    sys.exit('❌ paquet de mise à jour incomplet (main.js / manifest.json)')
json.dump({'format': 1, 'name': 'trip-buddy', 'version': version,
           'created': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
           'files': files}, open(out, 'w'), separators=(',', ':'))
print(f'   + {os.path.basename(out)} : {len(files)} fichiers')
PY
# un zip par skill (dossier du skill à la racine du zip) : import dans ChatGPT (Skills) ou Claude (Capacités)
for d in "$STAGE/Trip Buddy/.claude/skills"/*/; do
  n="$(basename "$d")"
  (cd "$STAGE/Trip Buddy/.claude/skills" && zip -rqX "$OUT/trip-buddy-skill-$n-v$VERSION${LABEL:+-$LABEL}.zip" "$n" -x '*.DS_Store' '*__pycache__*')
  echo "   + trip-buddy-skill-$n-v$VERSION${LABEL:+-$LABEL}.zip"
done
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

### 🤖 Skills IA (Claude, ChatGPT / Codex)
Les skills de planification sont déjà dans le coffre : \`.claude/skills\` pour Claude Code, \`.agents/skills\` pour Codex. Pour les importer séparément dans ChatGPT ou Claude, utilisez les fichiers **trip-buddy-skill-…zip** ci-dessous.
NOTES

echo "✅ $ZIP ($(du -h "$ZIP" | cut -f1))"
