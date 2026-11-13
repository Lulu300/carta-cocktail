---
id: E-18
title: "Écran d'erreur récupérable quand une page ou un chunk ne se charge pas (error boundary)"
phase: E
lane: frontend
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: [E-01]
touches: [frontend/src/App.tsx, frontend/src/App.test.tsx, frontend/src/components/layout/, frontend/src/i18n/locales/]
sources: ["06-frontend-ux-perf.md §1"]
branch: feature/E-18-route-error-boundary
pr: https://github.com/Lulu300/carta-cocktail/pull/165
---

## Contexte

Depuis E-01, les pages admin et la page de connexion sont chargées à la demande. Un chunk peut donc manquer : déploiement entre deux navigations, réseau coupé dans le bar, fichier purgé du cache. E-01 recharge la page une fois sur `vite:preloadError`, avec une garde de 10 s contre les boucles. Si le chunk manque encore après ce rechargement, ou si une page lève une erreur au rendu, rien ne l'intercepte.

## Problème constaté

- Aucun error boundary dans `frontend/src/` : ni composant `ErrorBoundary`, ni `errorElement` (le routeur est un `<BrowserRouter>` déclaratif, pas un data router).
- Vérifié pendant E-01 avec Playwright contre `vite preview` : un `LoginPage-*.js` en 404 provoque un rechargement (attendu), puis, comme le chunk manque toujours, React démonte toute l'application. L'utilisateur voit une page vide, sans message ni bouton.
- Même résultat pour toute exception levée pendant le rendu d'une page, publique comme admin.

## Ce qu'il faut faire

1. Créer un composant de classe `RouteErrorBoundary` (React n'offre pas d'équivalent en hook), dans `components/layout/` :
   - `getDerivedStateFromError` mémorise l'erreur ;
   - l'écran reprend le style de `RouteFallback` (fond `#0f0f1a`), avec un message traduit et deux actions : « Recharger » (`window.location.reload()`) et « Retour à l'accueil » (lien vers `/`) ;
   - réinitialiser l'état quand l'emplacement change (clé sur `location.pathname` ou `componentDidUpdate`), pour que la navigation vers une autre page fonctionne sans recharger.
2. Dans `App.tsx`, envelopper le `<Suspense>` dans ce boundary.
3. Traductions `errors.pageLoadFailed`, `errors.reload`, `errors.backHome` en `en` et `fr` (coordonner avec E-10 et E-17, qui touchent aussi les fichiers de traduction).

## Critères d'acceptation

- [x] Un chunk introuvable après le rechargement automatique affiche l'écran d'erreur traduit, pas une page vide.
- [x] Une exception au rendu d'une page affiche le même écran ; les autres routes restent accessibles en naviguant.
- [x] « Recharger » recharge la page ; « Retour à l'accueil » mène à `/`.
- [x] Aucun texte en dur.

## Tests à ajouter ou adapter

- `frontend/src/App.test.tsx` : une page lazy mockée dont l'import rejette → l'écran d'erreur s'affiche ; une page qui lève au rendu → idem ; navigation vers `/` après l'erreur → la page d'accueil s'affiche.
- Test du composant seul : bouton « Recharger » appelle `window.location.reload` (simulé).

## Points d'attention

- Ne pas retirer le rechargement automatique de E-01 (`utils/chunkReload.ts`) : le boundary sert seulement quand ce rechargement n'a pas suffi.
- Si une tâche passe plus tard à un data router (`createBrowserRouter`), remplacer le boundary par un `errorElement`.

## Journal

- 2026-10-09 : tâche créée pendant E-01 (vérification Playwright du rechargement après un chunk manquant).
- 2026-11-12 : faite dans la PR #165 (`feature/E-18-route-error-boundary`). Faits revérifiés sur `develop` : toujours un `<BrowserRouter>` déclaratif sans error boundary, `RouteFallback` dans `App.tsx`, `utils/chunkReload.ts` inchangé (non modifié ici). `RouteErrorBoundary` (`components/layout/`) enveloppe le `<Suspense>` d'`App.tsx` ; l'erreur s'efface quand `pathname` change, sauf dans la mise à jour même qui a échoué (sinon la page en échec serait rendue une seconde fois, test à l'appui). Clés `errors.pageLoadFailed` et `errors.reload` dans le paquet public d'E-30 (l'écran fait partie du premier chargement) ; « Retour à l'accueil » réutilise `public.backHome` au lieu d'une clé `errors.backHome` en double. Premier chargement : 132,31 kB gzip avant, 132,60 kB après (budget 140 kB inchangé). Vérifié dans Chromium contre `vite preview` : `LoginPage-*.js` en 404 donne un rechargement automatique puis l'écran d'erreur, et « Retour à l'accueil » affiche la page d'accueil. Aucune action requise.
- 2026-11-12 : PR docs de suivi du lot D-35/E-18/B-20/C-12, d'après la relecture de la PR #165. Error boundary admin qui garde la barre latérale, focus et annonce de l'écran d'erreur, erreur sur `/` : suivis dans E-38. Piste sans tâche : la classe de lien `text-accent hover:text-accent-soft underline underline-offset-4` est répétée dans `CocktailForm`, `PublicErrorState` et `RouteErrorBoundary` ; un composant `TextLink` pourrait la porter.
