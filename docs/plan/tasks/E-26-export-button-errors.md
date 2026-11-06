---
id: E-26
title: "Export d'une recette : échec silencieux et tags publics découpés à la main"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [E-06]
touches: [frontend/src/components/ui/ExportCocktailButton.tsx, frontend/src/components/ui/ExportCocktailButton.test.tsx, frontend/src/pages/public/PublicCocktailItem.tsx, frontend/src/pages/public/PublicCocktailItem.test.tsx, frontend/src/components/admin/cocktails/parseTags.ts, frontend/src/utils/]
sources: ["05-frontend-archi.md §4.2"]
branch:
pr:
---

## Contexte

E-06 a remplacé les `console.error` de `CocktailsPage` par des toasts et regroupé le découpage des tags dans `parseTags` (`components/admin/cocktails/parseTags.ts`). Deux fichiers hors de son périmètre gardent l'ancien comportement.

## Problème constaté

- `components/ui/ExportCocktailButton.tsx` : un export qui échoue (réseau, 404, 500) part dans `console.error('Export failed:', error)`. Rien ne s'affiche, ni dans la liste admin ni sur la fiche publique : l'utilisateur clique et il ne se passe rien.
- `pages/public/PublicCocktailItem.tsx` découpe encore `cocktail.tags` avec `split(',')`, sans retirer les entrées vides : « rum, ,mint » affiche un badge vide.

## Ce qu'il faut faire

1. `ExportCocktailButton` : `toast.error(error)` à la place du `console.error`.
2. Déplacer `parseTags` dans `utils/` (il ne dépend de rien d'admin), mettre à jour ses imports, et l'utiliser dans `PublicCocktailItem`.

## Critères d'acceptation

- [ ] Un export qui échoue affiche un toast d'erreur, côté admin comme côté public.
- [ ] Plus de `split(',')` ni de `console.error` dans les deux fichiers.
- [ ] Une fiche publique avec les tags « rum, ,mint » affiche deux badges.

## Tests à ajouter ou adapter

- `ExportCocktailButton.test.tsx` : échec de l'API → toast d'erreur.
- `PublicCocktailItem.test.tsx` : tags avec entrée vide.

## Points d'attention

- Le Toaster est monté dans `main.tsx` pour toute l'application, pages publiques comprises : rien à ajouter côté mise en page.

## Journal

- 2026-10-12 : tâche créée par E-06 (hors périmètre de sa PR).
- 2026-10-12 : B-15 (PR #111) a changé ce bouton : la prop `cocktailName` est supprimée, `exportRecipe` et `exportCocktail` renvoient `{ filename, data }` (nom lu dans l'en-tête `Content-Disposition`). Partir de `develop` après #111.
- 2026-10-12 : relecture de B-15 (PR #111) : le téléchargement d'un fichier (Blob → URL d'objet → `<a download>` temporaire → clic → révocation) est écrit quatre fois : `services/exportZip.ts`, `components/ui/ExportCocktailButton.tsx`, `bottles.exportFile` et `backup.exportBackup` dans `services/api.ts`. L'extraire dans `frontend/src/utils/` à l'occasion de cette tâche (ajouter alors `services/api.ts` et `services/exportZip.ts` à `touches`), ou en faire une petite tâche E.
