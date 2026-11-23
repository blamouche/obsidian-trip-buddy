#!/bin/sh
# Recopie les skills (.claude/skills, source unique, lue par Claude Code) dans .agents/skills
# (emplacement du format ouvert Agent Skills, lu par Codex / ChatGPT et d'autres agents).
# Usage : sh .github/scripts/sync-skills.sh          → recopie
#         sh .github/scripts/sync-skills.sh --check  → vérifie seulement (code 1 si différent)
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
SRC=.claude/skills
DST=.agents/skills
if [ "${1:-}" = "--check" ]; then
  if diff -rq -x .DS_Store -x __pycache__ "$SRC" "$DST" >/dev/null 2>&1; then exit 0; fi
  echo "❌ $DST diffère de $SRC : lancer sh .github/scripts/sync-skills.sh" >&2
  diff -rq -x .DS_Store -x __pycache__ "$SRC" "$DST" >&2 || true
  exit 1
fi
rm -rf "$DST"
mkdir -p "$DST"
(cd "$SRC" && tar -cf - --exclude .DS_Store --exclude __pycache__ .) | (cd "$DST" && tar -xf -)
echo "✅ $DST recopié depuis $SRC"
