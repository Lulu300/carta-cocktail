---
id: C-38
title: "Cocktails : afficher le détail des refus importUnresolved et unknownReference"
phase: C
lane: frontend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-33, E-23]
touches: [frontend/src/components/import/, frontend/src/components/admin/cocktails/, frontend/src/services/api.ts, frontend/src/i18n/locales/]
sources: ["01-backend-routes.md §H4"]
branch: fix/C-38-cocktail-import-refusal-details
pr: https://github.com/Lulu300/carta-cocktail/pull/235
---

## Contexte

Trouvé pendant C-33. Le backend refuse maintenant en 400, avec un `details` propre à chaque clé :

- `POST /api/cocktails/import/confirm` : `errors.importUnresolved`, `details: [{ line, kind, name }]`. `line` est l'index de la ligne de la recette (0 pour la première), `kind` vaut `unit`, `category`, `bottle` ou `ingredient`, `name` est l'abréviation de l'unité ou le nom de la source dans le fichier (`null` pour une ligne sans unité). Cas : unité non résolue, source non résolue, bouteille ignorée sans catégorie résolue, bouteille à créer sans catégorie résolue.
- `POST` et `PUT /api/cocktails` (et la confirmation d'import quand un `existingId` ne désigne aucune ligne) : `errors.unknownReference`, `details: [{ line, field, id }]`, `field` valant `unitId`, `bottleId`, `categoryId`, `ingredientId` ou `preferredBottleIds`.

## Problème constaté

- `ImportCocktailWizard.tsx` passe `error.message` à l'étape `error` (`ImportFailure`, `ImportCocktailResults.tsx`) : l'admin voit le message traduit (« certaines unités, bouteilles… ne sont ni associées ni créées »), sans savoir lesquelles. `ApiError.body.details` n'est lu nulle part pour ces deux clés.
- `CocktailEditor.tsx` (`useCreateCocktail`, `useUpdateCocktail`) affiche le message seul : pour `unknownReference` (élément supprimé entre le chargement du formulaire et l'enregistrement), la ligne n'est pas indiquée.
- E-23 traite les `details` de validation zod (`{ path, code }`), pas ces deux formes.

## Ce qu'il faut faire

1. Lire `details` de ces deux clés depuis `ApiError.body` (forme vérifiée, liste vide si mal formée), en réutilisant ce qu'E-23 aura posé dans `services/api.ts`.
2. Assistant d'import : sous le message d'erreur, une ligne par entrée (« Ligne 2 : unité « cl » non résolue », « Ligne 1 : bouteille « Havana » à créer sans catégorie »…), et proposer « Retour » vers l'étape de résolution.
3. Formulaire cocktail : signaler la ligne et le champ concernés (« Ligne 3 : l'ingrédient choisi n'existe plus »).
4. Clés i18n en et fr ; numéros de ligne affichés à partir de 1.

## Critères d'acceptation

- [x] Une confirmation d'import refusée avec `importUnresolved` liste chaque élément non résolu avec sa ligne et son nom.
- [x] Un enregistrement refusé avec `unknownReference` nomme la ligne et le champ.
- [x] Des `details` absents ou mal formés gardent le message actuel.

## Tests à ajouter ou adapter

- `ImportCocktailWizard.test.tsx` : confirmation mockée en 400 `importUnresolved` → lignes affichées.
- Test du formulaire cocktail : 400 `unknownReference` → ligne et champ affichés.

## Points d'attention

- Le contrat des `details` est décrit dans `backend/src/services/cocktail/cocktailImport.ts` (`UnresolvedReference`) et `cocktailService.ts` (`UnknownReference`).
- Coordonner avec E-23 pour un seul composant d'affichage des détails d'erreur.

## Journal

- 2026-10-12 : tâche créée par C-33 : le frontend n'affiche pas les `details` des nouvelles 400 `importUnresolved` et `unknownReference`.
- 2026-11-26 : PR #235. Vérifié contre le code actuel (après C-19, C-62, C-64, C-65) : contrats `UnresolvedReference` et `UnknownReference` inchangés, aucun refus de l'import de cocktails n'affichait encore ses `details`. `ApiError` lit les deux formes (`unresolvedReferences()`, `unknownReferences()`) à côté de `validationIssues()` d'E-23 (400 seulement, entrées mal formées écartées). `utils/refusalDetails.ts` en fait des phrases (ligne comptée à partir de 1, noms de champs `validation.fields.*` d'E-23) et y ajoute les problèmes de validation : l'écran d'erreur de l'assistant (confirmation et aperçu) les liste sous le message du backend. « Réessayer » ramenait déjà à l'étape de résolution avec les choix gardés : pas de second bouton « Retour ». Formulaire : le descripteur de toasts d'E-23 devient `refusalMessage`, qui nomme la première ligne et le champ d'une `unknownReference`. Frontend seul, bundle public 136,00 kB. Amélioration possible : nommer dans l'assistant l'élément du fichier d'une `unknownReference` (le `details` ne donne que l'id).
- 2026-11-26 : Notes de version : quand l'import d'un cocktail est refusé parce qu'une unité, une catégorie, une bouteille ou un ingrédient n'est ni associé ni créé, l'écran d'erreur liste chacun avec sa ligne et son nom ; quand un cocktail enregistré désigne un élément supprimé entre-temps, le message d'erreur nomme la ligne et le champ. Aucune action requise.
