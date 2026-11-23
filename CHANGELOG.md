# 📜 Journal des versions

Toutes les évolutions notables de Trip Buddy (module, skills, modèles et coffre) sont notées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numérotation [SemVer](https://semver.org/lang/fr/) :
**majeure** quand un format de note ou de réglage change sans compatibilité, **mineure** pour une nouveauté, **correctif** pour une correction.

Chaque version publiée est disponible en téléchargement, prête à ouvrir dans Obsidian, sur la page [Releases](https://github.com/blamouche/obsidian-trip-buddy/releases).

## [Non publié]

## [1.1.0] - 2026-11-23

### Ajouté
- Accueil : bandeau « Voyage d'exemple » quand le coffre contient le voyage de démonstration (réglage `demo`), avec un accès direct à la remise à zéro dans les réglages.
- Réglages : `openSettings(section)` fait défiler l'onglet jusqu'à une section et la met en évidence.
- Réglages : numéro de version du module et vérification des mises à jour sur GitHub (✅ à jour / 🆕 version disponible, avec liens vers les nouveautés et le paquet).
- Paquet de développement construit automatiquement à chaque mise à jour de `main`, publié en pré-version sur GitHub.

## [1.0.0] - 2026-11-23

Première version publique : un coffre Obsidian prêt à l'emploi, avec un voyage d'exemple fictif (« Kyoto sous les érables »).

### Ajouté
- **Module Trip Buddy** : accueil (tableau de bord), lieux géocodés avec catégories, carte OpenStreetMap, programme jour par jour avec temps de trajet et optimisation de l'ordre, journal avec météo et humeur, budget partagé multidevise (« qui a payé quoi »), valise, documents, guide de la destination.
- Traces GPX, réseaux de transports en commun, cartes hors ligne.
- **Carnet souvenir** imprimable et **export complet** du voyage en PDF.
- Saisie rapide en mode lecture, pictogrammes au trait ou emoji, thème clair ou sombre.
- Réglages dans `trip-buddy.json` à la racine du coffre, modifiables à la main ou par un agent.
- Commande *Vider les données d'exemple (nouveau voyage)*.
- **Skills Claude** `travel-context` (interview → `CONTEXT.md`) et `travel-planner` (agenda vérifié, fiches de lieux, guide sur mesure).
- En-tête de l'accueil : dégradé de fond aux couleurs de l'emoji du voyage.
- Menu principal : rubriques masquables dans les réglages (👁 / 🙈).
- Mode d'emploi illustré de captures d'écran.
