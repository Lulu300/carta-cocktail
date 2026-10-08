---
id: E-13
title: "Tests frontend : MSW, fixtures typées, fin des mocks « as never »"
phase: E
lane: frontend
criticite: moyenne
effort: L
status: todo
owner: agent
depends_on: [B-04, E-02]
touches: [frontend/src/test/, frontend/src/**/*.test.tsx, frontend/package.json, frontend/package-lock.json]
sources: ["04-tests.md §5.1", "04-tests.md §5.2", "04-tests.md §5.5"]
branch:
pr:
---

## Contexte

Les tests frontend remplacent tout le module `services/api` par des doubles écrits à la main et typés `as never`. Si le contrat de l'API change, les tests restent verts. Ils testent aussi des pages contre des versions simplifiées de leurs composants. Cette tâche fait passer les requêtes réelles de `api.ts` par MSW, avec des données de test typées, pour que les tests attrapent les vraies régressions.

## Problème constaté

- 16 fichiers de test font `vi.mock('…/services/api')` (la revue en annonce 17) : `ImportBottlesWizard`, `ExportCocktailButton`, `AuthContext`, `SiteSettingsContext`, les pages `Bottles`, `Categories`, `CocktailForm`, `Cocktails`, `Dashboard`, `Ingredients`, `Menus`, `Settings`, `Shortages`, `Units`, `CocktailPublic`, `MenuPublic`.
- 55 `as never` dans 10 fichiers (`CategoriesPage.test.tsx` ×12, `BottlesPage.test.tsx` ×6, `UnitsPage` ×6, `IngredientsPage` ×6, `SettingsPage` ×6, `exportZip.test.ts` ×6, `DashboardPage` ×5, `MenusPage` ×4, `ShortagesPage` ×2, `ExportCocktailButton` ×2). Exemple : `BottlesPage.test.tsx:92-96`.
- `BottlesPage.test.tsx:20-41` remplace aussi `ImportBottlesWizard`, `useLocalizedName`, `MultiSelectDropdown` et `LocationAutocomplete` : filtres, localisation et sélection multiple ne sont pas exercés.
- Aucune fabrique de données : `mockBottles`, `mockCategories` sont recréés dans chaque fichier.
- Tests « affiche le titre » sans comportement (`ShortagesPage.test.tsx`, `MenusPage.test.tsx`) et 5 avertissements `act(...)` (ImportBottlesWizard ×2, MenusPage, UnitsPage, ShortagesPage, SiteSettingsContext).
- `src/test/setup.ts:5-14` : le `store` de `localStorage` n'est jamais vidé entre les tests, et `vi.clearAllMocks()` ne le vide pas.

## Ce qu'il faut faire

1. Installer `msw@^2` en dépendance de dev.
2. `src/test/factories.ts` : une fabrique par entité, typée avec `types/index.ts`, ids incrémentaux, valeurs par défaut réalistes, surcharge partielle :
   ```ts
   export function buildBottle(overrides: Partial<Bottle> = {}): Bottle;
   // buildCategory, buildCategoryType, buildUnit, buildIngredient, buildCocktail,
   // buildMenu, buildMenuCocktail, buildMenuBottle, buildMenuSection, buildShortage, buildAvailability
   export function resetFactories(): void;
   ```
   Aucun `as` dans ce fichier : si un type change, la compilation casse.
3. `src/test/msw/handlers.ts` : un handler par endpoint `GET` de `api.ts`, qui renvoie des données par défaut issues des fabriques. Les mutations renvoient l'objet reçu avec un id. `src/test/msw/server.ts` : `setupServer(...handlers)`.
4. `src/test/setup.ts` :
   ```ts
   beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
   afterEach(() => { server.resetHandlers(); localStorage.clear(); resetFactories(); });
   afterAll(() => server.close());
   ```
   `api.ts` appelle `fetch('/api/…')` avec une URL relative. Le `fetch` de Node refuse les URL relatives : si les requêtes échouent avec « Failed to parse URL », envelopper `globalThis.fetch` dans `setup.ts` pour résoudre l'URL sur `window.location.origin` avant `server.listen`. Ne pas modifier `api.ts` pour les tests.
