---
name: travel-planner
description: Planifie un voyage dans le coffre Trip Buddy à partir de CONTEXT.md, en trois séquences (avec des sous-agents quand l'agent en dispose) — (1) un agenda jour par jour vérifié (heures d'arrivée et de départ, horaires et jours d'ouverture, temps de trajet, réservations), proposé puis validé avec l'utilisateur et écrit dans 06 Programme ; (2) les fiches POI détaillées (description, horaires, tarifs, site web, histoire et culture) pour le programme et pour tous les centres d'intérêt ; (3) un guide de voyage sur mesure dans 08 Guide. À utiliser quand l'utilisateur veut « planifier le voyage », « faire le programme », « préparer l'agenda », « créer les POI / les lieux », « rédiger le guide », ou relancer une seule de ces séquences.
---

# travel-planner

Deuxième skill du set de planification (après `travel-context`). Il transforme `CONTEXT.md` en un voyage prêt à vivre dans Trip Buddy : programme, lieux et guide.

Toute la conversation et tous les fichiers sont **en français**. Tout ce qui est écrit doit être **vérifié** (horaires, jours d'ouverture, tarifs, accès) sur des sources fiables et récentes, sourcé, et daté (« vérifié le JJ/MM/AAAA »). Ce qu'on n'a pas pu vérifier est marqué **⚠️ à vérifier**, jamais inventé.

## Compatibilité (Claude, ChatGPT / Codex)

Ce skill suit le format ouvert *Agent Skills* : il fonctionne avec Claude Code comme avec Codex (ChatGPT). Il a besoin de **lire et écrire les fichiers du coffre**, de **lancer Python** et d'**accéder au web** : l'utiliser dans un agent qui travaille dans le dossier du coffre.
- **Dossier du skill** : `<skill>` désigne le dossier de ce skill — `.claude/skills/travel-planner` (Claude Code) ou `.agents/skills/travel-planner` (Codex) ; les deux contiennent les mêmes fichiers. Les commandes se lancent depuis la racine du coffre.
- **Sous-agents** : Claude Code → outil Agent (`subagent_type: general-purpose`), plusieurs appels dans **un seul message** pour qu'ils tournent en parallèle ; Codex → ses sous-agents ou tâches parallèles s'il en dispose. Sinon, faire le même travail soi-même, séquentiellement.
- **Questions à choix** — quand ce document indique *(choix)* ou *(choix multiple)* : outil de questions à choix de l'agent (AskUserQuestion dans Claude Code), sinon **liste numérotée** en laissant répondre librement.
- **Sans accès au web** : rien ne peut être vérifié ; tout marquer **⚠️ à vérifier** et le dire à l'utilisateur.

## Séquences et arguments

| Séquence | Ce qu'elle produit | Validation utilisateur |
| --- | --- | --- |
| 0. Préparation | Logistique confirmée, coffre prêt | Heures d'arrivée / départ, hébergement |
| 1. Agenda | `06 Programme/Programme AAAA-MM-JJ.md` | **Agenda validé jour par jour** |
| 2. Lieux (POI) | `05 POI/<Nom>.md` + photos | Liste des lieux, catégories, photos |
| 3. Guide | `08 Guide/*.md` | Liste des pages |

Sans argument : enchaîner 0 → 1 → (2 et 3 en parallèle). Avec un argument (`agenda`, `poi`, `guide`), ne lancer que cette séquence (la 0 est toujours faite, en version courte si `.trip-planner/logistique.md` existe déjà).

## Fichiers de travail

Tout le travail intermédiaire va dans **`.trip-planner/`** à la racine du coffre (dossier caché, ignoré par Obsidian, conservé d'une session à l'autre pour reprendre là où on s'était arrêté) :

```
.trip-planner/
  logistique.md        # arrivée, départ, hébergement, transports réservés
  pratique.md          # lever/coucher du soleil, fériés, événements, météo de saison
  candidats/<theme>.md # repérages des sous-agents (lieux vérifiés)
  agenda.md            # agenda en cours de discussion puis validé
  verification.md      # rapport du vérificateur
  poi-liste.md         # liste des lieux à créer (séquence 2)
```

Au démarrage, si `.trip-planner/` existe, le lire et proposer de **reprendre** (dire où on en était) ou de repartir de zéro (déplacer l'ancien dossier dans `.trash/trip-planner - <nom du voyage>`).

## Sous-agents

Lancer les agents indépendants **en parallèle** (voir *Compatibilité*). Chaque brief :
- indique le fichier de consignes à lire (`<skill>/references/…`, avec le vrai chemin du dossier du skill) et `CONTEXT.md` ;
- donne la part de travail précise (thème, lieux, pages), les dates exactes du voyage et la date du jour ;
- dit où écrire le résultat et demande en retour un résumé court (ce qui est fait, ce qui reste ⚠️).

Rester sous une dizaine d'agents par vague. Sans sous-agents, faire le même travail soi-même, séquentiellement. Toujours relire ce que les agents ont produit avant de le présenter à l'utilisateur : leur résumé n'est pas une preuve.

---

## 0. Préparation

1. **Lire `CONTEXT.md`**. S'il n'existe pas, lancer d'abord le skill `travel-context`. Lire aussi `trip-buddy.json` à la racine du coffre (réglages du module : clés `trip`, `folders`, `files`, `poiCategories`). On peut le modifier (voir `CLAUDE.md` / `AGENTS.md`), jamais `.obsidian/plugins/trip-buddy/data.json`.
2. **Logistique indispensable** pour un agenda fiable. Demander ce qui manque (dans `CONTEXT.md` ou `01 Documents`, chercher d'abord billets et réservations) :
   - **arrivée** : date, heure, mode et lieu (gare, aéroport, voiture) ;
   - **départ** : date, heure, mode et lieu ;
   - **hébergement** : nom et adresse (ou quartier visé si pas encore réservé), heure d'arrivée possible, consigne à bagages ;
   - réservations déjà prises (spectacles, restaurants, visites) avec leurs horaires.
   Écrire le tout dans `.trip-planner/logistique.md`.
3. **État du coffre** : si `05 POI`, `06 Programme`, `02 Journal` ou `08 Guide` contiennent encore un autre voyage (destination différente de `CONTEXT.md`), demander à l'utilisateur de lancer la commande *« Trip Buddy : Vider les données d'exemple (nouveau voyage) »* avant de continuer. Si la clé `trip` de `trip-buddy.json` ne correspond pas à `CONTEXT.md` (nom, destination, dates, voyageurs, devise), proposer les valeurs et, après accord, les y écrire. Les dates des réglages pilotent le bandeau de jours du programme.

## 1. Agenda

Consignes détaillées : [references/agenda.md](references/agenda.md).

1. **Repérage (vague parallèle)**. Découper le travail en 4 à 8 agents selon la destination et `CONTEXT.md`, par exemple :
   - *Infos pratiques* → `.trip-planner/pratique.md` : lever/coucher du soleil chaque jour, jours fériés et fermetures exceptionnelles, événements pendant le séjour, météo de saison, trajet arrivée → hébergement.
   - *Incontournables et culture* : monuments, musées, points de vue, quartiers.
   - *Gastronomie* : restaurants, cafés et pâtisseries, marchés, bars — selon les goûts et le régime alimentaire.
   - *Nature et plein air* : parcs, plages, balades (si pertinent).
   - **Un agent par centre d'intérêt** de `CONTEXT.md` (propriété `interests`), ou par groupe de petits centres d'intérêt.
   Chacun écrit `.trip-planner/candidats/<theme>.md` au format de `references/agenda.md`, avec les horaires **pour les dates exactes du voyage**.
2. **Composition**. Construire soi-même l'agenda dans `.trip-planner/agenda.md` à partir des candidats, en suivant les règles de `references/agenda.md` : arrivée et départ, ouverture le jour J, regroupement géographique, rythme, repas aux heures locales, réservations, variantes et plan B.
3. **Vérification indépendante**. Lancer **un agent vérificateur** qui n'a pas composé l'agenda : il reprend chaque créneau, revérifie les horaires sur les sources, les temps de trajet et les marges, et écrit `.trip-planner/verification.md`. Corriger chaque ⚠️ ; relancer une vérification ciblée si une journée a beaucoup changé.
4. **Proposition à l'utilisateur**, **jour par jour** : tableau horaire, ce qu'il faut réserver, variantes. Après chaque journée, demander *(choix)* : *Valider* / *Modifier* (l'utilisateur précise en « Autre »). Appliquer les modifications, revérifier ce qui a changé, représenter. Ne passer à la suite qu'une fois **tous les jours validés**.
5. **Écriture** : une note `06 Programme/Programme AAAA-MM-JJ.md` par jour, au format décrit dans `references/agenda.md`. Les liens `[[…]]` de la propriété `pois` utilisent les **noms exacts** des futures fiches POI (même orthographe que dans `poi-liste.md`). Marquer l'agenda comme validé en tête de `.trip-planner/agenda.md`.

## 2. Lieux (POI) et 3. Guide

Une fois l'agenda validé, préparer les deux séquences, faire valider leurs listes, puis lancer **leurs agents dans la même vague**.

### Préparer les lieux — consignes : [references/poi.md](references/poi.md)
1. Dresser `.trip-planner/poi-liste.md` : **tous les lieux de l'agenda** (hébergement et gares/aéroports compris), **les variantes et plans B**, puis une **sélection par catégorie** parmi les candidats non retenus : Restaurant, Café & pâtisserie, Marché, Quartier, Monument, Musée, Point de vue, Nature & parc, Plage, Shopping, Bar, Hébergement, Transport, **et une catégorie par centre d'intérêt** (chapeliers, magasins de guitares, théâtres, cinémas…). Ordre de grandeur : 3 à 8 lieux par catégorie selon la durée du voyage ; davantage pour les centres d'intérêt *incontournables*. Ignorer les lieux déjà présents dans `05 POI` (les mettre à jour plutôt que les dupliquer).
2. Montrer à l'utilisateur le **nombre de lieux par catégorie** (et la liste sur demande) ; ajuster.
3. **Catégories** : comparer avec `poiCategories`. Pour chaque catégorie manquante, proposer emoji, libellé, identifiant et couleur, et les faire valider par l'utilisateur. Puis les ajouter à la fin de la liste `poiCategories` de `trip-buddy.json` (objets `{ "id", "label", "icon", "color" }`, `id` en minuscules sans accents ni espaces, unique ; couleur `#rrggbb` distincte des autres), sans toucher aux catégories existantes, et vérifier que le JSON reste valide (`python3 -m json.tool trip-buddy.json`).
4. **Photos** : demander une fois si l'on peut télécharger une photo libre de droits par lieu depuis **Wikimedia Commons** (dans `01 Documents/Photos/POI`). Sans accord, pas de photo.

### Préparer le guide — consignes : [references/guide.md](references/guide.md)
1. Pages génériques : 🚇 Transports, 🍽️ Nourriture, 🗣️ La langue, 🏛️ Histoire, 💶 Pourboires, 🛡️ Sécurité et arnaques, 🎉 Fêtes, 🎟️ Événements, 🔌 Électronique, 📞 Numéros utiles, 🛂 Formalités. Les numéros utiles et les formalités vont **dans le guide**, plus dans la page Documents.
2. Proposer *(choix multiple)* 2 à 5 **pages propres à la destination** et aux voyageurs : santé et vaccins (si les formalités ne suffisent pas), argent et change, climat et que mettre dans la valise, savoir-vivre et coutumes, conduite et location de voiture, plages et baignade, randonnée et sécurité en montagne, avec des enfants, shopping et artisanat, ou une page dédiée à un centre d'intérêt (« Guitares à Séville »)…
3. Si une page de `08 Guide` contient déjà du contenu pour **ce** voyage, demander avant de l'écraser.

### Lancer la vague
- **POI** : un agent par lot de 6 à 10 lieux, regroupés par catégorie ou par quartier. Chacun écrit les fiches directement dans `05 POI` **et les géolocalise** avant de rendre la main (`<skill>/scripts/geocode.py --only …`, puis contrôle de chaque résultat et correction avec `--set` ; voir `references/poi.md`). Le script partage un verrou entre agents : la limite d'une requête par seconde de Nominatim est respectée même en parallèle.
- **Guide** : un agent par page ou par paire de pages courtes.
- Tout lancer **en parallèle** (un seul message dans Claude Code).

### Finaliser
1. **Géolocalisation — filet de sécurité** : relancer le script sur tout le coffre ; il ne traite que les fiches encore sans coordonnées (normalement aucune) :
   ```bash
   python3 <skill>/scripts/geocode.py --vault . --context "<ville, pays>"
   ```
   Pour chaque échec ou résultat douteux (« ⚠ à N km des autres lieux »), trouver les coordonnées exactes (site officiel, Wikipédia, OpenStreetMap) et les écrire avec `geocode.py --vault . --set "Nom" <lat> <lon>`.
2. **Contrôle** :
   ```bash
   python3 <skill>/scripts/check.py --vault .
   ```
   Il vérifie les propriétés des fiches (type, catégorie connue, coordonnées, lieux éloignés des autres), que chaque lien des programmes mène à une fiche, et les propriétés des pages du guide. Corriger tout ce qu'il signale.
3. **Bilan à l'utilisateur** : nombre de fiches par catégorie, pages du guide créées, liste de ce qui reste **⚠️ à vérifier**, et **à réserver** (récapitulatif de tous les programmes avec dates limites si connues). Rappeler d'ouvrir [[00 Accueil]] et la carte pour contrôler visuellement.
