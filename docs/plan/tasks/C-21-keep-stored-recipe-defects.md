---
id: C-21
title: "Cocktail : accepter au PUT les défauts de recette déjà stockés"
phase: C
lane: backend
criticite: haute
effort: S
status: todo
owner: agent
depends_on: [C-04]
touches: [backend/src/validation/cocktails.ts, backend/src/validation/cocktails.test.ts, backend/src/validation/validate.ts, backend/src/services/recipeDefectsService.ts, backend/src/services/recipeDefectsService.test.ts, backend/src/routes/cocktails.ts, backend/src/routes/cocktails.test.ts]
sources: []
branch:
pr:
---

## Contexte

C-04 (PR #69) valide les entrées avec zod. Le schéma `IngredientLine` (`backend/src/validation/cocktails.ts`) exige la clé étrangère qui correspond à `sourceType` et une `quantity > 0`. La revue de la PR #70 (notes de v1.9.0, remarque 1) a relevé que des recettes déjà en base ne respectent pas ces deux règles. Correctif urgent, à merger avant la pré-version v1.9.0-rc.1.

## Problème constaté

- **Lignes orphelines** : jusqu'à v1.7.0, supprimer une bouteille, une catégorie ou un ingrédient utilisé mettait la clé de la ligne à NULL (`ON DELETE SET NULL` dans `0_init`). v1.8.0 a gardé ces lignes (`check-integrity` les signale sans bloquer). Le formulaire admin (`CocktailFormPage`) les affiche sur « -- » et renvoie `bottleId`/`categoryId`/`ingredientId: null`.
- **Lignes à quantité 0** : le formulaire envoyait 0 quand le champ était vidé (`parseFloat(...) || 0`), et l'import de cocktail accepte toujours une quantité 0.
- Avec C-04, tout `PUT /api/cocktails/:id` d'un tel cocktail renvoie 400, même un simple renommage : le formulaire renvoie toujours toutes les lignes.

## Ce qu'il faut faire

Décision de l'humain (2026-10-11) : au PUT, un défaut **déjà stocké** pour ce cocktail est accepté tel quel ; un **nouveau** défaut reste refusé en 400 ; le POST ne change pas.

1. Dériver du schéma strict une variante de ligne pour le PUT (`IngredientLineUpdate`) qui laisse passer ces deux défauts seulement (clé de la source manquante, quantité 0). Toutes les autres règles restent strictes (`sourceType` inconnu, clé d'un autre type renseignée, quantité négative, types invalides, `preferredBottleIds` hors `CATEGORY`). Pas de dépendance à Prisma dans les schémas.
2. Comparer dans la route, via un helper de service, les défauts de la requête à ceux des lignes stockées. Les lignes de la requête n'ont pas d'id (le PUT les remplace toutes) : comptage par type de défaut. Par `sourceType`, autant de lignes à source manquante que de lignes stockées de ce type avec la clé NULL ; autant de lignes à quantité 0 que de lignes stockées à quantité 0.
3. Au-delà, 400 avec le même format `details[]` que le middleware `validate` (`path` `body.ingredients.<n>.<clé>` ou `.quantity`, `code`, `message`), passé par `BadRequestError`.

## Critères d'acceptation

- [ ] Un cocktail avec une ligne orpheline (chaque `sourceType`) se renomme en renvoyant la ligne telle quelle : 200, ligne conservée.
- [ ] Même chose avec une ligne à quantité 0.
- [ ] Une nouvelle ligne orpheline ou à quantité 0 à côté d'une ligne stockée : 400 avec le bon `path`, recette inchangée.
- [ ] Un cocktail sans défaut stocké : ligne orpheline ou à quantité 0 refusée en 400 (comportement de C-04 inchangé).
- [ ] POST inchangé (400).
- [ ] Les schémas n'importent pas Prisma ; la variante est dérivée du schéma strict.
- [ ] `npm test -- --coverage`, `npx tsc --noEmit`, `npm run build` passent dans `backend/` ; couverture des lignes modifiées ≥ 80 %.

## Tests à ajouter ou adapter

- `backend/src/routes/cocktails.test.ts` : lignes défectueuses fabriquées directement en base avec Prisma ; les cas des critères ci-dessus, plus une quantité négative toujours refusée.
- `backend/src/services/recipeDefectsService.test.ts` (sans base) : comptage par type de défaut, par `sourceType`, lignes déplacées, défauts au-delà du stock, ligne à deux défauts, message identique au schéma strict.
- `backend/src/validation/cocktails.test.ts` : `IngredientLineUpdate` laisse passer les deux défauts et garde les autres règles ; `CocktailCreate` reste strict.

## Points d'attention

- Le comptage ne sait pas quelle ligne est « nouvelle » : les premières lignes défectueuses de chaque type, dans l'ordre de la requête, consomment les défauts stockés ; les suivantes sont signalées. Remplacer une ligne orpheline par une autre ligne orpheline du même type est donc accepté (le nombre de défauts n'augmente pas).
- Les défauts excédentaires ne sont contrôlés qu'après le schéma : si la requête a aussi une autre erreur de validation, seule celle-ci est signalée dans la première 400.
- L'affichage des `details` dans le formulaire reste l'objet d'E-23.

## Journal

- 2026-10-11 : tâche créée à partir de la remarque 1 de la revue de la PR #70 (notes de v1.9.0) et de la décision de l'humain.
