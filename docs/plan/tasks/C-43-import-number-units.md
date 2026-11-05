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
touches: [backend/src/utils/bottlesImport.ts, backend/src/utils/bottlesImport.test.ts, backend/src/test/windows1252.ts]
sources: []
branch: fix/C-43-import-number-units
pr: "#154"
---

## Contexte

C-10 (PR #113) a réécrit la lecture des nombres de l'import de bouteilles : `toNumber` (`backend/src/utils/bottlesImport.ts`) n'accepte qu'un nombre simple ou `\d+,\d+`, et une cellule qui n'est pas un nombre écarte sa ligne (code `invalidNumber`, listée dans l'assistant).

Relevé par la relecture des notes de v1.12.0 (PR #152, écart G2). Décision de l'humain le 2026-11-05 : « Code fix before rc — New task (author + reviewer): `toNumber` strips €, %, ml and spaces. The notes then describe the new behaviour. »

## Problème constaté

Excel écrit dans un CSV la valeur affichée. Une colonne au format monétaire, pourcentage ou personnalisé donne `25,90 €`, `40 %` ou `700 ml`, souvent avec une espace insécable (U+00A0) ou une espace fine insécable (U+202F) avant l'unité et entre les milliers (`1 234,50 €`).

- Depuis #113, ces lignes sont écartées.
- En v1.11, `40 %` et `25,90 €` devenaient `null` (degré ou prix perdu sans le dire, ligne importée) et `700 ml` se lisait 700 (`parseInt`), mais `70 cl` aussi.

## Ce qu'il faut faire

1. Dans `toNumber`, retirer l'unité de la colonne quand la cellule se termine par elle, avec ou sans espace, sans tenir compte de la casse : `€` pour `purchasePrice`, `%` pour `alcoholPercentage`, `remainingPercent` et `minimumPercent`, `ml` pour `capacityMl`. Le `€` se retire aussi en tête (`€25.00`, `€ 25.00`), comme l'écrit Excel en anglais ; `%` et `ml` ne viennent jamais en tête.
2. Une autre unité reste refusée (`invalidNumber`) : `70 cl` dans `capacityMl` ne devient pas 70 ml, `40 %` dans `purchasePrice` n'est pas un prix.
3. Retirer les espaces (ordinaires, insécables, fines insécables) qui groupent les milliers par trois chiffres ; une autre espace (`7 00`, `25, 90`) reste refusée.
4. Même règle pour les nombres donnés en texte dans un JSON ; un nombre JSON ne change pas.
5. Rien à changer dans l'assistant du frontend : il affiche les valeurs lues et les lignes écartées renvoyées par le backend.

## Critères d'acceptation

- [x] `700 ml`, `75 %`, `40,5 %` et `1 234,50 €` (espaces insécables et fines insécables) s'importent en 700, 75, 40,5 et 1234,5.
- [x] `1 000 ML`, `75%`, `40 %` et `25.90€` s'importent.
- [x] `€25.00`, `€ 25.00` et `€ 25,00` (espace insécable) s'importent en 25 ; `€1,234.50`, `€25 €` et `%40` écartent la ligne avec `invalidNumber`.
- [x] `70 cl` (capacité), `40 %` (prix), `25 €` (degré), `€` seul, `7 00` et `25, 90` écartent la ligne avec `invalidNumber` sur le bon champ.
- [x] Un JSON avec `"700 ml"`, `"40 %"`, `"25,90 €"` et `"minimumPercent": "25 %"` se lit comme le CSV ; `"70 cl"` écarte la ligne.
- [x] Tests, lint, `tsc` verts ; couverture inchangée sur le fichier (toutes les lignes ajoutées couvertes).

## Tests à ajouter ou adapter

- `src/utils/bottlesImport.test.ts` : bloc « numbers displayed with their unit » (cellules d'Excel en français, `€` en tête d'Excel en anglais, unité collée ou en majuscules, refus d'une autre unité et des espaces qui ne groupent pas des milliers) ; JSON avec unités en texte ; CSV Windows-1252 avec `25,90 €` (octets 0xA0 et 0x80) dans `purchasePrice`.

## Points d'attention

- `°` (`40°`) et `% vol` ne sont pas lus : hors de la décision (€, %, ml). Ces lignes restent écartées et listées.
- Les séparateurs de milliers anglais (`1,234.50`, `€1,234.50`) restent refusés, comme avant.
- Format comptabilité d'Excel : un prix nul s'affiche `- €`, qui écarte la ligne (listée dans l'assistant). Vider la cellule, ou passer la colonne au format monétaire, l'importe.
- Interaction avec C-44 : U+202F n'existe pas en Windows-1252. Un CSV « ANSI » enregistré par Excel avec une espace fine insécable comme séparateur de milliers contient probablement `?` à sa place (`1?234,50 €`), refusé. Seuls les montants de 1 000 ou plus sont touchés ; U+00A0 (0xA0) et `€` (0x80) existent en Windows-1252 et se lisent. À vérifier sur un vrai fichier une fois C-44 mergée.
- Tâches parallèles sur le même fichier : C-44 (décodage Windows-1252), C-45 (synchronisation des cartes à l'import). Diff limité à `toNumber` et à l'appel dans `RowReader.number`.

## Journal

- 2026-11-05 : tâche créée et faite (PR #154), suite à l'écart G2 de la relecture des notes de v1.12.0 (PR #152). `toNumber` reçoit l'unité de la colonne (`COLUMN_UNITS`) : `stripUnit` retire l'unité finale (casse ignorée, espaces de toute sorte avant elle), une unité seule donne `invalidNumber`, puis `SPACE_GROUPED_THOUSANDS` retire les espaces qui groupent les milliers par trois avant la lecture de la virgule décimale. `RowReader.quantity` et `desiredStock` n'ont pas d'unité. Frontend inchangé.
- Notes de version : à l'import de bouteilles, les cellules affichées par Excel avec l'unité de leur colonne (`25,90 €`, `40 %`, `700 ml`, milliers groupés par des espaces : `1 234,50 €`, `€` en tête d'Excel en anglais : `€25.00`) se lisent comme des nombres. Une autre unité (`70 cl` dans la capacité, `40°`) écarte la ligne, listée dans l'assistant ; en v1.11 elle était lue de travers (`70 cl` = 70 ml) ou perdue sans le dire.
- 2026-11-05 : suite de la relecture de la PR #154 (décision du coordinateur : dans le périmètre, « `toNumber` strips € » ne se limite pas au symbole final). `stripUnit` retire aussi un `€` en tête, avec ou sans espace (`€25.00`, `€ 25.00`) ; `€1,234.50` reste refusé. Points d'attention : format comptabilité `- €`, U+202F et C-44.
- 2026-11-05 : rebase sur `develop` après le merge de C-44 (PR #155). Test ajouté à la demande du coordinateur (suggestion de la relecture de #155) : un CSV Windows-1252 dont la cellule `purchasePrice` vaut `25,90 €` (octets 0xA0 pour l'espace insécable, 0x80 pour `€`) se lit 25,9. `backend/src/test/windows1252.ts` (helper de C-44) reçoit l'octet 0xA0 et rejoint `touches`.
