---
id: C-35
title: "Import : dates lues selon la langue de l'interface"
phase: C
lane: backend
criticite: moyenne
effort: S
status: done
owner: mixed
depends_on: [C-10]
touches: [backend/src/utils/bottlesImport.ts, backend/src/utils/bottlesImport.test.ts, backend/src/utils/importDates.ts, backend/src/utils/importDates.test.ts, backend/src/routes/bottles.ts, backend/src/routes/bottles.test.ts, backend/src/utils/bottlesExport.test.ts, backend/src/test/helpers.ts]
sources: []
branch: feature/C-35-import-dates-ui-language
pr: "#PRNUM"
---

## Décisions validées (2026-10-12)

- **Dates** : toutes les dates sont affichées et saisies selon la langue de l'application (fr : format français, en : format anglais, une future langue : son propre format), quelle que soit leur origine (saisie à la main ou import). Un seul format de stockage en base. La partie frontend (affichage et saisie) est traitée par E-27.
- **Format de `en`** : `en` est l'anglais américain (English (US)). En `en`, une date à barres ou à points est lue mois/jour/année (`12/03/2024` = 3 décembre 2024). En `fr` : jour/mois/année.
- **Export CSV** : il garde l'ISO 8601 ; l'export ne change pas.
- **English (UK)** : une variante `en-GB` (jour/mois) viendra avec C-39. La table de formats d'`importDates.ts` est donc indexée par langue et cherche le code exact (`en-GB`), puis la langue de base (`en`), puis le repli `en`. L'entrée `en-GB` n'est pas ajoutée ici : elle serait du code mort tant que C-39 n'est pas faite.

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
   - Une date à barres (ou à points, `12.03.2024`) est lue selon la langue de la requête : `fr` → jour/mois/année, `en` → mois/jour/année (anglais américain, voir « Décisions validées »).
   - Tout autre format, ou une date impossible (`31/02/2024`, mois 13), donne `null`. Une date ambiguë n'est jamais devinée.
2. `RowReader.date` (`bottlesImport.ts`) utilise `parseImportDate` à la place de `NullableDate.safeParse`. Une valeur refusée donne `invalidDate` et la ligne est écartée, comme aujourd'hui. Le payload contient la date ISO normalisée, que la confirmation (`NullableDate`) relit sans ambiguïté.
3. `parseImportFile` reçoit la langue. La route `POST /bottles/import/preview` la passe depuis `req.language` (repli `en`, langue de repli de l'application).
4. Une future langue ajoute son format dans une table de `importDates.ts`, avec un test : pas de lecture générique par `Date.parse`. La table est indexée par langue : code exact, puis langue de base (`fr-FR` → `fr`), puis repli `en`.
5. `NullableDate` ne change pas : les formulaires envoient de l'ISO (E-27 garde ce format pour l'API).

## Critères d'acceptation

- [x] `2024-03-12` et `2024-03-12T00:00:00.000Z` sont acceptés quelle que soit la langue.
- [x] En `fr`, `12/03/2024` donne le 12 mars 2024.
- [x] En `en`, `12/03/2024` est lu selon le format décidé par l'humain : le 3 décembre 2024 (en-US).
- [x] `31/02/2024`, `2024`, `March 2024` et `12-03-24` donnent `invalidDate` dans les deux langues, et la ligne est listée dans `errors`.
- [x] L'aller-retour export CSV → import redonne les mêmes dates.

## Tests à ajouter ou adapter

- `src/utils/importDates.test.ts` (nouveau) : chaque format accepté et refusé, par langue ; dates impossibles.
- `src/utils/bottlesImport.test.ts` : la même ligne CSV lue en `fr` et en `en`.
- `src/routes/bottles.test.ts` : aperçu avec `Accept-Language: fr` et une date `12/03/2024` → `openedAt` vaut `2024-03-12`.

## Points d'attention

- **Tranché le 2026-10-12** : le format de `en` est en-US (mois/jour, comme Excel en anglais américain) ; en-GB (jour/mois) viendra avec C-39.
- **Tranché le 2026-10-12** : l'export CSV reste en ISO, pour que l'aller-retour ne dépende pas de la langue de celui qui exporte. Un fichier exporté en `fr` puis importé en `en` est donc bien lu.
- Le JSON garde l'ISO : il n'est pas fait pour être saisi à la main.
- C-34 touche aussi `bottlesImport.ts` (décodage Windows-1252) : enchaîner.
- Le JSON passe par la même lecture que le CSV : une date à barres dans un JSON est lue selon la langue, comme dans un CSV. Une date d'un ancien JSON qui n'est ni ISO ni à barres (`Date.parse` l'acceptait) est maintenant refusée. Les exports écrivent `toISOString()` depuis leur arrivée (v1.3.0) : ils ne sont pas concernés.
- Un horodatage ISO doit avoir un fuseau (`Z` ou `+01:00`) : sans fuseau, il serait lu dans le fuseau du serveur.

## Journal

- 2026-10-12 : tâche créée par C-10, après la revue de la PR #113 et la décision de l'humain sur les dates.
- 2026-10-12 : décisions de l'humain : `en` = anglais américain (mois/jour), export CSV en ISO inchangé, variante English (UK) reportée à C-39 (créée). Table de formats indexée par langue (code exact, langue de base, repli `en`), sans entrée `en-GB`.
- 2026-10-12 : faite (PR #PRNUM). `parseImportDate` (`importDates.ts`), langue passée par `parseImportFile` depuis `req.language`. Fichiers ajoutés à `touches` : `bottlesExport.test.ts` (appelle `parseCsvBottles`, qui prend la langue) et `test/helpers.ts` (`seedBottle` accepte `openedAt`, pour l'aller-retour daté). Vérifié sur une copie de l'instance réelle (149 bouteilles, aucune avec `openedAt`) : aller-retour export CSV → import identique en `fr` et en `en`, sans date puis avec une date synthétique sur chaque bouteille ; seul écart, un nom entouré d'espaces que l'import rogne (comportement antérieur). La copie ne couvre pas les dates tapées à la main dans Excel.
- 2026-10-12 : Notes de version : aucune action requise. Changement de comportement de l'import de bouteilles : une date à barres ou à points est lue selon la langue de l'interface (fr : jour/mois/année, en : mois/jour/année) ; une date dans un autre format (`2024`, `March 2024`, `12-03-24`) ou impossible (`31/02/2024`) écarte la ligne avec `invalidDate`, au lieu d'être devinée.
