# Consignes pour les agents (Codex, ChatGPT, Copilot…)

Ce coffre Obsidian sert à préparer et vivre un voyage avec le module **Trip Buddy**.

**Les consignes complètes sont dans [CLAUDE.md](CLAUDE.md)** : elles valent pour tous les agents, pas seulement Claude. Les lire avant toute action et les appliquer (tout en français, `CONTEXT.md` source de vérité du voyage, informations vérifiées et datées, rien de supprimé définitivement, formats des notes, réglages dans `trip-buddy.json`, données personnelles jamais envoyées à l'extérieur…).

## Skills

Les skills de planification sont au format ouvert *Agent Skills* :
- `.agents/skills/` — pour Codex et les agents qui suivent ce format ;
- `.claude/skills/` — la même chose pour Claude Code. **C'est la source** : on ne modifie que ce dossier, puis on recopie avec `sh .github/scripts/sync-skills.sh`.

1. **`travel-context`** — interview de l'utilisateur → `CONTEXT.md`.
2. **`travel-planner`** — agenda vérifié → `06 Programme/`, fiches des lieux → `05 POI/`, guide → `08 Guide/`.

Scripts, à lancer depuis la racine du coffre :
```bash
python3 .agents/skills/travel-planner/scripts/check.py --vault .
python3 .agents/skills/travel-planner/scripts/geocode.py --vault . --context "<ville, pays>"
```
