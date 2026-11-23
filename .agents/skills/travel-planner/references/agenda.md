# Consignes — Agenda

Fichier lu par l'orchestrateur et par les sous-agents de la séquence 1 (repérage, vérification). Lire aussi `CONTEXT.md` et `.trip-planner/logistique.md` à la racine du coffre.

## Exigence de vérification (pour tous)

- **Horaires pour les dates exactes du voyage**, pas des horaires « en général » : horaires d'hiver/d'été, jour de fermeture hebdomadaire, jours fériés locaux et nationaux, fermetures exceptionnelles, travaux, congés annuels (fréquents pour les petits commerces et restaurants), dernière entrée.
- **Sources, par ordre de préférence** : site officiel du lieu ; office de tourisme / site municipal ; fiche Google Maps ou équivalent (vérifier la date des avis récents qui signalent une fermeture) ; presse locale et guides récents. Croiser deux sources quand elles divergent et garder la plus officielle.
- Noter chaque source (lien) et la date de consultation. Ce qui ne peut pas être confirmé : **⚠️ à vérifier** + la raison.
- Signaler tout lieu **définitivement fermé** ou déménagé.
- Ne rien inventer : ni horaire, ni prix, ni adresse.

## Repérage — format de `.trip-planner/candidats/<theme>.md`

En tête : thème, dates du voyage, date de consultation. Puis une entrée par lieu :

```markdown
### <Nom exact du lieu>
- **Catégorie** : <id de catégorie Trip Buddy, ou "à créer : <libellé>">
- **Adresse** : <adresse postale complète>
- **Quartier** : <quartier>
- **Horaires les jours du voyage** : ven. 20/11 9 h – 18 h · sam. 21/11 9 h – 18 h · dim. 22/11 fermé
- **Dernière entrée / créneaux** : …
- **Réservation** : obligatoire / conseillée / inutile — comment (site, téléphone) et délai
- **Tarif** : …
- **Durée conseillée** : …
- **Pourquoi pour eux** : lien précis avec CONTEXT.md (objectif, goût, centre d'intérêt)
- **Envie** : incontournable | bonus
- **Pièges / conseils** : affluence, meilleur moment, tenue exigée…
- **Sources** : [nom](url) · [nom](url) — consultées le JJ/MM/AAAA
```

Viser la **qualité** plutôt que l'exhaustivité : 8 à 20 candidats par thème, filtrés par les goûts et rejets de `CONTEXT.md` (pas de pièges à touristes si l'utilisateur les fuit, etc.). Pour un centre d'intérêt pointu (chapeliers, magasins de guitares…), chercher les adresses de spécialistes : artisans, boutiques historiques, ateliers qui se visitent, adresses recommandées par les passionnés (forums, presse spécialisée).

L'agent *Infos pratiques* écrit `.trip-planner/pratique.md` : lever et coucher du soleil (et fin du crépuscule civil) pour chaque jour, jours fériés et fêtes pendant le séjour, événements (concerts, spectacles, matchs, marchés, festivals) compatibles avec les goûts, météo de saison (températures, pluie, heure de la nuit), trajet détaillé arrivée → hébergement et hébergement → départ (mode, durée, prix, billet), consignes à bagages près des gares/aéroports.

## Composition — règles

