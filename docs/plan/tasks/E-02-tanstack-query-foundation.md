---
id: E-02
title: "TanStack Query : socle et premières pages (pénuries, dashboard, badge)"
phase: E
lane: frontend
criticite: haute
effort: M
status: todo
owner: agent
depends_on: [A-10, A-09]
touches: [frontend/src/main.tsx, frontend/src/queries/, frontend/src/pages/admin/ShortagesPage.tsx, frontend/src/pages/admin/DashboardPage.tsx, frontend/src/components/layout/AdminLayout.tsx, frontend/package.json, frontend/package-lock.json, frontend/src/test/test-utils.tsx]
sources: ["05-frontend-archi.md §3.1", "05-frontend-archi.md §R1", "05-frontend-archi.md §9"]
branch:
pr:
---

## Contexte

Chaque page admin recharge ses données à la main, sans cache, sans état de chargement ni d'erreur commun. Résultat pour l'admin : des compteurs à 0 quand une requête échoue, un badge de pénuries qui ne suit pas ses actions, et des listes rechargées à chaque page. Cette tâche pose la couche d'état serveur (TanStack Query v5) et migre les trois écrans les plus simples. Les pages CRUD suivent dans E-05, E-06 et E-07.

## Problème constaté

- `frontend/src/components/layout/AdminLayout.tsx:30-32` relance `GET /shortages` à chaque changement de `location.pathname`, sans annulation. Le badge n'est pas mis à jour après une mutation faite sur la même page.
- `frontend/src/pages/admin/DashboardPage.tsx:11-27` charge 5 listes complètes (bouteilles avec relations comprises) pour afficher 4 compteurs. Pas de `catch` : si une requête échoue, tout reste à 0. `/shortages` est demandé deux fois sur `/admin` (Dashboard + layout).
- `frontend/src/pages/admin/ShortagesPage.tsx:13` : `api.list().then(setItems)` sans `catch`, état initial `[]` affiché comme « aucune pénurie ». A-09 corrige l'affichage (chargement, erreur) ; cette tâche remplace le chargement manuel.
- Même motif ailleurs (`useState([])` + `useEffect(load, [])`) : `CategoriesPage.tsx:43-45`, `UnitsPage.tsx:34-35`, `MenusPage.tsx:19-20`, `BottlesPage.tsx:90-92`, etc. Hors périmètre ici.

## Ce qu'il faut faire

1. Installer `@tanstack/react-query@^5`. Les devtools sont facultatives ; si elles sont ajoutées, les charger en `lazy` et seulement en `import.meta.env.DEV`.
2. Créer `frontend/src/queries/queryClient.ts` :
   ```ts
   export function createQueryClient() {
     return new QueryClient({
       defaultOptions: {
         queries: {
           staleTime: 30_000,
           refetchOnWindowFocus: false,
           retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
         },
       },
     });
   }
   ```
   `ApiError` vient de A-10 (`services/api.ts`). Pas de retry sur 4xx.
3. Créer `frontend/src/queries/keys.ts`, la seule source des clés :
   ```ts
   export const qk = {
     shortages: ['shortages'] as const,
     categories: ['categories'] as const,
     categoryTypes: ['categoryTypes'] as const,
     bottles: ['bottles'] as const,
     ingredients: ['ingredients'] as const,
     units: ['units'] as const,
     cocktails: ['cocktails'] as const,
     cocktail: (id: number) => ['cocktails', id] as const,
     availability: ['availability'] as const,
     menus: ['menus'] as const,
     menu: (id: number) => ['menus', id] as const,
   };
   ```
