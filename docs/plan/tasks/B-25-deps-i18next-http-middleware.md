---
id: B-25
title: "i18next-http-middleware 3.9.9 : la langue de chaque requête s'ajoute à la liste partagée preload"
phase: B
lane: deps
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [B-09]
touches: [backend/package.json, backend/package-lock.json, backend/src/i18n/]
sources: []
branch:
pr:
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

- [ ] `i18next-http-middleware` ≥ 3.10.1 dans le lockfile.
- [ ] Un test montre que des requêtes avec des langues inventées ne font pas grandir `i18next.options.preload`.
- [ ] Messages d'erreur toujours dans la langue de la requête (`fr`, `fr-FR`, `en`, langue inconnue → anglais).
- [ ] `npm ci`, lint, `npx tsc --noEmit`, build et `npm test` passent.

## Tests à ajouter ou adapter

Test de non-régression dans `backend/src/i18n/i18n.test.ts` (ou un test d'intégration) : N requêtes `?lng=xx<i>` puis `i18next.options.preload` inchangé.

## Points d'attention

- Une seule tâche à la fois sur `backend/package-lock.json`.
- Notes de version : ligne « Security » si les avis sont publiés d'ici la release, sinon une ligne qui dit ce qui est corrigé.

## Journal

- 2026-11-24 : tâche créée par B-09 (PR de la montée d'i18next 27), d'après la mesure ci-dessus.
