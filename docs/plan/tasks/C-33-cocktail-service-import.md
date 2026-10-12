---
id: C-33
title: "Cocktails : service CRUD et import fiable (suite de C-09)"
phase: C
lane: backend
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [C-09]
touches: [backend/src/routes/cocktails.ts, backend/src/services/cocktail, backend/src/routes/cocktails.test.ts, backend/src/i18n/]
sources: ["01-backend-routes.md §H4", "01-backend-routes.md §H5", "01-backend-routes.md §M2", "02-backend-data-perf.md §2.2"]
branch:
pr:
---

## Décisions validées (2026-10-08)

- **Nom de cocktail** : pas unique (décision C-07). L'aperçu d'import signale un cocktail existant de même nom sans tenir compte de la casse (`alreadyExists`), sans bloquer l'import.

## Contexte

Seconde moitié de C-09, découpée le 2026-10-12 (décision de l'humain, diff estimé à ~1 800 lignes). C-09 a livré `services/cocktail/` avec `includes.ts` (`cocktailInclude` admin, `select` public de A-05), `cocktailExport.ts` (builder unique, nom de fichier), `cocktailImage.ts` (upload, suppression best effort, `safeUploadPath`) et `cocktailService.removeCocktail(id)`. Il reste dans `routes/cocktails.ts` le CRUD et l'import (preview, confirm), soit environ 430 lignes.

## Problème constaté

Import (`routes/cocktails.ts`, handler `POST /import/confirm`) :
- `unitId: unitId || 0` : unité non résolue → FK sur l'id 0 → rollback et 500, sans dire quelle unité.
- Bouteille ignorée et catégorie non résolue → `sourceType: 'INGREDIENT'` avec `ingredientId: null`. Même chose pour `CATEGORY` et `INGREDIENT` non résolus : ligne orpheline écrite.
- `continue` silencieux si la catégorie d'une bouteille à créer n'est pas résolue.
- 4 boucles de résolution quasi identiques ; handler d'environ 150 lignes.
- Preview : `name: { equals }` sensible à la casse (« Mojito » ≠ « mojito ») ; `{ id, name: match[matchField], ...match }`, le spread écrase `name`.

CRUD :
- Existence de `unitId`, `bottleId`, `categoryId`, `ingredientId`, `preferredBottleIds` non vérifiée : erreur de FK, 400 générique sans détail.
- `mapIngredient` (CRUD) et la construction des lignes de l'import sont deux mappings distincts.

## Ce qu'il faut faire

1. `services/cocktail/cocktailService.ts` (déjà créé par C-09 avec `removeCocktail`) :
   - `createCocktail(input)`, `updateCocktail(id, input)` : lignes et instructions remplacées **seulement** si le tableau est fourni, en une transaction (A-03), avec `refuseNewRecipeDefects` conservé ;
   - `toIngredientCreate(line, index)` : mapping unique, utilisé aussi par l'import ;
   - `assertTargetsExist(tx, lines)` → `BadRequestError('errors.unknownReference', [{ line, field, id }])`.
2. `services/cocktail/cocktailImport.ts` : `preview(recipe)` et `confirm(recipe, resolutions)` ; une fonction générique `resolveEntities(tx, kind, resolutions)` remplace les 4 boucles ; les champs créés viennent des schémas de C-04 (liste blanche).
3. Règles d'import :
   - chaque ligne doit finir avec une unité résolue et la FK de son `sourceType` résolue. Bouteille ignorée → repli `CATEGORY` si la catégorie est résolue, sinon `BadRequestError('errors.importUnresolved', [{ line, kind, name }])`. Plus de `unitId: 0`, plus d'`ingredientId: null` ;
   - bouteille à créer sans catégorie résolue → même erreur (plus de `continue`) ;
   - preview : `alreadyExists` comparé en minuscules ; `{ ...match, id: match.id, name: match[matchField] }`.
4. Routes : `cocktails.ts` ne garde que validation (C-04), appel de service et réponse. Si besoin, séparer l'import dans `routes/cocktailImport.ts`, monté sous le même préfixe (ajouter le fichier à `touches`).
5. Clés i18n (en, fr) : `errors.importUnresolved`, `errors.unknownReference`.

## Critères d'acceptation

- [ ] `cocktails.ts` < 200 lignes ; aucun handler > 30 lignes.
- [ ] Un seul mapping de lignes d'ingrédient (CRUD et import).
- [ ] Import avec une unité non résolue → 400 qui nomme l'unité ; rien n'est créé.
- [ ] Aucun import ne crée de ligne `CocktailIngredient` dont la FK de `sourceType` est nulle.
- [ ] POST ou PUT avec un `unitId`, `bottleId`, `categoryId`, `ingredientId` ou `preferredBottleIds` inexistant → 400 `unknownReference` qui donne la ligne et le champ.
- [ ] Contrat HTTP inchangé (mêmes routes, mêmes formes de réponse) ; mise à jour partielle de A-03 intacte.

## Tests à ajouter ou adapter

- `src/services/cocktail/cocktailImport.test.ts` (base de test) : unité non résolue → erreur détaillée ; bouteille ignorée + catégorie résolue → ligne `CATEGORY` ; bouteille ignorée sans catégorie → erreur et aucune écriture ; bouteille à créer sans catégorie → erreur ; `alreadyExists` insensible à la casse ; `existingMatch.name` vaut le champ comparé.
- `cocktails.test.ts` : POST avec `unitId` inexistant → 400 `unknownReference` ; PUT avec `preferredBottleIds` inexistant → 400 `unknownReference`, recette intacte ; tests A-03 existants toujours verts.

## Points d'attention

- Ne pas défaire A-03 (mise à jour partielle transactionnelle, défauts déjà stockés tolérés).
- Le wizard (`frontend/src/components/import/ImportCocktailWizard.tsx`) affiche le message d'erreur générique (A-10) ; le détail par ligne viendra avec E-08.
- C-19 (noms insensibles à la casse dans les imports) passe après cette tâche.
- Ne pas toucher à `public.ts` ni à l'export : réglés par C-09.

## Journal

- 2026-10-12 : tâche créée par découpage de C-09 (décision de l'humain) : service CRUD et import fiable, critères et tests repris de C-09.
