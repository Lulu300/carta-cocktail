---
id: B-25
title: "i18next-http-middleware 3.9.9 : la langue de chaque requête s'ajoute à la liste partagée preload"
phase: B
lane: deps
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: [B-09]
touches: [backend/package.json, backend/package-lock.json, backend/src/i18n/]
sources: []
branch: chore/B-25-deps-i18next-http-middleware
pr: 213
---

## Contexte

Le backend monte `i18nMiddleware` (`middleware.handle(i18next)`, `backend/src/i18n/index.ts`) en tête de `app.ts`, avant l'authentification : toutes les requêtes, publiques comprises, y passent. La langue vient de la détection du middleware (`?lng=`, cookie, en-tête `Accept-Language`…). La configuration i18next du backend n'a pas de `supportedLngs`.

Trouvé pendant B-09 (montée d'i18next en 27), hors de son périmètre.

## Problème constaté

- `i18next-http-middleware` 3.9.9 (lockfile de `develop` au 2026-11-24, plage `^3.9.9`) termine `handle()` par `i18next.loadLanguages(req.lng, …)` sur l'instance **partagée**. Sans `supportedLngs`, i18next ajoute chaque langue nouvelle à `i18next.options.preload` et ne l'en retire jamais.
- Mesure (i18next 27.2.7, configuration du backend, 1 000 requêtes `?lng=xx0` … `?lng=xx999`) : `preload` passe de 2 à 1 002 entrées avec 3.9.9, reste à 2 avec 3.11.1. La liste ne fait que grandir jusqu'au redémarrage, et chaque requête la parcourt.
- Le changelog de 3.10.1 (avis GHSA-mjcw-gfh6-3cxm, annoncé « Security release ») corrige ce point : `handle()` charge la langue par l'instance de la requête. Il cite 4 000 requêtes à langues inventées qui font passer une requête ordinaire de 0,4 ms à 14 ms. 3.10.1 et 3.11.0 corrigent aussi `getResourcesHandler` et `missingKeyHandler`, que le backend n'utilise pas.
- Au 2026-11-24, ni GHSA-mjcw-gfh6-3cxm ni les deux autres avis du middleware (GHSA-xxvx-vcj6-rjq5, GHSA-ccfc-2jr7-wr97) ne sont dans la base globale des avis GitHub (`gh api /advisories/<id>` : 404) : `npm audit` et Dependabot ne les signalent pas.

## Ce qu'il faut faire

1. `npm update i18next-http-middleware` dans `backend/` (3.11.1 est dans la plage `^3.9.9`), puis `npm ls i18next-http-middleware i18next` : le lockfile ne doit changer que cette entrée.
2. Lire le changelog de 3.9.10 à la dernière version : 3.10.0 refuse les codes de langue qui n'ont pas la forme `isSafeLanguageCode` (cookie `i18next=%` ignoré), 3.9.11 ignore les langues `q=0` de `Accept-Language`.
3. Décider s'il faut aussi déclarer `supportedLngs: ['en', 'fr']` côté backend (une langue inconnue ne serait plus jamais chargée) ; vérifier alors que `fr-FR` donne toujours le français (`nonExplicitSupportedLngs` ou équivalent) et que l'import garde ses formats de date.
4. Tests, lint, `npx tsc --noEmit`, build, `npm audit --omit=dev --audit-level=high`.

## Critères d'acceptation

- [x] `i18next-http-middleware` ≥ 3.10.1 dans le lockfile.
- [x] Un test montre que des requêtes avec des langues inventées ne font pas grandir `i18next.options.preload`.
- [x] Messages d'erreur toujours dans la langue de la requête (`fr`, `fr-FR`, `en`, langue inconnue → anglais).
- [x] `npm ci`, lint, `npx tsc --noEmit`, build et `npm test` passent.

## Tests à ajouter ou adapter

Test de non-régression dans `backend/src/i18n/i18n.test.ts` (ou un test d'intégration) : N requêtes `?lng=xx<i>` puis `i18next.options.preload` inchangé.

## Points d'attention

- Une seule tâche à la fois sur `backend/package-lock.json`.
- Notes de version : ligne « Security » si les avis sont publiés d'ici la release, sinon une ligne qui dit ce qui est corrigé.

## Journal

- 2026-11-24 : tâche créée par B-09 (PR de la montée d'i18next 27), d'après la mesure ci-dessus.
- 2026-11-24 : PR #213, sur `develop` (570193e), Node 24, i18next 27.2.7. `i18next-http-middleware` 3.9.9 → 3.11.1, plage relevée à `^3.11.1` ; seule cette entrée change dans le lockfile. Avis : GHSA-mjcw-gfh6-3cxm (CVE-2026-132267, `< 3.10.1`), GHSA-xxvx-vcj6-rjq5 (`< 3.10.2`) et GHSA-ccfc-2jr7-wr97 (`< 3.11.0`) sont publiés au niveau du dépôt (`high`), toujours absents de la base globale (`gh api /advisories/<id>` : 404), donc invisibles pour `npm audit` et Dependabot ; seul le premier nous touche (`handle()` monté sur toutes les requêtes), les deux autres visent `missingKeyHandler` et `getResourcesHandler`, non montés. Étape 3 retenue : `supportedLngs: ['en', 'en-GB', 'fr']` (la liste du frontend) et un `convertDetectedLanguage` qui ramène chaque code détecté à l'une d'elles (`fr-FR` → `fr`, `en-gb` → `en-GB`, inconnu → chaîne vide, ignorée par le middleware), comme `toSupportedLanguage` du frontend. Sans conversion, la première passe d'i18next prend toute correspondance exacte (`fr-CA, en;q=0.5` → anglais, `en-US, fr;q=0.8` → français) et les codes inventés font encore tourner le cache `formattedCodes`. Effets côté API seulement (le SPA envoie `fr`, `en` ou `en-GB`) : `Content-Language` vaut toujours `en`, `en-GB` ou `fr` ; `de` reçoit l'anglais avec `5,000` (et non plus `5.000`) ; une langue non prise en charge dans `?lng=` ou en tête d'`Accept-Language` passe à la suivante (`?lng=de` + `Accept-Language: fr` → français) ; `?lng=cimode` ne renvoie plus les clés. Dates de l'import inchangées (`en-GB` jour d'abord, tests de `bottles.test.ts` inchangés). Test `backend/src/i18n/requestLanguage.test.ts` : langues et replis (message et format exacts) et 2 000 requêtes à langues inventées (requête, cookie, en-tête : 6 000 codes) sans changement de `options.preload`, des langues du store, de `resolveHierarchyCache`, `formattedCodes` et `pluralRulesCache`. Sabotages : config de `develop` avec 3.11.1 → 10 échecs sur 18, caches remplis de `xx…` ; avec 3.9.9 → `preload` + 2 000 ; nouvelle config avec 3.9.9 → `preload` borné (`en-GB` en plus, une fois) ; sans conversion → 4 échecs. `npm ci`, lint, `tsc --noEmit`, build, `npm test -- --coverage` (1420 tests, 99,48 % des instructions) ; `npm audit --omit=dev` à 0. Aucune tâche hors périmètre.
- 2026-11-24 : relecture de #213 (approuvée, 0 bloquant) prise en compte, après rebase sur `develop` (c59fe82, C-20). `supportedLngs` gardé comme seconde garde (langue posée par du code : `changeLanguage()`, `req.lng`), son commentaire dit maintenant que c'est le convertisseur qui impose la liste ; nouveau test qui bascule l'instance d'une requête sur `de` par du code. Sondes : sans `supportedLngs` → ce test échoue (1 sur 19) ; sans convertisseur → 4 échecs. `bottles.test.ts` gagne `de-DE, fr;q=0.5` → `2024-03-12` (échoue avec la configuration de `develop`, qui donne `2024-12-03`). Ligne « Notes de version » reformulée d'après la relecture : sur Carta (ressources en ligne), une requête ordinaire ne ralentit presque pas (0,08 → 0,10 ms après 60 000 langues inventées) ; ce qui grandit, c'est la liste (57 334 entrées, environ 5 Mo) et le coût de chaque nouvelle langue inventée. Lint, `tsc --noEmit`, build, `npm test -- --coverage` (1427 tests, 99,48 % des instructions), `npm audit --omit=dev` à 0.
- 2026-11-24 : Notes de version (Security) : `i18next-http-middleware` 3.11.1 corrige GHSA-mjcw-gfh6-3cxm (CVE-2026-132267) : des requêtes non authentifiées avec des langues inventées (`?lng=`, cookie, `Accept-Language`) faisaient grandir sans limite une liste en mémoire, jusqu'au redémarrage, et chaque nouvelle langue inventée coûtait plus cher que la précédente. L'API ne sert plus que `en`, `en-GB` et `fr` ; une autre langue reçoit l'anglais, nombres compris. Pour un client d'API dont la première langue n'est pas prise en charge, les dates de l'import suivent désormais la langue des messages : avec `Accept-Language: de-DE, fr;q=0.5`, `12/03/2024` est lu comme le 12 mars (français, jour d'abord) et non plus comme le 3 décembre (`de-DE` retombait sur l'ordre de `en`). Le SPA envoie toujours `fr`, `en` ou `en-GB` : aucun changement pour lui. Aucune action demandée.
