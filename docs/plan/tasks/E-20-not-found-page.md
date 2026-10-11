---
id: E-20
title: "Vraie page 404 à la place de la redirection `*` → `/`"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [E-11]
touches: [frontend/src/App.tsx, frontend/src/App.test.tsx, frontend/src/pages/public/, frontend/src/i18n/locales/]
sources: ["06-frontend-ux-perf.md §2"]
branch:
pr:
---

## Contexte

E-11 distingue sur la carte publique une carte ou un cocktail introuvable (404 de l'API, avec un lien vers l'accueil ou la carte) d'une erreur de chargement (avec « Réessayer »). Une adresse qui ne correspond à aucune route n'en profite pas : le routeur renvoie vers l'accueil sans rien dire.

## Problème constaté

- `App.tsx` : la route de repli `<Route path="*" element={<Navigate to="/" />} />` envoie toute adresse inconnue vers `/`. Un invité qui suit un lien mal recopié (QR code imprimé avec une faute, ancienne adresse) arrive sur l'accueil sans savoir pourquoi.
- La redirection remplace l'adresse demandée : impossible de voir ce qui a été mal saisi.
- Point relevé dans les « Points d'attention » d'E-11, hors de son périmètre (il faut toucher `App.tsx`).

## Ce qu'il faut faire

- Ajouter une page « introuvable » publique (dans `pages/public/`, sous `PublicLayout`) pour la route `*`, sans redirection : titre « Page introuvable », lien vers l'accueil. Réutiliser la présentation « introuvable » d'E-11 (`EmptyState`, même icône et même style de lien) plutôt que d'en créer une nouvelle.
- Textes en i18n (en et fr).
- Les routes `/admin/*` inconnues : décider avec l'humain si elles affichent la même page ou une variante dans `AdminLayout` (voir « Points d'attention »).

## Critères d'acceptation

- [ ] `/nimporte-quoi` affiche « Page introuvable » et un lien vers l'accueil ; l'adresse reste celle demandée.
- [ ] `/`, `/menu/:slug`, `/menu/:slug/cocktail/:id`, `/login` et `/admin/*` se comportent comme avant.
- [ ] Couverture ≥ 80 % sur les lignes modifiées.

## Tests à ajouter ou adapter

- `App.test.tsx` : une route inconnue rend la page introuvable, sans redirection vers `/`.
- Test de la nouvelle page (texte, lien vers l'accueil).

## Points d'attention

- E-18 (`route-error-boundary`) touche aussi `App.tsx` : ne pas les lancer en parallèle.
- Décision humaine à prendre pour les routes admin inconnues (même page publique ou page dans l'interface admin).

## Journal

- 2026-10-11 : tâche créée pendant E-11 (redirection `*` → `/` relevée dans ses « Points d'attention », hors périmètre).
