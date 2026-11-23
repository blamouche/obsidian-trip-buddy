---
name: travel-context
description: Crée ou met à jour le fichier CONTEXT.md à la racine du coffre Trip Buddy en interviewant l'utilisateur sur son nouveau voyage — destination, dates et durée, participants (solo, couple, famille, amis…), objectifs, ce qu'il aime et ce qu'il n'aime pas, centres d'intérêt et types de lieux qu'il aime dénicher (pâtisseries, chapeliers, magasins de guitares, théâtres, cinémas…). À utiliser au démarrage de la préparation d'un voyage, quand l'utilisateur dit « nouveau voyage », « on part à… », « aide-moi à préparer mon voyage », « mets à jour le contexte du voyage », ou quand un autre skill de planification a besoin de CONTEXT.md et qu'il n'existe pas encore.
---

# travel-context

Premier skill du set de planification de voyage. Son rôle : **comprendre le voyage et la façon de voyager des participants**, puis tout consigner dans `CONTEXT.md` à la racine du coffre. Ce fichier est la source de vérité que les autres skills (programme, lieux, budget, valise…) lisent avant de proposer quoi que ce soit.

Toute la conversation se fait **en français**, sur un ton chaleureux et concret.

## 1. Avant de poser des questions

1. **Vérifier si `CONTEXT.md` existe** à la racine du coffre.
   - S'il existe : le lire, résumer en 3-4 lignes ce qu'il contient, puis demander (AskUserQuestion) : *Mettre à jour ce voyage* / *Repartir de zéro pour un nouveau voyage*. En mise à jour, ne reposer que les questions dont la réponse manque, est floue, ou que l'utilisateur veut changer. Pour repartir de zéro, copier l'ancien fichier dans `.trash/CONTEXT - <nom du voyage>.md` avant de l'écraser.
2. **Lire les réglages Trip Buddy** dans `trip-buddy.json` (racine du coffre), clé `trip` (`name`, `destination`, `start`, `end`, `travelers`, `currency`, `budget`, `emoji`). S'ils décrivent déjà le voyage, s'en servir pour **proposer** des réponses (« J'ai vu Barcelone du 20 au 22 novembre avec Camille et Thomas — c'est bien ce voyage ? ») plutôt que de redemander. Attention : le coffre peut encore contenir le voyage d'exemple ou le voyage précédent ; toujours faire confirmer.
   - Ne jamais modifier `.obsidian/plugins/trip-buddy/data.json` (simple copie de secours). Les réglages se mettent à jour dans `trip-buddy.json`, à la fin de l'interview (voir § 4).

## 2. L'interview

Poser les questions **par petits groupes** (2 à 4 à la fois), jamais un long questionnaire d'un bloc. Utiliser **AskUserQuestion** dès que les réponses se prêtent à des choix (options + « Autre » automatique), et des questions ouvertes en texte pour le reste. Rebondir sur les réponses : une précision intéressante mérite une question de relance, une réponse vague mérite un exemple (« plutôt musées le matin et terrasse l'après-midi ? »).

