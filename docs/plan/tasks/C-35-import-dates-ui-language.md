---
id: C-35
title: "Import : dates lues selon la langue de l'interface"
phase: C
lane: backend
criticite: moyenne
effort: S
status: todo
owner: mixed
depends_on: [C-10]
touches: [backend/src/utils/bottlesImport.ts, backend/src/utils/bottlesImport.test.ts, backend/src/utils/importDates.ts, backend/src/utils/importDates.test.ts, backend/src/routes/bottles.ts, backend/src/routes/bottles.test.ts]
sources: []
branch:
pr:
---

## Décisions validées (2026-10-12)

- **Dates** : toutes les dates sont affichées et saisies selon la langue de l'application (fr : format français, en : format anglais, une future langue : son propre format), quelle que soit leur origine (saisie à la main ou import). Un seul format de stockage en base. La partie frontend (affichage et saisie) est traitée par E-27.

## Contexte

L'import de bouteilles (C-10) lit les CSV d'Excel en locale française : BOM, `;`, décimales à virgule, `VRAI`/`FAUX`. La date d'ouverture (`openedAt`) passe par `NullableDate` (`backend/src/validation/common.ts`, C-04), qui accepte toute chaîne que `Date.parse` sait lire. L'export écrit de l'ISO 8601, qu'Excel garde en texte : l'aller-retour export → Excel → import n'est pas touché. Le problème vient des dates tapées à la main dans le tableur.

Le frontend envoie déjà la langue de l'application dans `Accept-Language` (`frontend/src/services/api.ts`). Côté backend, `i18next-http-middleware` la détecte (`req.language`).

## Problème constaté

- V8 lit `12/03/2024` à l'américaine (mois/jour). La date est acceptée sans erreur et enregistrée au 3 décembre 2024, alors qu'un utilisateur français voulait dire le 12 mars. Pour tout jour ≤ 12, l'erreur est silencieuse.
- `25/03/2024` est refusé (`invalidDate`) et la ligne est écartée, alors que la date est lisible en français.
- `Date.parse` accepte aussi des formats vagues (`2024`, `March 2024`, `12 03 2024`) dont le sens dépend du moteur JavaScript.

Relevé par la revue de la PR #113 (C-10).

## Ce qu'il faut faire

1. Un module `backend/src/utils/importDates.ts` : `parseImportDate(text, language)` renvoie une date ISO (`aaaa-mm-jj`, ou l'horodatage ISO complet tel quel) ou `null` si la valeur est invalide.
   - L'ISO 8601 est toujours accepté, quelle que soit la langue (c'est le format de l'export).
   - Une date à barres (ou à points, `12.03.2024`) est lue selon la langue de la requête : `fr` → jour/mois/année. Pour `en` : voir « Points d'attention ».
   - Tout autre format, ou une date impossible (`31/02/2024`, mois 13), donne `null`. Une date ambiguë n'est jamais devinée.
2. `RowReader.date` (`bottlesImport.ts`) utilise `parseImportDate` à la place de `NullableDate.safeParse`. Une valeur refusée donne `invalidDate` et la ligne est écartée, comme aujourd'hui. Le payload contient la date ISO normalisée, que la confirmation (`NullableDate`) relit sans ambiguïté.
3. `parseImportFile` reçoit la langue. La route `POST /bottles/import/preview` la passe depuis `req.language` (repli `en`, langue de repli de l'application).
4. Une future langue ajoute son format dans une table de `importDates.ts`, avec un test : pas de lecture générique par `Date.parse`.
5. `NullableDate` ne change pas : les formulaires envoient de l'ISO (E-27 garde ce format pour l'API).

## Critères d'acceptation

- [ ] `2024-03-12` et `2024-03-12T00:00:00.000Z` sont acceptés quelle que soit la langue.
- [ ] En `fr`, `12/03/2024` donne le 12 mars 2024.
- [ ] En `en`, `12/03/2024` est lu selon le format décidé par l'humain.
- [ ] `31/02/2024`, `2024`, `March 2024` et `12-03-24` donnent `invalidDate` dans les deux langues, et la ligne est listée dans `errors`.
- [ ] L'aller-retour export CSV → import redonne les mêmes dates.

## Tests à ajouter ou adapter

- `src/utils/importDates.test.ts` (nouveau) : chaque format accepté et refusé, par langue ; dates impossibles.
- `src/utils/bottlesImport.test.ts` : la même ligne CSV lue en `fr` et en `en`.
- `src/routes/bottles.test.ts` : aperçu avec `Accept-Language: fr` et une date `12/03/2024` → `openedAt` vaut `2024-03-12`.

## Points d'attention

- **À trancher par l'humain** : le format de `en`. Soit en-US (mois/jour, comme Excel en anglais américain), soit en-GB (jour/mois). Une autre option est de refuser toute date à barres en `en` et de n'accepter que l'ISO.
- **À trancher par l'humain** : l'export CSV reste en ISO (proposition), pour que l'aller-retour ne dépende pas de la langue de celui qui exporte. Un export dans la langue de l'interface serait plus lisible dans Excel, mais un fichier exporté en `fr` puis importé en `en` serait mal lu.
- Le JSON garde l'ISO : il n'est pas fait pour être saisi à la main.
- C-34 touche aussi `bottlesImport.ts` (décodage Windows-1252) : enchaîner.

## Journal

- 2026-10-12 : tâche créée par C-10, après la revue de la PR #113 et la décision de l'humain sur les dates.
