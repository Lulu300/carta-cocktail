---
id: C-43
title: "Import de bouteilles : lire les nombres affichés avec leur unité (€, %, ml) et les espaces de milliers"
phase: C
lane: backend
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: [C-10]
touches: [backend/src/utils/bottlesImport.ts, backend/src/utils/bottlesImport.test.ts]
sources: []
branch: fix/C-43-import-number-units
pr: "#TBD"
---

## Contexte

C-10 (PR #113) a réécrit la lecture des nombres de l'import de bouteilles : `toNumber` (`backend/src/utils/bottlesImport.ts`) n'accepte qu'un nombre simple ou `\d+,\d+`, et une cellule qui n'est pas un nombre écarte sa ligne (code `invalidNumber`, listée dans l'assistant).

Relevé par la relecture des notes de v1.12.0 (PR #152, écart G2). Décision de l'humain le 2026-11-05 : « Code fix before rc — New task (author + reviewer): `toNumber` strips €, %, ml and spaces. The notes then describe the new behaviour. »

## Problème constaté

Excel écrit dans un CSV la valeur affichée. Une colonne au format monétaire, pourcentage ou personnalisé donne `25,90 €`, `40 %` ou `700 ml`, souvent avec une espace insécable (U+00A0) ou une espace fine insécable (U+202F) avant l'unité et entre les milliers (`1 234,50 €`).

- Depuis #113, ces lignes sont écartées.
- En v1.11, `40 %` et `25,90 €` devenaient `null` (degré ou prix perdu sans le dire, ligne importée) et `700 ml` se lisait 700 (`parseInt`), mais `70 cl` aussi.

## Ce qu'il faut faire

1. Dans `toNumber`, retirer l'unité de la colonne quand la cellule se termine par elle, avec ou sans espace, sans tenir compte de la casse : `€` pour `purchasePrice`, `%` pour `alcoholPercentage`, `remainingPercent` et `minimumPercent`, `ml` pour `capacityMl`.
2. Une autre unité reste refusée (`invalidNumber`) : `70 cl` dans `capacityMl` ne devient pas 70 ml, `40 %` dans `purchasePrice` n'est pas un prix.
3. Retirer les espaces (ordinaires, insécables, fines insécables) qui groupent les milliers par trois chiffres ; une autre espace (`7 00`, `25, 90`) reste refusée.
4. Même règle pour les nombres donnés en texte dans un JSON ; un nombre JSON ne change pas.
5. Rien à changer dans l'assistant du frontend : il affiche les valeurs lues et les lignes écartées renvoyées par le backend.

## Critères d'acceptation

- [x] `700 ml`, `75 %`, `40,5 %` et `1 234,50 €` (espaces insécables et fines insécables) s'importent en 700, 75, 40,5 et 1234,5.
- [x] `1 000 ML`, `75%`, `40 %` et `25.90€` s'importent.
- [x] `70 cl` (capacité), `40 %` (prix), `25 €` (degré), `€` seul, `7 00` et `25, 90` écartent la ligne avec `invalidNumber` sur le bon champ.
- [x] Un JSON avec `"700 ml"`, `"40 %"`, `"25,90 €"` et `"minimumPercent": "25 %"` se lit comme le CSV ; `"70 cl"` écarte la ligne.
- [x] Tests, lint, `tsc` verts ; couverture inchangée sur le fichier (toutes les lignes ajoutées couvertes).

## Tests à ajouter ou adapter

- `src/utils/bottlesImport.test.ts` : bloc « numbers displayed with their unit » (cellules d'Excel en français, unité collée ou en majuscules, refus d'une autre unité et des espaces qui ne groupent pas des milliers) ; JSON avec unités en texte.

## Points d'attention

- `°` (`40°`) et `% vol` ne sont pas lus : hors de la décision (€, %, ml). Ces lignes restent écartées et listées.
- Les séparateurs de milliers anglais (`1,234.50`) restent refusés, comme avant.
- Tâches parallèles sur le même fichier : C-44 (décodage Windows-1252), C-45 (synchronisation des cartes à l'import). Diff limité à `toNumber` et à l'appel dans `RowReader.number`.

## Journal

- 2026-11-05 : tâche créée et faite (PR #TBD), suite à l'écart G2 de la relecture des notes de v1.12.0 (PR #152). `toNumber` reçoit l'unité de la colonne (`COLUMN_UNITS`) : `stripUnit` retire l'unité finale (casse ignorée, espaces de toute sorte avant elle), une unité seule donne `invalidNumber`, puis `SPACE_GROUPED_THOUSANDS` retire les espaces qui groupent les milliers par trois avant la lecture de la virgule décimale. `RowReader.quantity` et `desiredStock` n'ont pas d'unité. Frontend inchangé.
- Notes de version : à l'import de bouteilles, les cellules affichées par Excel avec l'unité de leur colonne (`25,90 €`, `40 %`, `700 ml`, milliers groupés par des espaces : `1 234,50 €`) se lisent comme des nombres. Une autre unité (`70 cl` dans la capacité, `40°`) écarte la ligne, listée dans l'assistant ; en v1.11 elle était lue de travers (`70 cl` = 70 ml) ou perdue sans le dire.
