# Revue 4 - Stratégie et qualité des tests

## 1. Résultats d'exécution (réels)

| | Backend | Frontend |
|---|---|---|
| Fichiers de test | 16 (tous verts) | 28 (tous verts) |
| Tests | 249 passés, 0 échec | 282 passés, 0 échec |
| Durée | 25,8 s (tests 22 s) | 3,8 s |
| Statements / Branches / Funcs / Lines | 77,94 / 70,6 / 94,54 / 78,75 | 77,62 / 69,4 / 68,61 / 80,15 |

Seuils de 60 % respectés des deux côtés. Aucune modification de fichier du repo.

Warnings :
- Frontend : 5 avertissements `act(...)` (ImportBottlesWizard x2, MenusPage, UnitsPage, ShortagesPage, SiteSettingsContext). 2 `stderr` dans `unitConverter.test.ts` (console.warn attendu, non muté).
- Backend : bruit de logs dans la sortie : morgan (`GET /api/... 200`), bannière i18next (locize) à chaque test, dotenv. Sortie illisible en CI.

Fichiers les moins couverts :
- Backend : `routes/backup.ts` 5,2 % stmts / 0 % funcs (export + import ZIP quasi non testés), `menus.ts` 73,8 %, `cocktails.ts` 76 % (branches 63 %), `auth.ts` 79 % (lignes 34-35, 46-52 non couvertes), `availabilityService.ts` 79 % (branches 68 %), `settings.ts` 78 %.
- Frontend : `CocktailFormPage.tsx` 34 % (branches 19,8 %), `Pagination.tsx` 24 %, `CategoryFilterInput.tsx` 47 %, `useSort.ts` 62 %, `MenuPublicPage.tsx` 63,6 %, `CocktailsPage.tsx` 64 %, `MenusPage.tsx` 65 %.

## 2. Constat majeur : la couverture frontend est gonflée

Le rapport v8 ne liste que les fichiers importés par un test. `frontend/vitest.config.ts` n'a ni `coverage.include` ni `all`. Ces 21 fichiers source n'ont aucun test et n'apparaissent pas dans les 77,6 % :
`App.tsx`, `AdminLayout`, `PublicLayout`, `MenuEditPage` (391 l.), `MenuBottleEditPage` (424 l.), `ImportCocktailWizard` (393 l.), `ImportStepUpload/Resolve/Confirm`, `ImportEntityRow` (263 l.), `UnitConverter`, `LocationAutocomplete`, `HomePage`, `PublicCocktailItem` (partiellement via mocks), `Pagination`, `SearchInput`, `SortableHeader`, `usePagination`, `useSort`, `useClickOutside`, `CategoryFilterInput`.
Environ 2 500 lignes non comptées. La couverture réelle est probablement autour de 55-60 %, donc sous le seuil.
Même problème côté backend, moindre : `utils/bottlesExport.ts` et `bottlesImport.ts` n'ont pas de fichier de test propre, mais ils sont chargés via les routes.

Proposition : ajouter `coverage.include: ['src/**/*.{ts,tsx}']` dans `frontend/vitest.config.ts` et `backend/vitest.config.ts` (exclure `types/`, `main.tsx`). Effort S, priorité P0. Il faudra ensuite soit assumer une baisse du chiffre, soit écrire les tests manquants.

## 3. Script delta-coverage.mjs (.github/scripts/delta-coverage.mjs)

- Ligne ~101-105 : `if (!fileCov) continue;`. Un fichier nouveau ou modifié sans aucune couverture est silencieusement ignoré. Le garde-fou « 80 % des lignes modifiées » ne mord donc pas sur les fichiers jamais testés (le cas le plus critique). Lié au constat 2 : sans `include`, ces fichiers n'ont pas de données. Proposition : traiter l'absence comme 0 % couvert pour les fichiers sous `src/` hors exclusions. Effort S, P0.
- Les lignes sont jugées couvertes si une statement les touche (`statementMap`) : les lignes sans statement (JSX multi-ligne, branches) sont ignorées ou approximées. Les branches ne sont pas évaluées. Acceptable, à documenter.
- Le script n'a aucun test. Il parse un diff unifié (regex d'en-têtes, hunks `count === 0`, renommages, fichiers supprimés `+++ /dev/null`). Proposition : extraire `parseDiff` et `computeDelta` en fonctions pures et les tester avec vitest sur des diffs fixtures. Effort M, P2.
- Le script quitte avec 0 si pas de base commit (`No base commit ... Skipping`) : fail-open.

