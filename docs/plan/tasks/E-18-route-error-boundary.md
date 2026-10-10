---
id: E-18
title: "Écran d'erreur récupérable quand une page ou un chunk ne se charge pas (error boundary)"
phase: E
lane: frontend
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [E-01]
touches: [frontend/src/App.tsx, frontend/src/App.test.tsx, frontend/src/components/layout/, frontend/src/i18n/locales/]
sources: ["06-frontend-ux-perf.md §1"]
branch:
pr:
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

- [ ] Un chunk introuvable après le rechargement automatique affiche l'écran d'erreur traduit, pas une page vide.
- [ ] Une exception au rendu d'une page affiche le même écran ; les autres routes restent accessibles en naviguant.
- [ ] « Recharger » recharge la page ; « Retour à l'accueil » mène à `/`.
- [ ] Aucun texte en dur.

## Tests à ajouter ou adapter

- `frontend/src/App.test.tsx` : une page lazy mockée dont l'import rejette → l'écran d'erreur s'affiche ; une page qui lève au rendu → idem ; navigation vers `/` après l'erreur → la page d'accueil s'affiche.
- Test du composant seul : bouton « Recharger » appelle `window.location.reload` (simulé).

## Points d'attention

- Ne pas retirer le rechargement automatique de E-01 (`utils/chunkReload.ts`) : le boundary sert seulement quand ce rechargement n'a pas suffi.
- Si une tâche passe plus tard à un data router (`createBrowserRouter`), remplacer le boundary par un `errorElement`.

## Journal

- 2026-10-09 : tâche créée pendant E-01 (vérification Playwright du rechargement après un chunk manquant).
