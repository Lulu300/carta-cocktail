---
id: E-01
title: "Découpage du bundle : routes admin en lazy, jszip à la demande"
phase: E
lane: frontend
criticite: haute
effort: S
status: done
owner: agent
depends_on: [A-10]
touches: [frontend/src/App.tsx, frontend/vite.config.ts, frontend/src/components/import/ImportStepUpload.tsx, frontend/src/services/exportZip.ts, frontend/src/main.tsx, frontend/src/utils/chunkReload.ts]
sources: ["06-frontend-ux-perf.md §0", "06-frontend-ux-perf.md §1"]
branch: feature/E-01-code-splitting
pr: https://github.com/Lulu300/carta-cocktail/pull/43
---

## Contexte

Un invité qui scanne le QR code de la carte télécharge aujourd'hui toute l'application : les 12 pages admin, les deux assistants d'import et `jszip`. Sur un téléphone en 4G dans un bar, c'est le premier écran qui attend. Les routes publiques n'ont besoin que de React, du routeur, d'i18next et de 3 pages.

## Problème constaté

- Un seul chunk JS : `dist/assets/index-*.js` fait 605,13 kB brut, 167,7 kB gzip (mesure de la revue, confirmée par le `dist/` présent dans le dépôt local : 605 126 octets). Vite avertit « chunks larger than 500 kB ».
- `frontend/src/App.tsx:3-20` importe statiquement les 17 pages et les deux layouts. Aucun `lazy()` ni `import()` dans `src/`.
- `jszip` est importé statiquement dans `frontend/src/components/import/ImportStepUpload.tsx:3` et `frontend/src/services/exportZip.ts:1`. Les deux ne servent qu'à l'admin (`CocktailsPage.tsx:9-10`), mais finissent dans le chunk unique.
- `ExportCocktailButton` (utilisé côté public par `CocktailPublicPage.tsx:9`) n'importe pas `exportZip.ts` ni `jszip` : vérifié, il ne fait qu'un `JSON.stringify`. Il peut rester dans le chunk public.
- `frontend/vite.config.ts` n'a aucune option `build`.

## Ce qu'il faut faire

1. Mesurer l'état de départ : `cd frontend && npx vite build` et noter la taille brute et gzip de chaque fichier dans le Journal de la tâche.
2. Dans `App.tsx`, garder en import statique : `PublicLayout`, `HomePage`, `MenuPublicPage`, `CocktailPublicPage`, `useAuth`. Passer tout le reste en `lazy()` :
   ```tsx
   const AdminLayout = lazy(() => import('./components/layout/AdminLayout'));
   const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
   const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
   // … une ligne par page admin
   ```
   Les pages exportent déjà un `export default`, aucun changement n'est nécessaire de leur côté.
3. Envelopper `<Routes>` dans un `<Suspense fallback={<RouteFallback />}>`. `RouteFallback` est un petit composant local à `App.tsx` : fond `#0f0f1a`, texte `t('common.loading')`. Le réutiliser dans `ProtectedRoute` à la place du « Loading... » en dur (`App.tsx:24`). Si A-10 a déjà remplacé ce texte, garder sa version.
4. Ne pas créer un `Suspense` par page admin : un seul niveau suffit. Option possible, si le flash du fallback gêne à chaque navigation admin : un second `<Suspense>` à l'intérieur de `AdminLayout` autour de `<Outlet />`. `AdminLayout.tsx` n'est pas dans `touches`, donc le faire seulement si c'est indispensable et l'ajouter à `touches`.
5. `jszip` à la demande :
   - `ImportStepUpload.tsx` : supprimer l'import ligne 3 ; dans `handleZipFile`, écrire `const { default: JSZip } = await import('jszip');` avant `JSZip.loadAsync(file)`.
   - `exportZip.ts` : même chose en tête de `exportCocktailsAsZip`.
6. Dans `vite.config.ts`, séparer les dépendances stables pour le cache long terme :
   ```ts
   build: {
     rollupOptions: {
       output: {
         manualChunks: {
           'vendor-react': ['react', 'react-dom', 'react-router-dom'],
           'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
         },
       },
     },
   },
   ```
