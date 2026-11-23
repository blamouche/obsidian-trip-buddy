# Consignes — Guide de voyage

Fichier lu par les sous-agents de la séquence 3. Lire aussi `CONTEXT.md`, `.trip-planner/logistique.md`, `.trip-planner/pratique.md` et `.trip-planner/agenda.md` : le guide est **sur mesure** — il parle de *ce* voyage, de *ces* voyageurs, à *ces* dates, sur *ce* parcours.

## Règles

- Une page = un fichier dans `08 Guide/`. Ne jamais toucher `08 Guide/Guide.md` (l'index).
- Si la page existe et ne contient qu'un squelette ou un autre voyage : la réécrire entièrement. Si elle contient déjà du contenu pour ce voyage : la compléter.
- Informations **vérifiées et récentes** (tarifs de l'année, règles en vigueur), sourcées par des liens dans le texte ; ce qui est incertain : **⚠️ à vérifier**.
- Écrire en **français**, du point de vue des voyageurs (« pour ce week-end », « sur notre parcours », « depuis l'hôtel »). Comparer avec le pays d'origine des voyageurs quand c'est utile (prises, pourboires, horaires des repas). Si le pays d'origine n'est pas dans `CONTEXT.md`, supposer la France et le signaler dans le retour.
- Commencer par **l'essentiel** dans un encadré (`> [!tip]`), puis le détail. Tableaux pour les tarifs et comparaisons, listes courtes, callouts `> [!info]`, `> [!warning]`.
- Lier les fiches POI concernées avec `[[Nom exact]]` (noms de `.trip-planner/poi-liste.md` ou de `05 POI`) et les programmes avec `[[Programme AAAA-MM-JJ]]`.

## Pages et propriétés

| Fichier | `guide` | `order` | `icon` | Contenu attendu |
| --- | --- | --- | --- | --- |
| `Transports.md` | transports | 1 | 🚇 | Trajets d'arrivée et de départ pas à pas, réseau local, billets et tarifs, horaires (dernier métro), applis, taxis/VTC, vélo, pièges. |
| `Nourriture.md` | nourriture | 2 | 🍽️ | Horaires des repas, types d'établissements, spécialités (et de saison), boissons, régimes alimentaires de `CONTEXT.md`, comment commander. |
| `La langue.md` | langue | 3 | 🗣️ | Langue(s) parlée(s), prononciation, politesse, glossaire utile (salutations, restaurant, transports, urgences, centres d'intérêt). |
| `Histoire.md` | histoire | 4 | 🏛️ | Grandes périodes, figures, et ce qu'elles ont laissé **sur notre parcours** (liens POI). |
| `Pourboires.md` | pourboires | 5 | 💶 | Usages par situation (tableau), paiement, distributeurs, change, taxes de séjour et frais cachés. |
| `Sécurité et arnaques.md` | securite | 6 | 🛡️ | Niveau de risque réaliste, zones et moments à surveiller, arnaques locales, réflexes, que faire en cas de vol ou de perte de papiers (renvoyer vers [[Numéros utiles]] pour les numéros). |
| `Fêtes.md` | fetes | 7 | 🎉 | Jours fériés de l'année, fêtes traditionnelles, et ce qui se passe **pendant le séjour** (fermetures, foule, occasions). |
| `Événements.md` | evenements | 8 | 🎟️ | Concerts, spectacles, expositions, sport, marchés pendant les dates, filtrés par les goûts, avec compatibilité avec le programme et billetterie. |
| `Électronique.md` | electronique | 9 | 🔌 | Prises et tension (adaptateur ?), téléphone et données (itinérance, eSIM), applis utiles, recharge. |
| `Numéros utiles.md` | numeros | 10 | 📞 | Tableau des urgences (112, police, pompiers, secours médical, secours en mer/montagne selon le parcours), ambassade ou consulat du pays des voyageurs (adresse, téléphone, horaires), opposition carte bancaire et assistance de l'assurance voyage, contacts **sur place** (hébergement, hôte, loueur, taxis, pharmacie de garde). |
| `Formalités.md` | formalites | 11 | 🛂 | Papiers d'identité selon la nationalité des voyageurs (carte d'identité, passeport, visa, validité, mineurs), santé (CEAM, vaccins, médicaments), assurances, douane et règles d'entrée, démarches à faire avant le départ avec leurs délais. |

Les contacts **sur place** de *Numéros utiles* (hôte, hébergement, loueur) se trouvent dans `.trip-planner/logistique.md` et les réservations de `01 Documents` : les recopier tels quels, sans jamais les envoyer à un service extérieur (recherche web, géocodage). Si un numéro manque, écrire **⚠️ à compléter**. Ces deux pages remplacent les anciennes sections *Numéros utiles* et *Formalités* de la page Documents : ne pas les y recréer.

Pages propres à la destination (choisies avec l'utilisateur) : `order` à partir de 12, `guide` en identifiant court sans accents (ex. `sante`, `argent`, `climat`, `savoir-vivre`, `guitares`), `icon` adapté.

## Gabarit

~~~~markdown
---
type: guide
guide: <identifiant>
order: <n>
icon: "<emoji>"
summary: "<une phrase qui résume la page pour ce voyage, affichée sur la carte de l'index>"
cssclasses:
  - tb-page
---
```tripbuddy-nav
```
```tripbuddy-guide
mode: pager
```

# <emoji> <Titre>

## 🧭 L'essentiel
> [!tip] Pour ce voyage
> - <3 à 5 points concrets, directement utiles pendant le séjour>

## <emoji> <Rubrique>
…
~~~~

## Retour à l'orchestrateur

Un résumé court : pages écrites, points **⚠️ à vérifier**, et toute information qui devrait modifier l'agenda (fermeture, grève annoncée, événement intéressant, jour férié oublié).
