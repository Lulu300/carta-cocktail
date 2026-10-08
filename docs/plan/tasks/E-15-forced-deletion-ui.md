---
id: E-15
title: "Admin : suppression forcée avec confirmation explicite des risques"
phase: E
lane: frontend
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [C-07, E-04, E-05]
touches: [frontend/src/pages/admin/BottlesPage.tsx, frontend/src/pages/admin/CategoriesPage.tsx, frontend/src/pages/admin/IngredientsPage.tsx, frontend/src/components/admin/, frontend/src/queries/, frontend/src/services/api.ts, frontend/src/i18n/locales/]
sources: ["02-backend-data-perf.md §2.3", "05-frontend-archi.md §H2"]
branch:
pr:
---

## Décisions validées (2026-10-08)

- **Suppression** : bloquée par défaut, avec la liste des éléments impactés. L'admin peut soit corriger lui-même les recettes puis supprimer, soit **forcer** la suppression en cascade après avoir lu et accepté les risques.

## Contexte

C-07 change le comportement du backend. Supprimer une bouteille, un ingrédient ou une catégorie encore utilisés renvoie désormais un 409 avec la liste des cocktails et bouteilles concernés, au lieu de casser les recettes en silence. Le même appel avec `?force=true` supprime en cascade, dans une transaction. Cette tâche branche ce comportement dans l'admin. Les unités n'ont pas de forçage.

## Problème constaté

- Après E-05, un 409 affiche la liste des éléments impactés, mais l'admin n'a aucun moyen de forcer la suppression depuis l'interface.
- `services/api.ts` : les méthodes `delete` des ressources n'acceptent pas d'option.

## Ce qu'il faut faire

1. `services/api.ts` : `bottlesApi.delete(id, { force?: boolean })`, idem pour `categoriesApi` et `ingredientsApi`. Ajouter `?force=true` quand l'option est vraie. `ApiError` (A-10) conserve `details` du corps de la réponse 409.
2. Hook `useForcedDelete(resource)` dans `queries/` (ou `components/admin/`) :
   - appel normal ;
   - sur un 409 avec `details` : ouvrir `useConfirm()` (E-04) avec `tone: 'danger'`, un `details` qui liste les cocktails (avec le nombre de lignes retirées) et les bouteilles, le message « Ces recettes perdront les lignes correspondantes et deviendront incomplètes. Cette action est définitive. », `acknowledgeLabel` « Je comprends que ces recettes seront modifiées », et `confirmLabel` « Supprimer quand même » ;
   - si l'admin confirme : rappel avec `force: true`, puis toast de succès qui résume `impact` (« 3 cocktails modifiés ») et invalidation des requêtes `cocktails`, `availability`, `shortages`, `bottles` et `categories` ;
   - si l'admin annule : rien n'est supprimé, la liste reste visible pour qu'il corrige.
3. Brancher le hook dans `BottlesPage`, `CategoriesPage` et `IngredientsPage`. Pour une catégorie, la liste inclut aussi les bouteilles qui seront supprimées.
4. Unités : garder le 409 avec la liste, sans bouton de forçage, et un message qui invite à changer l'unité des lignes concernées.
5. Clés i18n en et fr pour tous les textes ci-dessus, avec des pluriels i18next (`_one` / `_other`).

## Critères d'acceptation

- [ ] Suppression d'un élément utilisé : la boîte liste les impacts, le bouton « Supprimer quand même » est désactivé tant que la case n'est pas cochée.
- [ ] Après confirmation, l'élément est supprimé et un toast résume l'impact ; les listes et la disponibilité sont à jour sans recharger la page.
- [ ] Annuler ne supprime rien.
- [ ] Unités : pas d'option de forçage.
- [ ] Tous les textes passent par i18n, en et fr.

## Tests à ajouter ou adapter

- `BottlesPage.test.tsx` : DELETE → 409 avec `details` → boîte affichée avec les noms des cocktails ; case non cochée → bouton désactivé ; case cochée et confirmation → second appel avec `force: true`, puis toast.
- `CategoriesPage.test.tsx` : la liste contient les bouteilles de la catégorie.
- `UnitsPage.test.tsx` : 409 → message, pas de bouton de forçage.
- `api.test.ts` : `delete(id, { force: true })` appelle l'URL avec `?force=true`.

## Points d'attention

- Le focus initial doit être sur « Annuler » (comportement `tone: 'danger'` d'E-04).
- Ne pas proposer le forçage si la réponse 409 ne contient pas `details` (ancien backend, ou conflit d'une autre nature comme un slug déjà pris).

## Journal

- 2026-10-08 : tâche créée suite à la décision sur la suppression (C-07).
