# Consignes pour les agents — coffre Trip Buddy

Ce dossier est un **coffre Obsidian** qui sert à préparer et vivre **un voyage à la fois**, piloté par le plugin maison **Trip Buddy**. Le mode d'emploi complet (fonctionnalités, propriétés de chaque type de note, blocs, commandes) est dans [README.md](README.md) : le lire avant de toucher à un format de note.

## Règles générales

- **Tout en français** : conversation, notes, propriétés lisibles, messages. Ton chaleureux et concret, comme les notes existantes.
- **`CONTEXT.md` est la source de vérité du voyage en cours** (destination, dates, voyageurs, objectifs, goûts, rejets, centres d'intérêt). Le lire avant toute proposition liée au voyage ; ne pas le réécrire hors du skill `travel-context` sans accord de l'utilisateur.
- **Informations vérifiées** : horaires, jours d'ouverture, tarifs, accès, règles locales sont vérifiés sur des sources fiables et récentes, **pour les dates exactes du voyage**, sourcés (liens) et datés (« vérifié le JJ/MM/AAAA »). Ce qui n'est pas confirmé est marqué **⚠️ à vérifier**. Ne jamais inventer.
- **Ne rien supprimer définitivement** : ce qui doit disparaître va dans la corbeille du coffre `.trash/` (Obsidian l'utilise aussi), suffixé du nom du voyage si besoin. Seule exception, voulue par l'utilisateur : la commande *Vider les données d'exemple* du plugin, qui vide `.trash` à la fin (un agent ne vide jamais `.trash` lui-même).
- Les données personnelles des voyageurs (noms, réservations, documents de `01 Documents`) restent dans le coffre : ne jamais les envoyer à un service extérieur (géocodage, recherche web…).

## Organisation du coffre

| Emplacement | Contenu | Format |
| --- | --- | --- |
| `00 Accueil.md` | Tableau de bord + *Notes rapides* | ne pas toucher aux blocs |
| `01 Documents/` | Billets, réservations, PDF ; `Photos/` (pièces jointes), `Photos/POI/` (photos des lieux), `Traces/` (GPX) | fichiers |
| `02 Journal/` | Une note par jour `AAAA-MM-JJ.md` | `type: journal` — modèle `99 Modèles/Journal.md` |
| `03 Budget/Budget.md` | Tableau *🧾 Dépenses* = source des données | voir README § Budget |
| `04 Packing/Packing list.md` | `## Catégorie` puis `- [ ] élément` | |
| `05 POI/` | Une note par lieu + `Index des POI.md` | `type: poi` — modèle `99 Modèles/POI.md` |
| `06 Programme/` | Une note par jour `Programme AAAA-MM-JJ.md` + `Programme.md` | `type: programme`, `pois` = liens ordonnés |
| `07 Carte/` | Carte de tous les lieux | |
| `08 Guide/` | Pages du guide + `Guide.md` (index, ne pas modifier) | `type: guide`, `guide`, `order`, `icon`, `summary` |
| `99 Modèles/` | Modèles de notes et de valises (ignorés par le plugin) | |
| `CONTEXT.md` | Contexte du voyage (skill `travel-context`) | |
| `trip-buddy.json` | Réglages du module (modifiables par les agents) | JSON |
| `.trip-planner/` | Travail intermédiaire du skill `travel-planner` (caché dans Obsidian) | |
| `.claude/skills/` | Skills de planification | |

Les dossiers réels sont définis dans les réglages (`folders` et `files` de `trip-buddy.json`, à la racine) : s'y fier s'ils diffèrent de ce tableau.

### Conventions des notes
- Les notes du plugin commencent par des **propriétés YAML**, puis les blocs de code `tripbuddy-nav` et le bloc propre au type (`tripbuddy-poi`, `tripbuddy-program`, `tripbuddy-journal-day`, `tripbuddy-guide` avec `mode: pager`…). Ne jamais retirer ces blocs : c'est eux qui affichent l'interface.
- Partir du **modèle** de `99 Modèles/` (ou des gabarits de `.claude/skills/travel-planner/references/`) plutôt que d'inventer une structure.
- **Noms de fichiers = noms des lieux** : les liens `[[Nom]]` des programmes et des pages pointent vers `05 POI/<Nom>.md`. Renommer un lieu impose de mettre à jour tous les liens.
- `category` d'un POI = **identifiant** d'une catégorie de `poiCategories` dans `trip-buddy.json` (`restaurant`, `cafe`, `point-de-vue`…).
- Les sections libres (*Mes notes*, *Notes & réservations*, *Notes rapides*, *Idées en vrac*, sections du journal) appartiennent à l'utilisateur : les compléter, ne pas les écraser.

## Plugin Trip Buddy (`.obsidian/plugins/trip-buddy/`)

- **Réglages = `trip-buddy.json` à la racine du coffre** (nom, dates, voyageurs, dossiers, catégories, carte, affichage… ; clés : README § *Le fichier trip-buddy.json*). Les agents peuvent le modifier directement : Obsidian le recharge tout seul. Changer seulement les clés utiles, garder un JSON valide (vérifier avec `python3 -m json.tool trip-buddy.json`), faire valider par l'utilisateur les changements qui touchent au voyage (`trip`). Ne jamais modifier `.obsidian/plugins/trip-buddy/data.json` : c'est une copie de secours, écrasée par le module.
- **Code** : modifier uniquement `src/*.js` et `src/styles.css`, jamais `main.js` ni `styles.css` (générés). Puis reconstruire et vérifier :
  ```bash
  sh .obsidian/plugins/trip-buddy/build.sh && node --check .obsidian/plugins/trip-buddy/main.js
  ```
  L'utilisateur doit ensuite recharger le plugin dans Obsidian (désactiver / réactiver) : le signaler.
- Rôle de chaque fichier source : README § *Développement du module*. Mettre à jour le README quand un comportement visible change.
- **Nouveau voyage** : la commande *« Trip Buddy : Vider les données d'exemple (nouveau voyage) »* efface **définitivement** (via `.trash`, vidée à la fin) **tout le contenu** des dossiers documents, journal, POI, programme et guide (sauf les pages d'index et les pages standard du guide, remises à blanc), `CONTEXT.md` et `.trip-planner/`, vide les sections libres (Notes rapides, Idées en vrac…), retire les réseaux de transports, supprime les cartes hors ligne de l'appareil, retire le bandeau « Voyage d'exemple » de l'accueil (`demo: false`), renomme le voyage « My trip » 🧳 et remet participants, destination, dates et budgets à zéro, vide le budget, décoche la valise et remet le guide à blanc. Toute nouvelle donnée propre à un voyage créée par un skill doit être ajoutée à ce nettoyage (`SKILL_DATA` dans `src/00-core.js`, `resetSkillData` dans `src/90-plugin.js`).

## Versions (dépôt GitHub public `blamouche/obsidian-trip-buddy`)

- Toute modification visible (module, skills, modèles, coffre d'exemple) s'ajoute à la section `## [Non publié]` de `CHANGELOG.md` (*Ajouté* / *Modifié* / *Corrigé* / *Retiré*), en français.
- Publier une version = `sh .github/scripts/release.sh X.Y.Z` (seulement à la demande de l'utilisateur) : met à jour CHANGELOG, `manifest.json` et le README, construit, commite, tague `vX.Y.Z` et pousse ; GitHub Actions publie alors le paquet `trip-buddy-vX.Y.Z.zip` (coffre prêt à ouvrir) sur Releases. Détails : README § *Versions et paquets*.
- **Réglages du module** : un nouveau réglage s'ajoute dans `DEFAULT_SETTINGS` (`src/00-core.js`) et n'a pas besoin de migration. Renommer, déplacer ou changer le format d'un réglage existant, ou ajouter un élément par défaut à une liste (catégories…), impose une migration dans `src/02-settings-migrations.js` (incrémenter `SETTINGS_VERSION`, ajouter l'étape à `SETTINGS_MIGRATIONS`, idempotente) pour que les coffres déjà installés suivent. Ne jamais retirer `settingsVersion` de `trip-buddy.json`.
- **Aide visuelle** (`src/46-help.js`) : un nouveau bloc `tripbuddy-*` ajoute ses aides dans `HELP_SPOTS` (clé = nom de sa classe ; une aide par zone, repérée par un sélecteur CSS) ; une nouvelle zone réglable d'un bloc existant y ajoute son aide ; une nouvelle section de réglages ajoute son titre exact dans `SETTINGS_SECTIONS` (ancre des liens « → réglages ») ; un réglage déplacé met à jour les liens qui y mènent.
- Le bouton *Mettre à jour* des réglages (`src/18-updater.js`) ne remplace que le dossier du module (sauf `data.json`) et les skills livrés de `.claude/skills` : tout nouveau fichier du module ou des skills doit rester dans ces dossiers ; ne jamais y ranger de données du voyage.
- Le dépôt est **public** : ne jamais commiter de vraies données de voyage ni de données personnelles (le coffre d'exemple est fictif).

## Skills de planification (`.claude/skills/`)

Ils s'enchaînent ; chacun lit ce que le précédent a produit.

1. **`travel-context`** — interview de l'utilisateur → `CONTEXT.md`.
2. **`travel-planner`** — à partir de `CONTEXT.md`, avec des sous-agents : agenda vérifié et validé jour par jour → `06 Programme/` ; fiches de lieux détaillées → `05 POI/` ; guide sur mesure → `08 Guide/`. Scripts utiles, à lancer depuis la racine du coffre :
   ```bash
   python3 .claude/skills/travel-planner/scripts/check.py --vault .
   python3 .claude/skills/travel-planner/scripts/geocode.py --vault . --context "<ville, pays>"
   ```
   `check.py` contrôle la cohérence des fiches, programmes et pages du guide : le lancer après toute création ou modification en masse de notes.

Un nouveau skill du set : dossier `.claude/skills/<nom>/` avec `SKILL.md` (en français), lit `CONTEXT.md`, écrit au format des notes existantes, garde son travail intermédiaire dans `.trip-planner/`, et est ajouté à la liste ci-dessus.