7. Gérer l'échec de chargement d'un chunk après un déploiement (l'ancien `index.html` référence un chunk supprimé). Dans `App.tsx` (ou `main.tsx` si c'est plus propre, en l'ajoutant à `touches`) :
   ```ts
   window.addEventListener('vite:preloadError', () => window.location.reload());
   ```
   Prévoir une garde (`sessionStorage`) pour ne recharger qu'une fois et éviter une boucle.
8. Rebuilder, comparer, reporter les chiffres avant/après dans la PR.

## Critères d'acceptation

- [x] `npx vite build` ne produit plus l'avertissement « chunks larger than 500 kB ».
- [x] Le JS chargé sur `/menu/:slug` (entrée + chunks vendor) pèse au plus 120 kB gzip. Mesure reportée dans le Journal (avant : 167,7 kB).
- [x] `jszip` n'apparaît dans aucun chunk chargé par `/`, `/menu/:slug` ou `/menu/:slug/cocktail/:id` (vérifier dans l'onglet Réseau ou avec `grep -l JSZip dist/assets/*.js`).
- [x] Un chunk séparé existe pour chaque page admin et pour `LoginPage`.
- [x] Sur `/menu/:slug`, l'onglet Réseau ne montre aucune requête vers un chunk admin.
- [x] Import ZIP de recettes et export ZIP fonctionnent toujours (test manuel en dev).
- [x] Plus de texte « Loading... » en dur dans `App.tsx`.

## Tests à ajouter ou adapter

- Nouveau `frontend/src/App.test.tsx` :
  - rendu de `/admin` avec `useAuth` mocké (utilisateur connecté) : `await screen.findByText('dashboard.title')` prouve que la page lazy se charge à travers `Suspense` ;
  - rendu de `/admin` sans utilisateur : redirection vers `/login` ;
  - rendu de `/` : `HomePage` s'affiche sans attendre de chunk admin.
  Utiliser `MemoryRouter` avec `initialEntries` plutôt que le `render` de `test-utils` (qui impose `BrowserRouter`).
- `frontend/src/services/exportZip.test.ts` : le `vi.mock('jszip')` s'applique aussi aux imports dynamiques. Vérifier que le test passe sans modification, sinon l'adapter.
- Ajouter un test de `ImportStepUpload` sur un fichier `.zip` avec `jszip` mocké (aujourd'hui aucun test, voir `04-tests.md §2`), pour couvrir la ligne `await import('jszip')`.

## Points d'attention

- A-10 modifie aussi `App.tsx` (`state.from` sur la redirection). D'où la dépendance : partir de sa version.
- Le cache nginx de `index.html` (A-06) doit être `no-cache`, sinon les erreurs de chunk introuvable seront fréquentes après chaque déploiement. Le point 7 limite la casse mais ne remplace pas A-06.
- B-06 peut monter Vite vers une version basée sur Rolldown où `manualChunks` en objet change de forme. Si B-06 passe avant, adapter la syntaxe ; sinon B-06 devra reprendre ce bloc.
- E-02 ajoutera `@tanstack/react-query` au chunk d'entrée (environ 12 kB gzip), puisque le `QueryClientProvider` est dans `main.tsx`. Le budget de 120 kB est mesuré à la fin de E-01 ; le recalculer après E-02.
- Ne pas mettre `PublicLayout` en lazy : c'est le premier écran de l'invité.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-09 : mesure de départ (`npx vite build`) : un seul chunk JS, `index-*.js` 640,90 kB brut / 178,83 kB gzip (la revue mesurait 605 kB / 167,7 kB), CSS 47,05 kB / 8,43 kB gzip, avertissement « larger than 500 kB ».
- 2026-10-09 : après : 25 chunks JS, plus d'avertissement. Chargé sur `/menu/:slug` : `index` 17,74 + `vendor-react` 82,68 + `vendor-i18n` 18,42 = 118,84 kB gzip. `jszip` à part (30,15 kB gzip), un chunk par page admin et pour `LoginPage` (le plus gros : CocktailsPage, 9,20 kB gzip). `react-dom/client` ajouté à `vendor-react` : c'est une entrée distincte qui contient l'essentiel de React DOM, sans elle React DOM restait dans `index`.
- 2026-10-09 : pas de second `Suspense` dans `AdminLayout` : React Router 7 fait ses navigations dans `startTransition`, la page courante reste affichée pendant le chargement du chunk suivant. Rechargement après chunk manquant dans `utils/chunkReload.ts` (testable seul), appelé depuis `main.tsx` ; ces deux fichiers sont ajoutés à `touches`.
- 2026-10-09 : vérifié avec Playwright Chromium contre `vite preview` (API simulée) : les trois routes publiques ne chargent que `index` et les deux vendors. Les chunks de connexion, d'admin et `jszip` se chargent à la navigation. Import et export ZIP fonctionnent. Un chunk en 404 donne un seul rechargement. La page vide qui suit, faute d'error boundary, est reportée dans la nouvelle tâche E-18. PR #43.