## 4. Ce qui va bien

- Backend : vrais tests d'intégration supertest + Prisma + SQLite, sans mock de la couche DB. Ils vérifient le comportement HTTP réel (statuts, corps, effets en base). Très bon rapport valeur/fragilité.
- Isolation DB backend : `setupTestDatabase` supprime et recrée `prisma/test.db` (db push --force-reset) par fichier, `cleanDatabase()` + `seedRequiredData()` en `beforeEach`, `fileParallelism: false` pour éviter les conflits sur le fichier partagé. Déterministe, pas de dépendance à l'ordre. (`backend/src/test/helpers.ts`, `vitest.config.ts`)
- Factories backend `seedCategory/seedUnit/seedBottle/...` avec overrides dans helpers.ts.
- Cas métier bien couverts côté backend : disponibilité (3 sources BOTTLE/CATEGORY/INGREDIENT, stock bas <= 3, min sur plusieurs ingrédients), sync apéro/digestif (`bottles.test.ts:94-180`), import/export bouteilles (CSV, ZIP), 401 sans auth, suppression des tokens expirés côté `api.ts` (`api.test.ts:49`).
- Frontend : `test-utils.tsx` fournit un `render` avec providers. Les tests utilisent `userEvent`, `waitFor`, `getByRole/getByText` (398 usages contre 10 `getByTestId`), donc des requêtes plutôt accessibles.
- Pas de timers réels ni de dates en dur détectés (aucun `setTimeout`/`useFakeTimers`/`Date.now` dans les tests) : peu de flakiness. Les suites sont rapides côté front.
- Seuils CI à 60 % + delta 80 % + `tsc` + lint en place.

## 5. Ce qui ne va pas

### 5.1 Mocks excessifs côté frontend
- 17 fichiers de test mockent `../../services/api` en entier et écrivent à la main la forme des réponses (`DashboardPage.test.tsx:5`, `BottlesPage.test.tsx:5-17`). Les mocks sont typés `as never` (`BottlesPage.test.tsx:92-95`), ce qui désactive la vérification de type : si le contrat API change, les tests restent verts. Aucun contract test front/back.
- `BottlesPage.test.tsx:20-40` mocke aussi `ImportBottlesWizard`, `MultiSelectDropdown`, `LocationAutocomplete`, `useLocalizedName`. La page est testée contre des doubles simplifiés : le comportement réel (filtres, localisation, sélection multiple) n'est pas exercé alors que ces composants existent.
- `frontend/src/test/setup.ts` mocke `react-i18next` globalement avec `t = key => key`. Les tests assertent donc des clés (`'bottles.title'`) : un clé manquante dans `en.json`/`fr.json` n'est jamais détectée, et les pluriels/interpolations ne sont pas testés. `src/i18n/**` est exclu de la couverture.
- Proposition : (a) utiliser MSW (`msw/node`) avec des handlers partagés et des fixtures typées avec les types de `types/index.ts` pour remplacer `vi.mock('services/api')` dans les tests de pages ; garder le mock direct seulement pour `api.test.ts`. Effort L, P1. (b) Utiliser une vraie instance i18next avec `en.json` dans les tests (ou au moins un test qui vérifie que toutes les clés utilisées existent dans en/fr). Effort M, P2.

