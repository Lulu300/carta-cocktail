---
id: C-49
title: "Messages backend : 401 sans token testé en français, garde contre un placeholder sans valeur"
phase: C
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-12]
touches: [backend/src/routes/auth.test.ts, backend/src/i18n/]
sources: []
branch:
pr:
---

## Contexte

C-12 (PR #166) a traduit les 401 du middleware d'authentification (`UnauthorizedError()` → `errors.unauthorized`, `UnauthorizedError('errors.invalidToken')`) et fait interpoler par `errorHandler` les `details` objets d'une erreur dans son message (`interpolationOptions`, sous `replace`). Trois messages ont des placeholders, tous dans `errors.import.*` : `zipEntryTooLarge` (`{{maxMb, number}}`), `tooManyRows` et `tooManyBottles` (`{{max, number}}`). La route d'import (`parseUploadedFile` dans `routes/bottles.ts`) les lève en `BadRequestError('errors.import.<code>', { code, ...err.params })`.

`src/i18n/i18n.test.ts` vérifie que les clés utilisées existent en `en` et en `fr`, que les deux fichiers ont les mêmes clés et les mêmes placeholders. Il ne vérifie pas que l'erreur levée fournit une valeur pour chaque placeholder.

## Problème constaté

- 401 sans token : `routes/auth.test.ts` (`GET /api/auth/me`, « should return 401 without auth token ») attend `{ error: 'Unauthorized' }`, le texte anglais d'avant C-12. Ce test passe avec ou sans la traduction. Seuls le test unitaire du middleware (`i18nKey: 'errors.unauthorized'`) et la recherche de `error: '…'` littéraux de `i18n.test.ts` prouvent la correction. Le cas du token invalide a déjà son test en français.
- Placeholder sans valeur : avec `{{max, number}}`, une valeur absente donne « NaN » dans le message (« The file has more than NaN rows… »), sans erreur ni avertissement. Le `missingInterpolationHandler` d'i18next ne voit pas ce cas : avec un format, la valeur passe d'abord par le formateur, qui rend `NaN` ; elle n'est donc jamais `undefined` (i18next 25.10.10, `Interpolator.interpolate`). Aujourd'hui les trois erreurs passent leurs valeurs, mais rien ne le garantit pour un futur message : seuls `tooManyRows` (`bottlesImport.test.ts`, `bottles.test.ts`) et `zipEntryTooLarge` (`bottlesImport.test.ts`) ont un test qui vérifie la valeur ; `tooManyBottles` ne vérifie que le code.

## Ce qu'il faut faire

1. `routes/auth.test.ts` : `GET /api/auth/me` sans token avec `Accept-Language: fr` → 401 `{ error: 'Non autorisé' }`, à côté du test du token invalide en français.
2. Garde des placeholders, dans un nouveau fichier `src/i18n/placeholders.test.ts` :
   - une table qui associe chaque clé à placeholders à un cas qui fait lever l'erreur par le vrai code, par la route (`POST /api/bottles/import/preview` avec un fichier trop long, trop de bouteilles, une entrée ZIP trop grosse), et renvoie la réponse ;
   - test de complétude : toute clé de `en.json` dont le message a un placeholder est dans la table. Un nouveau message à placeholder sans cas fait échouer le test ;
   - pour chaque cas, en `en` et en `fr` : chaque placeholder du message est une clé de `details`, et le message reçu ne contient ni `NaN` ni `{{`.
   Réutiliser `placeholders()` et `messageAt()` de `i18n.test.ts` en les déplaçant dans un module de test commun du dossier (pas de copie).
   Pourquoi cette garde plutôt qu'une autre : une analyse statique des appels ne lit pas des `details` construits par décomposition (`...err.params`) ; un `missingInterpolationHandler` ne voit pas les placeholders formatés (voir plus haut) ; un contrôle à l'exécution dans `errorHandler` ajouterait du code de production pour un risque de développement. Passer par la route teste les `details` réellement envoyés.

## Critères d'acceptation

- [ ] Le test du 401 sans token en français passe, et échoue si `middleware/auth.ts` renvoie de nouveau `'Unauthorized'` en dur.
- [ ] La garde échoue si on ajoute dans `en.json` et `fr.json` un message à placeholder sans cas dans la table.
- [ ] La garde échoue si `tooManyBottles` est levée sans `max` (sabotage de `utils/bottlesImport.ts`, annulé ensuite).
- [ ] Aucun code de production modifié ; `npm test`, lint et `tsc` passent.

## Tests à ajouter ou adapter

- `routes/auth.test.ts` : 401 sans token en français (étape 1).
- `src/i18n/placeholders.test.ts` (nouveau) : complétude de la table et placeholders fournis, en `en` et en `fr` (étape 2).
- `src/i18n/i18n.test.ts` : importer les fonctions d'aide déplacées, sans changer ses assertions.

## Points d'attention

- Les fichiers de test qui font des requêtes partagent une instance de l'app : si C-47 (limiteur global) est faite avant, rester sous `API_RATE_LIMIT` ou remettre les compteurs à zéro comme elle le prévoit.
- L'entrée ZIP de plus de 20 Mo se compresse en quelques Ko (remplissage uniforme, comme dans `bottlesImport.test.ts`) : elle passe sous la limite de 10 Mo de l'upload.
- `backend/src/i18n/` est partagé avec C-47 et d'autres tâches (`node docs/plan/build.mjs --ready`) : enchaîner.

## Journal

- 2026-11-12 : tâche créée par la PR docs de suivi du lot D-35/E-18/B-20/C-12 à partir de la relecture de la PR #166 (C-12). Faits vérifiés sur `develop` (9799168) : test anglais seul pour le 401 sans token (`auth.test.ts`), clé `errors.unauthorized` = « Non autorisé » en `fr` ; « NaN » reproduit avec i18next 25.10.10 (`{{max, number}}` sans valeur) ; aucune assertion sur le `max` de `tooManyBottles`.