1. **Premier jour** : partir de l'heure d'arrivée + trajet jusqu'à l'hébergement (ou consigne) + marge. Si le check-in est tardif, prévoir où laisser les bagages.
2. **Dernier jour** : finir avec une marge avant le départ — train ≥ 30 min en gare, avion ≥ 2 h à l'aéroport (international : 2 h 30 – 3 h) + trajet. Prévoir la récupération des bagages et sa durée.
3. **Ouvert le jour J à l'heure prévue** : arrivée avant la dernière entrée, durée de visite qui tient avant la fermeture. Placer en priorité les lieux qui ne sont ouverts qu'un seul des jours du voyage.
4. **Géographie** : une journée = un ou deux secteurs voisins. Estimer chaque trajet (à pied, transports, taxi) avec sa durée réaliste ; l'indiquer dans le tableau quand il dépasse 10 min.
5. **Rythme** de `CONTEXT.md` : *tranquille* ≈ 2-3 temps forts par jour, *équilibré* ≈ 3-4, *intense* ≈ 5+. Toujours des pauses (café, parc, sieste si enfants).
6. **Repas aux heures locales** (ex. Espagne : déjeuner 13 h 30 – 15 h, dîner 20 h 30 – 22 h) ; restaurant ouvert ce jour-là, réservation repérée.
7. **Lumière** : points de vue au coucher du soleil, quartiers à la tombée de la nuit, visites en intérieur aux heures chaudes ou s'il pleut.
8. **Incontournables** de `CONTEXT.md` et centres d'intérêt *incontournables* tous placés ; les *bonus* placés s'ils sont sur le chemin, sinon en variante.
9. **Rejets** de `CONTEXT.md` respectés (foule → viser l'ouverture ou éviter le week-end, pas de lever tôt…).
10. Pour chaque jour : **à réserver**, **variantes**, **plan B pluie**.

## Format de `.trip-planner/agenda.md`

```markdown
# Agenda — <nom du voyage>
Statut : brouillon | validé le JJ/MM/AAAA

## J1 — vendredi 20 novembre 2026 · <titre court de la journée>
| Heure | Étape | Ouvert ce jour-là |
| --- | --- | --- |
| 14 h 30 | Arrivée **Barcelone-Sants** (TGV 9713) | |
| 14 h 45 | Métro L3 → Paral·lel (≈ 15 min), dépôt des bagages à **Hotel X** | check-in dès 15 h |
| 16 h 00 | **Mirador del Palau Nacional** — coucher du soleil 17 h 28 | accès libre |

**À réserver** : …
**Variantes** : …
**Plan B pluie** : …
**Lieux (ordre du parcours)** : Hotel X, Mirador del Palau Nacional, …
```

Les noms en gras et ceux de la ligne **Lieux** sont les **noms exacts des futures fiches POI** (nom usuel local, sans article superflu ; le même partout).

## Vérification — consignes pour l'agent vérificateur

Tu n'as pas composé cet agenda : vérifie-le sans complaisance. Pour **chaque créneau** de `.trip-planner/agenda.md` :
- le lieu est ouvert **ce jour-là, à cette heure**, pour toute la durée prévue (revérifier sur la source officielle, pas seulement dans les candidats) ; jour férié ou fermeture exceptionnelle ?
- la dernière entrée et les créneaux de réservation sont compatibles ;
- le temps de trajet depuis l'étape précédente est réaliste (mode indiqué, durée) ;
- les marges d'arrivée et de départ sont tenues, bagages compris ;
- les repas tombent aux heures locales dans un établissement ouvert ;
- les heures de lever/coucher du soleil sont exactes ;
- rien ne contredit `CONTEXT.md` (rythme, régime alimentaire, mobilité, rejets).

Écrire `.trip-planner/verification.md` : pour chaque jour, ✅ ou la liste des problèmes (**⚠️ créneau — problème — source — correction proposée**). Terminer par la liste de tout ce qui reste impossible à confirmer.

## Format des notes `06 Programme/Programme AAAA-MM-JJ.md`

~~~~markdown
---
type: programme
date: 2026-11-21
title: Vieille ville, Sagrada Família et coucher de soleil aux Bunkers
pois:
  - "[[Hotel X]]"
  - "[[Mercat de la Boqueria]]"
  - "[[Barri Gòtic]]"
  - "[[Hotel X]]"
cssclasses:
  - tb-page
  - tb-wide
---
```tripbuddy-nav
```
```tripbuddy-program
```

## 📝 Notes & réservations
### ⏱️ Déroulé (horaires vérifiés le JJ/MM)
| Heure | Étape | Ouvert ce jour-là |
| --- | --- | --- |
| … | … | … |

### ✅ À réserver
- [ ] **Lieu** — date, heure, comment (lien ou téléphone)

### 💡 Variantes
- …

### ☔ Plan B pluie
- …
~~~~

- `pois` : les lieux **dans l'ordre du parcours**, l'hébergement en premier et en dernier quand on y revient (le premier jour commence à la gare/l'aéroport d'arrivée, le dernier finit à celui du départ).
- Dans le tableau, mettre les lieux en **gras** (pas de lien) ; les liens `[[…]]` vont dans `pois`, « À réserver » et « Variantes ».
- Une note par jour du voyage, même un jour d'arrivée tardive.
