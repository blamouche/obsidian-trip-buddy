# Consignes — Fiches POI

Fichier lu par les sous-agents de la séquence 2. Lire aussi `CONTEXT.md`, `.trip-planner/agenda.md` (pour savoir quand chaque lieu est au programme) et, s'il existe, le fichier de candidats où le lieu a été repéré (`.trip-planner/candidats/*.md`) : il contient déjà des horaires et des sources, à **revérifier** et compléter.

## Règles

- **Un fichier par lieu** : `05 POI/<Nom exact>.md`, avec le nom donné dans `.trip-planner/poi-liste.md` (c'est celui des liens des programmes : ne pas le changer). Pas de `/ \ : * ? " < > |` dans le nom.
- Si la fiche existe déjà : la **compléter**, ne pas l'écraser (garder `done`, `rating`, `photo` et la section *Mes notes*).
- **Chaque fiche créée est géolocalisée** (`lat`, `lon`) avant de rendre la main : voir *Géolocalisation* ci-dessous. Une fiche sans coordonnées n'apparaît pas sur la carte ni dans l'optimisation des itinéraires.
- **Adresse** postale complète, au format local, terminée par la ville et le pays (en français) : elle sert au géocodage.
- **Vérifier** horaires, tarifs, site web pour les dates du voyage (mêmes exigences que `references/agenda.md`) ; dater (« vérifié le JJ/MM/AAAA ») et sourcer. Sinon **⚠️ à vérifier**.
- Écrire en **français**, de façon vivante et utile ; adapter le contenu aux voyageurs de `CONTEXT.md` (enfants, régime alimentaire, centres d'intérêt, rejets).
- Lier les autres fiches avec `[[Nom exact]]` quand c'est naturel (section *Autour*), uniquement vers des lieux de `poi-liste.md` ou déjà présents dans `05 POI`.

## Catégories

La propriété `category` prend l'**identifiant** d'une catégorie des réglages Trip Buddy (`poiCategories` de `trip-buddy.json` à la racine du coffre, champ `id`), par exemple `monument`, `musee`, `point-de-vue`, `restaurant`, `cafe`, `bar`, `nature`, `plage`, `marche`, `shopping`, `quartier`, `hebergement`, `transport`. Pour un centre d'intérêt, utiliser l'identifiant indiqué dans `poi-liste.md` (catégorie créée par l'utilisateur, ex. `chapelier`, `guitare`, `theatre`, `cinema`).

## Géolocalisation

1. Écrire la fiche avec `lat:` et `lon:` vides.
2. Dès que les fiches du lot sont écrites, les géolocaliser en une commande (depuis la racine du coffre) :
   ```bash
   python3 .claude/skills/travel-planner/scripts/geocode.py --vault . --only "Nom 1" "Nom 2" "Nom 3"
   ```
   Le script interroge OpenStreetMap (Nominatim) et écrit `lat`/`lon` dans chaque fiche. Il partage un verrou avec les autres agents : plusieurs lots peuvent tourner en même temps sans dépasser la limite d'une requête par seconde (il suffit d'attendre).
3. **Contrôler chaque résultat** affiché : le libellé renvoyé doit correspondre au lieu (bon nom ou bonne adresse, bonne ville). Un résultat qui tombe sur la mauvaise rue, une autre ville, ou signalé « ⚠ à N km des autres lieux » (hors excursion prévue) est faux.
4. Pour chaque échec ou résultat faux : trouver les coordonnées exactes de l'entrée du lieu (site officiel, Wikipédia, OpenStreetMap) et les écrire avec :
   ```bash
   python3 .claude/skills/travel-planner/scripts/geocode.py --vault . --set "Nom du lieu" 37.377200 -5.986900
   ```
   Pour un lieu étendu (parc, quartier, plage), viser l'entrée principale ou la place centrale.
5. Ne rendre la main que lorsque **toutes** les fiches du lot ont des coordonnées vérifiées.

## Photo (seulement si l'utilisateur l'a autorisé)

1. Chercher sur **Wikimedia Commons** une photo représentative sous licence libre (CC BY, CC BY-SA, CC0, domaine public).
2. La télécharger avec le script fourni, qui ne télécharge que depuis Wikimedia et affiche le crédit :
   ```bash
   python3 .claude/skills/travel-planner/scripts/commons_photo.py --vault . "File:<nom du fichier sur Commons>" "<Nom exact du lieu>"
   ```
3. Copier dans la fiche les deux lignes qu'il affiche (`photo:` et `photo_credit:`).
Pas de photo trouvée ou pas d'autorisation : ne pas mettre les propriétés `photo` / `photo_credit`.

## Gabarit

~~~~markdown
---
type: poi
name: "<Nom exact>"
category: <id>
address: "<adresse complète, ville, pays>"
lat:            # rempli par geocode.py
lon:
done: false
rating: 0
photo: "[[<Nom exact>.jpg]]"
photo_credit: "<auteur> — <licence>, Wikimedia Commons"
tags:
  - poi
  - <destination en minuscules, ex. seville>
  - <quartier ou thème, facultatif>
---
```tripbuddy-nav
```
```tripbuddy-poi
```

## 📖 Présentation
<2 à 4 paragraphes : ce que c'est, pourquoi ça vaut le détour **pour ces voyageurs**, l'ambiance.>

### Un peu d'histoire
<Origines, dates clés, personnages, anecdotes ; contexte culturel. Pour un restaurant ou une boutique : maison fondée en…, spécialité, savoir-faire.>

### Ce qu'il faut voir / Que commander / Que chercher
- <Points précis : œuvres, détails d'architecture, plats signatures, modèles de chapeaux, marques de guitares…>

> [!tip] Conseils
> - <Meilleur moment, affluence, réservation, tenue, photo, piège à éviter.>

### Autour
<Lieux voisins à enchaîner, avec liens [[…]].>

## 💡 Infos pratiques
- **Horaires vérifiés** : <horaires des jours du voyage, jour de fermeture, dernière entrée> (vérifié le JJ/MM/AAAA)
- **Au programme** : <jour et heure prévus dans l'agenda, ou « non programmé (bonus / variante) »>
- **Tarifs** : <plein, réduit, gratuité, prix moyen d'un repas…>
- **Réservation** : <obligatoire / conseillée / inutile — comment>
- **Site web** : <lien officiel>
- **Téléphone** : <si utile, notamment pour réserver>
- **Accès** : <métro, bus, à pied depuis l'hébergement…>
- **Durée conseillée** : <…>
- **Accessibilité** : <si pertinent pour les voyageurs>
- **Sources** : [nom](url) · [nom](url)

## 📝 Mes notes
~~~~

- Adapter les sous-titres à la catégorie (un marché n'a pas « Que commander » mais « Les étals à ne pas manquer »). Toujours garder **Présentation**, **Infos pratiques** (avec Horaires vérifiés, Tarifs, Site web, Sources) et **Mes notes** vide.
- Hébergement : adresse, check-in / check-out, code ou boîte à clés à demander, consigne à bagages, épiceries et transports proches.
- Transport (gare, aéroport) : terminal ou quai, temps à prévoir, consigne, liaisons vers le centre avec prix.
- Quartier : adresse représentative (place centrale) ; présenter l'ambiance, l'histoire, les rues et adresses à ne pas manquer.

## Retour à l'orchestrateur

Un résumé court : fiches créées / complétées, géolocalisation (toutes vérifiées, ou lesquelles restent sans coordonnées et pourquoi), photos ajoutées, liste des **⚠️ à vérifier** (lieu + quoi) et lieux **fermés définitivement** découverts (ne pas créer leur fiche, le signaler).