5. `src/test/msw/utils.ts` : helpers pour les cas particuliers, par exemple `mockApiError(method, path, status, message)` et `captureRequest(method, path)` qui renvoie une promesse du corps reçu.
6. Migrer les fichiers, un commit par lot, dans cet ordre : `DashboardPage`, `ShortagesPage` (déjà sur TanStack) ; `UnitsPage`, `IngredientsPage`, `CategoriesPage`, `MenusPage`, `BottlesPage` ; `CocktailsPage`, `CocktailFormPage` ; `MenuPublicPage`, `CocktailPublicPage` ; `AuthContext`, `SiteSettingsContext`, `SettingsPage`, `ExportCocktailButton`, `ImportBottlesWizard`. `services/api.test.ts` garde son mock de `fetch` : c'est le test unitaire du client. `exportZip.test.ts` garde son mock de `jszip`.
7. Dans chaque fichier migré : supprimer `vi.mock('services/api')` et tous les `as never` ; retirer les mocks de composants internes (`MultiSelectDropdown`, `LocationAutocomplete`, `useLocalizedName`) sauf si le composant fait lui-même des appels coûteux ; remplacer les tests « affiche le titre » par des scénarios (charger, filtrer, créer, supprimer avec confirmation, erreur API) ; attendre la fin du chargement (`await screen.findBy…`) pour supprimer les avertissements `act`.
8. Option, à décider pendant la tâche : remplacer le mock global de `react-i18next` (`setup.ts:17-24`) par une vraie instance i18next chargée avec `en.json`. Les tests liraient les vrais textes et vérifieraient pluriels et interpolation. C'est un gros changement d'assertions ; s'il est fait, le faire dans une PR séparée.

## Critères d'acceptation

- [ ] `grep -rn "as never" src` : 0 résultat.
- [ ] `grep -rln "vi.mock('.*services/api')" src` : seulement `services/api.test.ts` s'il en a besoin.
- [ ] `onUnhandledRequest: 'error'` actif : aucune requête non prévue pendant les tests.
- [ ] Aucun avertissement `act(...)` dans la sortie de `npm test`.
- [ ] Un champ renommé dans `types/index.ts` (essai local, non committé) casse `tsc` dans `factories.ts`.
- [ ] Couverture globale ≥ 60 % avec la configuration honnête de B-02, et pas de baisse par rapport à l'état avant migration.
- [ ] Durée de `npm test` notée avant et après dans le Journal (3,8 s aujourd'hui) ; pas plus du double.

## Tests à ajouter ou adapter

- `src/test/factories.test.ts` : chaque fabrique produit un objet valide ; ids uniques ; `resetFactories` remet les compteurs à zéro.
- Un test de bout en bout de la couche client : `BottlesPage` crée une bouteille, `captureRequest('post', '/api/bottles')` vérifie le corps exact envoyé.
- Un test d'erreur par page CRUD : `mockApiError('delete', '/api/units/:id', 409, 'Unité utilisée')` → message affiché.
- Couvrir les fichiers que la revue liste sans test et qu'aucune autre tâche ne reprend : `Pagination` (si E-09 ne l'a pas fait), `useSort`, `usePagination`, `SearchInput`, `useClickOutside`.

## Points d'attention

- Tâche longue : la découper si besoin en deux PR (infrastructure + 4 pages, puis le reste). Le premier lot doit déjà supprimer les `as never` des fichiers qu'il touche.
- B-04 monte Vitest, jsdom et jest-dom ; partir de sa version de `setup.ts`. E-03 y ajoute un polyfill de `<dialog>` : le conserver.
- `touches` contient `src/**/*.test.tsx` : cette tâche entre en conflit avec toutes les tâches frontend qui ajoutent des tests. La lancer quand peu de PR frontend sont ouvertes.
- E-05 à E-08 réécrivent des tests de page. Si elles sont fusionnées avant, migrer leurs nouveaux tests ici ; si elles sont fusionnées après, leurs agents doivent écrire directement avec MSW (préciser dans leur PR).

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