4. Créer les hooks de lecture pour toutes les ressources, dans un fichier par ressource (`queries/shortages.ts`, `queries/categories.ts`, `queries/bottles.ts`, `queries/ingredients.ts`, `queries/units.ts`, `queries/categoryTypes.ts`, `queries/cocktails.ts`, `queries/menus.ts`). Signature type : `useBottles(): UseQueryResult<Bottle[], Error>`. Uniquement les lectures : les mutations sont écrites par E-05, E-06 et E-07 dans ces mêmes fichiers. Les avoir dès maintenant évite que E-05 et E-06 créent chacun leur version.
5. `main.tsx` : créer le client une fois (`const queryClient = createQueryClient()`) et envelopper l'arbre dans `<QueryClientProvider client={queryClient}>`, à l'extérieur de `AuthProvider`.
6. Migrer `ShortagesPage` : `const { data, isPending, isError, refetch } = useShortages();`. Garder les états introduits par A-09 (chargement, erreur avec bouton « Réessayer » qui appelle `refetch`, liste vide = bandeau vert seulement si `data` est défini et vide).
7. Migrer `DashboardPage` avec `useCategories`, `useBottles`, `useCocktails`, `useMenus`, `useShortages`. Afficher « … » pendant le chargement de chaque carte, « – » et un message d'erreur si la requête correspondante échoue. Ne plus afficher 0 par défaut. Les listes restent en cache pour les pages visitées ensuite.
8. Migrer le badge d'`AdminLayout` vers `useShortages()`. Comme les pages non migrées ne savent pas encore invalider `qk.shortages`, garder une invalidation transitoire :
   ```ts
   useEffect(() => { queryClient.invalidateQueries({ queryKey: qk.shortages }); }, [location.pathname]);
   ```
   avec un commentaire `// TODO E-05 : supprimer quand les mutations bouteilles/catégories invalident qk.shortages`. TanStack déduplique les appels simultanés, donc Dashboard + badge ne font plus qu'une requête.
9. Mettre à jour `src/test/test-utils.tsx` : le wrapper ajoute un `QueryClientProvider` avec un client neuf par rendu (`retry: false`, `gcTime: Infinity`). Exporter `createTestQueryClient()` pour les tests qui veulent inspecter le cache.

## Critères d'acceptation

- [ ] Sur `/admin`, l'onglet Réseau montre une seule requête `GET /api/shortages` (deux aujourd'hui).
- [ ] Navigation `/admin` → `/admin/categories` → `/admin` : les compteurs du dashboard s'affichent sans écran vide (cache), la requête de fond part seulement si les données ont plus de 30 s.
- [ ] Avec le backend arrêté, `ShortagesPage` affiche une erreur et un bouton « Réessayer », jamais le bandeau vert.
- [ ] Avec le backend arrêté, le dashboard n'affiche aucun 0 trompeur.
- [ ] Une 401 n'est pas réessayée (vérifier dans l'onglet Réseau).
- [ ] Toutes les clés de requête viennent de `queries/keys.ts` (aucun tableau littéral dans les pages).
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit` passent ; couverture ≥ 80 % sur les lignes modifiées.

## Tests à ajouter ou adapter

- `frontend/src/queries/queryClient.test.ts` : la fonction `retry` refuse une `ApiError` 404, accepte une erreur réseau puis s'arrête à 2.
- `ShortagesPage.test.tsx` : chargement visible tant que la promesse est en attente ; erreur puis clic sur « Réessayer » qui relance l'appel ; liste vide → bandeau vert ; liste non vide → cartes.
- `DashboardPage.test.tsx` : compteurs corrects ; un appel qui échoue n'affiche pas 0 pour cette carte ; `shortages.list` appelé une seule fois quand Dashboard et `AdminLayout` sont rendus ensemble.
- Nouveau `AdminLayout.test.tsx` : le badge affiche le nombre de pénuries ; un changement de route invalide la requête.
- Les tests existants qui mockent `services/api` continuent de fonctionner : ils passent par le nouveau wrapper de `test-utils`.

## Points d'attention

- `ApiError` est introduite par A-10. Si son nom ou sa forme diffèrent, adapter `retry`.
- E-13 remplacera les mocks `vi.mock('services/api')` par MSW. Ne pas anticiper ici.
- `request()` ignore aujourd'hui le `signal` d'annulation que TanStack fournit. Ce n'est pas bloquant : le cache par clé évite qu'une vieille réponse écrase une plus récente. Propager `signal` peut faire l'objet d'une tâche à part.
- Le Dashboard charge toujours 5 listes complètes pour compter. Un endpoint backend `/api/stats` serait plus léger ; ce n'est pas dans le plan, à proposer comme tâche C si la latence gêne.
- L'invalidation transitoire du point 8 doit disparaître dans E-05 (qui ajoute `AdminLayout.tsx` à ses `touches`).

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