### 5.2 Assertions faibles et tests d'implémentation
- 338 `toBeInTheDocument()` : beaucoup de tests vérifient seulement qu'un texte/titre est rendu (`ShortagesPage.test.tsx` « should render title », `MenusPage.test.tsx` « should render title and add button »). Ils ne prouvent pas le comportement et déclenchent les warnings act (rendu asynchrone non attendu).
- `CocktailFormPage.test.tsx:93` « uses the responsive grid layout for ingredient rows » teste une classe CSS, donc l'implémentation, pas le comportement (et `css: false` dans la config). Tout le fichier ne couvre que 34 % de la page (ajout/suppression d'ingrédients, sources BOTTLE/CATEGORY/INGREDIENT, soumission non testés).
- Proposition : remplacer les tests « renders title » par des scénarios (charger, filtrer, créer, supprimer avec confirmation, erreur API). Corriger les warnings act en attendant la fin du chargement (`await screen.findBy...` ou `waitFor` avant la fin du test). Effort M, P2.

### 5.3 Duplication de setup
- Chaque test de page répète le bloc `vi.mock(api)` + `vi.mocked(...)` + `beforeEach(mockResolvedValue([]))` (Dashboard, Bottles, Categories, Ingredients, Units, Settings...). Aucune factory de données front (les fixtures `mockBottles`, `mockCategories` sont recréées par fichier).
- Backend : chaque fichier répète `beforeAll(setupTestDatabase)` / `afterAll(teardownTestDatabase)` / `beforeEach(clean+seed)`. 16 `db push` (~1 s chacun) sont la principale source de lenteur (25 s). Pas de factory pour `Cocktail`, `Menu`, `CocktailIngredient` : les tests de `cocktails`, `availability`, `public`, `menus` les construisent à la main via `prisma.*.create`.
- Propositions : `frontend/src/test/factories.ts` (buildBottle, buildCategory, buildCocktail typées) et `test/mockApi.ts` (Effort M, P2). Backend : `globalSetup` de vitest qui crée la DB une fois, et chaque fichier ne fait que `cleanDatabase` (gain estimé de 10-15 s) ; ou utiliser une transaction/rollback. Ajouter `seedCocktail`/`seedMenu`. Effort M, P3.
- `cleanDatabase` liste les tables à la main (`helpers.ts` ~l.58-72) : toute nouvelle table oubliée provoque des fuites entre tests. Proposition : itérer sur `Prisma.dmmf.datamodel.models` ou `PRAGMA foreign_keys=OFF` + `DELETE` générique. Effort S, P3.

### 5.4 Bruit de sortie / lenteur
- Désactiver morgan quand `NODE_ENV==='test'` (app.ts) et mocker/neutraliser la bannière i18next (`showSupportNotice`/`.env`). La sortie complète fait des milliers de lignes. Effort S, P3.

### 5.5 Mock global de localStorage
- `setup.ts` du front : le `store` est un objet de module non remis à zéro automatiquement. Il faut un `localStorage.clear()` dans `afterEach` global, sinon fuite possible entre tests d'un même fichier (le token d'`api.test.ts` et AuthContext). Effort S, P2. De plus, `vi.clearAllMocks()` ne remet pas à zéro `store`.

## 6. Trous de couverture fonctionnelle (comportements critiques)

