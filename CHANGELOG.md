# 📜 Journal des versions

Toutes les évolutions notables de Trip Buddy (module, skills, modèles et coffre) sont notées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numérotation [SemVer](https://semver.org/lang/fr/) :
**majeure** quand un format de note ou de réglage change sans compatibilité, **mineure** pour une nouveauté, **correctif** pour une correction.

Chaque version publiée est disponible en téléchargement, prête à ouvrir dans Obsidian, sur la page [Releases](https://github.com/blamouche/obsidian-trip-buddy/releases).

## [Non publié]

## [1.2.7] - 2026-11-23

### Modifié
- Panneau et bouton de mise à jour : pictogrammes adaptés (flèche de mise à jour, téléchargement) au lieu des étincelles et de l'emoji ⬇️.

## [1.2.6] - 2026-11-23

### Modifié
- Version de test du panneau « nouvelle version disponible » et de la mise à jour depuis Obsidian : aucun changement fonctionnel.

## [1.2.5] - 2026-11-23

### Ajouté
- Panneau « nouvelle version disponible » au-dessus du menu principal, avec un bouton pour mettre à jour, un lien vers les nouveautés et ✕ pour le masquer jusqu'à la version suivante (désactivable dans *Affichage des notes*).

## [1.2.4] - 2026-11-23

### Corrigé
- Mise à jour depuis les réglages : la page restait encore blanche après le rechargement quand les réglages s'ouvrent dans une fenêtre à part (Obsidian 1.15) — la correction de la 1.2.3 ne détectait pas cette fenêtre. Le module rechargé rouvre maintenant son onglet dans tous les cas.

## [1.2.3] - 2026-11-23

### Corrigé
- Mise à jour depuis les réglages : la fenêtre des réglages restait blanche après le rechargement du module. Le module rechargé rouvre désormais son onglet de réglages.

## [1.2.2] - 2026-11-23

### Corrigé
- Mise à jour depuis les réglages : après l'installation, le module rechargé affichait encore l'ancien numéro de version et reproposait la mise à jour (Obsidian garde en mémoire le `manifest.json` lu au démarrage). Le module relit désormais son `manifest.json` au chargement, rafraîchit la copie d'Obsidian avant de se recharger et confirme la version chargée (sinon : invitation à redémarrer Obsidian).

## [1.2.1] - 2026-11-23

### Ajouté
- Réglages : liens vers le dépôt GitHub et vers la dernière version publiée.

## [1.2.0] - 2026-11-23

### Ajouté
- Réglages : bouton **Mettre à jour vers X.Y.Z** quand une nouvelle version est publiée. Met à jour le module et les skills IA livrés, sans toucher aux notes ni aux réglages ; chaque fichier est vérifié (SHA-256), l'ancienne version est copiée dans `.trash` et remise en place en cas d'échec, puis le module se recharge.
- Chaque version publie un paquet de mise à jour `trip-buddy-update-vX.Y.Z.json` (module + skills).

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
