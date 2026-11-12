---
id: D-39
title: "build.mjs --check : refuser un depends_on, touches ou sources qui n'est pas une liste"
phase: D
lane: docs
criticite: basse
effort: S
status: todo
owner: agent
depends_on: []
touches: [docs/plan/build.mjs, docs/plan/build.test.mjs, docs/plan/README.md]
sources: []
branch:
pr:
---

## Décisions validées

- 2026-11-12, coordinateur : option (a) du point 3 de la relecture de la PR #173, une petite tâche pour que `--check` refuse ces valeurs.

## Contexte

`docs/plan/build.mjs` lit l'en-tête de chaque tâche avec son propre analyseur (`parseFrontmatter`, `parseValue`) : une valeur entre crochets devient une liste, toute autre valeur reste une chaîne. `touches` est la seule entrée de la détection des conflits de `--ready`, qui dit quelles tâches peuvent tourner en parallèle.

## Problème constaté

Vérifié sur `develop` (923c4ed) :

- Dans la boucle de validation, `arr()` (`const arr = (v) => (Array.isArray(v) ? v : v ? [v] : [])`, vers la ligne 338) met une valeur scalaire de `depends_on`, `touches` ou `sources` dans une liste d'un seul élément, sans erreur ni avertissement.
- Sonde (relecture de la PR #173, refaite par la PR docs puis annulée) : avec `touches: scripts/upgrade-test/, [backend/]` dans D-38, `--check` répond « 160 tâches valides » et `--json` donne `touches: ["scripts/upgrade-test/, [backend/]"]`, un seul chemin qui ne recouvre plus rien. La détection des conflits de `--ready` cesse alors de fonctionner pour cette tâche, sans le dire. Même chose pour une liste sans crochet fermant (`[a, b`).
- Une valeur vide (`touches:`), ou une liste YAML sur plusieurs lignes (`- a` en dessous), que l'analyseur ligne par ligne ne lit pas, devient une liste vide, elle aussi sans erreur.
- `build.mjs` ne tourne pas dans la CI : seul un agent ou le coordinateur lance `--check`.
- Le tableau des champs de `docs/plan/README.md` dit « liste » pour `depends_on` et `touches`, mais donne seulement l'exemple `"0X-rapport.md §section"` pour `sources`.

Les 160 tâches actuelles écrivent les trois champs entre crochets (`[]` compris) : la règle ne refusera aucune tâche existante.

## Ce qu'il faut faire

1. Dans la validation de `build.mjs`, refuser pour `depends_on`, `touches` et `sources` toute valeur présente qui n'est pas une liste entre crochets, valeur vide comprise, avec une erreur qui nomme le fichier et le champ, au format des autres (`<fichier> : champ « touches » : liste attendue entre crochets, …`). Un champ absent reste accepté comme liste vide, sauf si l'agent juge utile de l'exiger (noter le choix au Journal).
2. Retirer l'enrobage silencieux d'`arr()` une fois la validation en place, ou le garder seulement pour le champ absent.
3. `docs/plan/README.md` : dans le tableau des champs, dire que `sources` est une liste, et que les trois champs s'écrivent entre crochets sur une seule ligne (`[]` s'il n'y a rien).

## Critères d'acceptation

- [ ] `--check` sort en erreur, avec le fichier et le champ, pour un `depends_on`, `touches` ou `sources` scalaire, vide, ou dont le crochet fermant manque.
- [ ] `--check` passe sur les tâches actuelles, et `--ready` donne les mêmes lots qu'avant.
- [ ] Le tableau des champs du README décrit le format des trois champs.

## Tests à ajouter ou adapter

Au choix de l'agent, noté au Journal :

- un fichier `docs/plan/build.test.mjs` lancé par `node --test docs/plan/build.test.mjs` (aucune dépendance), qui appelle la validation sur des en-têtes en mémoire ; il faut alors pouvoir valider sans lire `docs/plan/tasks/`, par exemple en exportant la fonction qui valide un en-tête ;
- ou une sonde documentée dans la PR : chaque cas ci-dessus écrit dans une copie de tâche, `--check` en erreur, puis retour à l'état d'origine.

## Points d'attention

- Couloir `docs` plutôt que `ci` : `build.mjs` est l'outillage du plan dans `docs/plan/`, il ne tourne pas dans la CI ; `ci` couvre la CI et les bancs de test du produit.
- Ne pas brancher `build.mjs` dans la CI dans cette tâche : ce serait une autre décision.
- Rester sans dépendance npm : le README dit que Node 20 ou plus suffit.
- Une sonde sur une vraie tâche se fait dans un worktree, et le fichier est remis dans son état d'origine avant le commit.

## Journal

- 2026-11-12 : tâche créée par la PR docs de suivi du lot C-47/C-48/B-21/C-46 (PR #173), sur décision du coordinateur (point 3 de la relecture de la PR #173). Vérifié sur `develop` (923c4ed) : `arr()` vers la ligne 338 de `build.mjs`, sonde `touches: scripts/upgrade-test/, [backend/]` acceptée par `--check` (160 tâches valides) et lue comme un seul chemin par `--json` ; les 160 tâches écrivent `depends_on`, `touches` et `sources` entre crochets ; aucun workflow de `.github/` ne lance `build.mjs`.