| Comportement | État | Priorité |
|---|---|---|
| Backup export/import ZIP (`backup.ts` 5 %) : restauration écrase la DB, validation du ZIP, fichier invalide, taille max 500 Mo, uploads | Quasi aucun test | P0 (opération destructive) |
| Auth : token expiré/invalide/malformé côté middleware (`auth.ts` lignes 34-52), JWT signé avec un autre secret, utilisateur supprimé | Partiel : 79 % | P0 |
| Rate limiting / brute force login | Aucun | P1 (voir revue sécurité) |
| Disponibilité : branches non couvertes `availabilityService.ts:186-189,268-270` (68 % branches), préférence de bouteilles `CocktailPreferredBottle`, conversions d'unités sans facteur ml | Partiel | P1 |
| Menus : réordonnancement (positions), suppression d'un menu système interdite, visibilité, sections (`menus.ts` 73 %) | Partiel | P1 |
| Import cocktails (preview/confirm) frontend : `ImportCocktailWizard`, `ImportStep*`, `ImportEntityRow` | 0 test | P1 |
| `MenuEditPage` / `MenuBottleEditPage` : drag/ordre, visibilité, sections | 0 test | P1 |
| Pagination (`Pagination.tsx` 24 %, `usePagination`, `useSort`) et recherche (`SearchInput`, `CategoryFilterInput`) | Presque non testés | P2 |
| Upload d'image de cocktail (type MIME, taille, suppression du fichier) | À vérifier, non repéré | P1 |
| i18n des messages d'erreur backend (en/fr via `Accept-Language`) | Peu testé | P2 |
| Routes protégées frontend (`App.tsx`, redirection vers login, déconnexion sur 401 dans l'UI) | 0 test (`App.tsx`, `AdminLayout`) | P1 |
| Pages publiques : recherche de recettes, liste des menus (`HomePage`, `MenuPublicPage` 63 %) | Partiel | P2 |

## 7. Ce qui manque

- E2E : aucun (ni Playwright ni Cypress, aucun job CI). Proposition : Playwright sur le docker-compose ou `npm run dev` + DB seed, avec 5-6 parcours : login admin, créer bouteille puis cocktail, publier un menu et le voir en public, export/import backup, token expiré. Un job CI séparé (non bloquant au début). Effort L, P1.
- Contract tests front/back : le front redéfinit ses types (`types/index.ts`) à la main, et les mocks sont `as never`. Proposition : partager un schéma (zod ou OpenAPI) ou générer les types depuis les réponses ; au minimum, des tests backend qui valident la forme des réponses avec les mêmes types que le front (`satisfies`). Effort L, P2.
- Tests visuels / composants : pas de Storybook ni de snapshot visuel. Priorité basse pour une appli mono-admin ; envisager Playwright `toHaveScreenshot` sur la page menu publique (le rendu public est le produit). Effort M, P3.
- Tests d'accessibilité : `vitest-axe` ou `@axe-core/playwright` sur les pages publiques. Effort S, P3.
- Test du script delta-coverage : voir section 3.
- Tests de migration/schéma : le seed (`npm run db:seed`) et le démarrage `index.ts` (exclu de la couverture) ne sont pas testés. Un smoke test de boot + seed. Effort S, P3.

## 8. Plan de refactorisation priorisé

| # | Action | Effort | Priorité |
|---|---|---|---|
| 1 | `coverage.include` sur src/** (front et back) + corriger delta-coverage pour compter 0 % les fichiers sans données | S | P0 |
| 2 | Tests de `backup.ts` (export ZIP contenu, import valide, ZIP invalide, non authentifié) | M | P0 |
| 3 | Tests middleware auth : token expiré/mal formé/mauvais secret/utilisateur inconnu | S | P0 |
| 4 | Tests des pages et composants sans test (MenuEditPage, MenuBottleEditPage, ImportCocktailWizard, App/ProtectedRoute, Pagination, useSort/usePagination) | L | P1 |
| 5 | Introduire MSW + fixtures typées pour remplacer `vi.mock(api)` ; supprimer les `as never` | L | P1 |
| 6 | Playwright E2E (5-6 parcours) + job CI | L | P1 |
| 7 | Compléter `CocktailFormPage` (34 %) avec scénarios réels ; supprimer le test de classe CSS | M | P2 |
| 8 | Corriger les 5 warnings `act` ; `localStorage.clear()` en `afterEach` global | S | P2 |
| 9 | Factories front (`test/factories.ts`) et back (`seedCocktail`, `seedMenu`) | M | P2 |
| 10 | i18n réel dans les tests ou test de parité des clés en/fr | M | P2 |
| 11 | Tests unitaires de `delta-coverage.mjs` (fonctions pures) | M | P2 |
| 12 | DB de test créée une seule fois via `globalSetup`, `cleanDatabase` générique, logs morgan/i18next coupés en test | M | P3 |
| 13 | Contract tests (zod/OpenAPI partagé) | L | P2 |
