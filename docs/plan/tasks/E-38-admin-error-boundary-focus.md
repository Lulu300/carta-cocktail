---
id: E-38
title: "Écran d'erreur : garder la barre latérale admin, focus et annonce, erreur sur la page d'accueil"
phase: E
lane: frontend
criticite: basse
effort: M
status: todo
owner: agent
depends_on: [E-18]
touches: [frontend/src/App.tsx, frontend/src/App.test.tsx, frontend/src/components/layout/, frontend/src/components/ui/EmptyState.tsx, frontend/src/components/ui/EmptyState.test.tsx, frontend/src/pages/public/PublicErrorState.tsx, frontend/src/pages/public/PublicErrorState.test.tsx, frontend/src/i18n/locales/]
sources: []
branch:
pr:
---

## Contexte

E-18 (PR #165) a ajouté `RouteErrorBoundary` (`components/layout/RouteErrorBoundary.tsx`) autour du `<Suspense>` d'`App.tsx`. C'est le seul error boundary de l'application : il entoure aussi `AdminLayout`. L'écran est un `EmptyState` avec `role="alert"`, un bouton « Recharger » et un lien « Retour à l'accueil » vers `/` (`public.backHome`). L'erreur s'efface quand `pathname` change, sauf dans la mise à jour qui a échoué (garde `prevState.hasError`).

## Problème constaté

Relevé par la relecture de la PR #165 et vérifié sur `develop` (9799168) :

- Page admin en erreur (chunk introuvable ou exception au rendu) : l'écran remplace tout `AdminLayout`, barre latérale comprise, et « Retour à l'accueil » mène à la carte publique (`/`), pas à `/admin`. Le bouton Précédent du navigateur fonctionne (le chemin change).
- Erreur sur `/` : « Retour à l'accueil » ne change pas le chemin, donc n'efface pas l'erreur ; seul « Recharger » aide. Rare (la page d'accueil est dans le chunk d'entrée). Le même cas existera sur `/admin` avec un lien vers `/admin`.
- Focus et annonce : `role="alert"` est sur tout l'écran, boutons compris, donc un lecteur d'écran lit « … Recharger Retour à l'accueil » dans l'alerte. Le lien qui avait le focus disparaît et le focus retombe sur `<body>`. `PublicErrorState` (`pages/public/`) a le même `role="alert"` sur un `EmptyState` avec son action.

## Ce qu'il faut faire

1. Boundary admin : envelopper l'`<Outlet />` d'`AdminLayout` (dans `<main id={MAIN_CONTENT_ID}>`) dans un boundary qui garde la barre latérale et l'en-tête. Son écran propose « Recharger » et un lien de retour vers `/admin` (libellé traduit, par exemple le tableau de bord). Réutiliser la classe `ErrorBoundary` et l'écran de `RouteErrorBoundary` en les paramétrant (lien, conteneur plein écran ou non), sans copie. Le boundary d'`App.tsx` reste pour les pages publiques, la connexion et une erreur d'`AdminLayout` lui-même ; vérifier que le commentaire d'`App.tsx` (« one boundary is enough ») reste exact : il parle de l'unique `<Suspense>` (les navigations du routeur passent par une transition), pas de l'error boundary, et il n'y a toujours qu'une `<Suspense>`.
2. Navigation vers le chemin courant : un clic sur le lien de retour quand on est déjà sur sa cible doit effacer l'erreur. Piste : remettre à zéro sur `location.key` plutôt que sur `pathname`, en gardant la garde `prevState.hasError`. Vérifier d'abord si React Router 7 crée un nouvel emplacement (nouvelle `key`) quand on suit un lien vers l'emplacement courant. Sinon, ne pas afficher le lien quand on est déjà sur sa cible.
3. Focus et annonce : `role="alert"` sur le titre seulement (ou un `aria-live` équivalent), pas sur les actions. `EmptyState` (`components/ui/`) pose aujourd'hui les attributs reçus sur son conteneur : lui ajouter une façon de les poser sur le titre plutôt que de dupliquer son rendu. À l'affichage de l'écran, focus sur le titre (`tabIndex={-1}`) pour que le clavier reparte de l'écran d'erreur. Appliquer la même règle d'annonce à `PublicErrorState`, qui partage le motif (sans déplacer le focus là, où l'écran remplace seulement un chargement).

## Critères d'acceptation

- [ ] Une page admin qui lève au rendu ou dont le chunk manque affiche l'écran d'erreur dans `AdminLayout` : barre latérale et en-tête restent, et le lien de retour mène à `/admin`.
- [ ] Une erreur de la page d'accueil (`/`) ou du tableau de bord (`/admin`) s'efface avec le lien de retour, sans recharger.
- [ ] À l'affichage de l'écran, le focus est sur son titre ; l'alerte annoncée ne contient que le titre.
- [ ] `PublicErrorState` n'annonce plus ses boutons dans l'alerte.
- [ ] Aucun texte en dur ; `bundles.test.ts` vert.

## Tests à ajouter ou adapter

- `components/layout/RouteErrorBoundary.test.tsx` : effacement de l'erreur par un lien vers le chemin courant ; focus sur le titre ; `role="alert"` limité au titre ; axe sans violation.
- `components/layout/AdminLayout.test.tsx` (ou `App.test.tsx`) : page admin qui lève → écran dans le layout, navigation de la barre latérale toujours présente, lien vers `/admin`, puis navigation vers une autre page admin sans recharger.
- `components/ui/EmptyState.test.tsx` : attributs posés sur le titre quand on le demande, sur le conteneur sinon (comportement actuel).
- `App.test.tsx` : les tests existants du boundary restent verts (pages publiques et chunk introuvable).
- `pages/public/PublicErrorState.test.tsx` (nouveau) : l'alerte ne contient que le titre, dans les deux variantes (introuvable, erreur de chargement). Les tests de `HomePage`, `MenuPublicPage` et `CocktailPublicPage` qui lisent le texte de l'alerte doivent rester verts sans changement.

## Points d'attention

- Les clés du boundary d'`App.tsx` sont dans le paquet public d'E-30 (l'écran fait partie du premier chargement). Une clé utilisée seulement par `AdminLayout` (chunk admin) va dans `locales/admin/`, mais si le libellé est choisi dans `RouteErrorBoundary.tsx`, fichier du premier chargement, `bundles.test.ts` l'exigera dans le paquet public : laisser ce test trancher.
- Le boundary admin sous la `Suspense` d'`App.tsx` : un chunk de page qui rejette pendant une navigation est attrapé par le boundary le plus proche du composant `lazy`, donc celui de l'`Outlet`. Le vérifier par un test.
- Lien avec E-20 (page 404) : elle reprend la présentation « introuvable » de `PublicErrorState` (`EmptyState`) et touche aussi `App.tsx`, `App.test.tsx` et `pages/public/`. Celle des deux qui arrive en second suit la règle « `role="alert"` sur le titre seulement » ; ne pas les lancer en parallèle.
- `CocktailForm` (`components/admin/cocktails/`) passe aussi `role="alert"` à un `EmptyState` avec un lien : hors périmètre, le noter dans le Journal s'il faut l'aligner.
- Ne pas retirer le rechargement automatique d'E-01 (`utils/chunkReload.ts`).
- Si une tâche passe à un data router (`createBrowserRouter`), ces boundaries deviennent des `errorElement` (point d'attention d'E-18).

## Journal

- 2026-11-12 : tâche créée par la PR docs de suivi du lot D-35/E-18/B-20/C-12 à partir de la relecture de la PR #165 (E-18). Faits vérifiés sur `develop` (9799168) : un seul `RouteErrorBoundary` (`App.tsx`), `<Outlet />` d'`AdminLayout` sans boundary, remise à zéro sur `pathname`, lien vers `/`, `role="alert"` passé à `EmptyState` (sur le conteneur entier, actions comprises) dans `RouteErrorBoundary` et `PublicErrorState`.
- 2026-11-12 : E-39 (PR #175) a ajouté un troisième écran du même motif : `SessionCheckError` dans `App.tsx` (session non vérifiée au chargement, sur une erreur autre que 401), un `EmptyState` avec `role="alert"` sur tout le conteneur, bouton « Réessayer » compris. E-38 l'aligne aussi : `role="alert"` sur le titre seulement. La relecture de #175 note aussi que cet écran n'a que « Réessayer », sans lien de sortie : décision de l'humain en attente, à reprendre ici si elle revient à E-38.