### Tour 1 — Le voyage
- **Lieu** : pays, ville(s) ou région(s). Voyage itinérant ou point de chute unique ? Destination déjà choisie ou encore à arbitrer entre plusieurs options (dans ce cas, noter les options et les critères de choix) ?
- **Dates et durée** : dates précises si connues (sinon période/saison approximative) et nombre de jours/nuits. Calculer la durée soi-même à partir des dates.
- **Déjà venus ?** Première fois sur place ou destination connue (et qu'ont-ils déjà vu) ?

### Tour 2 — Les participants
- **Formule** (AskUserQuestion) : Solo · En couple · En famille · Entre amis (+ Autre : collègues, groupe…).
- **Qui** : prénoms, et selon la formule : âge des enfants, nombre d'amis, personnes plus âgées…
- **Besoins particuliers** : mobilité, santé, régime alimentaire / allergies, sommeil, animal, enfant en poussette, phobie (avion, foule, hauteur)…

### Tour 3 — Les objectifs
- **Pourquoi ce voyage** (AskUserQuestion, multiSelect) : Se reposer · Découvrir la culture et l'histoire · Gastronomie · Nature et randonnée · Fête / vie nocturne · Aventure / sport · Moment romantique · Moment en famille / entre amis · Célébrer une occasion (anniversaire, lune de miel…) · Photographie.
- **Le voyage réussi** : « À votre retour, qu'est-ce qui vous fera dire que c'était un super voyage ? »
- **Incontournables** déjà en tête (lieux, expériences, restaurants, événements).

### Tour 4 — Ce qu'on aime / ce qu'on n'aime pas
Demander explicitement **les deux côtés**, avec des exemples pour amorcer :
- **On aime** : types de lieux (musées, marchés, points de vue, plages, quartiers authentiques…), cuisine, ambiances, activités, façon de se déplacer (marcher beaucoup, vélo, voiture…).
- **On n'aime pas / on évite** : foule et files d'attente, pièges à touristes, longues journées de transport, lever tôt, chaleur, certaines cuisines, visites guidées en groupe…
- Si les participants n'ont pas les mêmes goûts, le noter par personne.

### Tour 5 — Centres d'intérêt (types de lieux à repérer)
Objectif : savoir **quels types de lieux précis** l'utilisateur aime dénicher partout où il voyage, pour que les autres skills les cherchent dans la destination et les ajoutent comme POI. Ce sont souvent des passions personnelles, parfois très pointues : ne pas se limiter aux catégories touristiques classiques.
- Question ouverte d'abord : « Y a-t-il des types d'endroits que vous aimez visiter dans chaque ville, par passion ou par curiosité ? » avec des exemples variés pour amorcer : pâtisseries, fabricants et magasins de chapeaux, magasins de guitares, théâtres, cinémas (d'art et d'essai, anciens), disquaires, librairies, caves à vin, brocantes et puces, ateliers d'artisans, galeries, salles de concert, boutiques vintage, épiceries fines, torréfacteurs, jardins botaniques, architecture d'un style particulier…
- Puis (AskUserQuestion, multiSelect) proposer les familles les plus probables au vu des réponses précédentes, pour faire émerger ce qui n'aurait pas été dit.
- Pour chaque centre d'intérêt retenu, faire préciser :
  - **ce qui compte** (« magasins de guitares : plutôt vintage et luthiers que grandes enseignes », « cinéma : salles anciennes, VO ») ;
  - **l'envie** : *incontournable* (à chercher absolument) ou *si on passe devant* (bonus) ;
  - **qui** est concerné, si tous les participants ne partagent pas la passion.
- Si un centre d'intérêt correspond à une catégorie de POI Trip Buddy existante (clé `poiCategories` de `trip-buddy.json`, ex. ☕ Café & pâtisserie, 🎵 Disquaire), l'indiquer ; sinon, le noter comme catégorie à créer.

### Tour 6 — Pour aller plus loin (facultatif)
Proposer ce tour en précisant qu'on peut le passer (AskUserQuestion : *Oui, continuons* / *On s'arrête là*) :
- **Rythme** : Tranquille · Équilibré · Intense ; matinal ou couche-tard ?
- **Budget** : ordre de grandeur total ou par jour, devise, postes où l'on accepte de se faire plaisir et ceux où l'on économise.
- **Logistique** : transport aller/retour (réservé ? avion, train, voiture), hébergement (réservé ? type souhaité), déplacements sur place.
- **Contraintes fixes** : réservations déjà prises, horaires imposés, jours fériés, événements.

Ne pas inventer : ce que l'utilisateur ne sait pas encore va dans **Questions ouvertes**.

## 3. Rédiger CONTEXT.md

Quand les tours 1 à 5 sont couverts (et le 6 s'il a été fait) :

1. Écrire `CONTEXT.md` à la racine du coffre en suivant **exactement** la structure de [references/CONTEXT-template.md](references/CONTEXT-template.md) : propriétés YAML en tête (lisibles par les autres skills), puis les sections en Markdown. Les valeurs du modèle (Barcelone, Camille, Thomas…) sont des **exemples** : les remplacer toutes par celles du voyage en cours.
   - Garder les mots de l'utilisateur quand ils sont parlants ; reformuler seulement pour clarifier.
   - Une section sans information : écrire `_À préciser_` plutôt que la supprimer.
   - Pas de bloc `tripbuddy-nav` : ce fichier n'est pas une page du module.
2. Remplir la propriété `interests` et la section **🔎 Centres d'intérêt** : un élément par centre d'intérêt, avec ce qui compte, le niveau d'envie et la catégorie Trip Buddy correspondante. Les skills qui cherchent des lieux s'en servent comme liste de recherche.
3. Rédiger la section **🧭 Synthèse pour la planification** : 5 à 8 consignes actionnables déduites des réponses, destinées aux autres skills (ex. « Max 2 visites culturelles par jour, toujours une pause café l'après-midi », « Éviter les lieux à forte affluence le week-end ; viser l'ouverture »). C'est la partie la plus utile du fichier : elle doit permettre à quelqu'un qui n'a pas suivi la conversation de planifier un voyage qui leur ressemble.
4. Mettre à jour `updated` dans les propriétés à chaque modification.

## 4. Conclure

- Montrer un résumé court (5-6 lignes) du contexte enregistré et le lien vers `CONTEXT.md`.
- Demander si quelque chose est à corriger ou compléter ; appliquer les corrections directement dans le fichier.
- Si les réglages Trip Buddy ne correspondent pas (nom, destination, dates, voyageurs, devise, budget, emoji), montrer les valeurs proposées et, après accord de l'utilisateur, les écrire dans la clé `trip` de `trip-buddy.json` : `name`, `destination`, `start` et `end` (`AAAA-MM-JJ`), `travelers` (liste de prénoms), `currency` (code ISO), `budget` (nombre), `emoji`. Modifier uniquement ces valeurs, garder un JSON valide (le relire avec `python3 -m json.tool trip-buddy.json`) ; Obsidian recharge les réglages tout seul. Si le coffre contient encore les données d'un ancien voyage (POI, programmes, journal), rappeler la commande *« Trip Buddy : Vider les données d'exemple (nouveau voyage) »*.
- Proposer l'étape suivante : lancer le skill `travel-planner` (agenda vérifié, fiches des lieux, guide sur mesure). Préciser qu'il aura besoin des heures d'arrivée et de départ et de l'adresse de l'hébergement si elles ne sont pas encore dans `CONTEXT.md`.
