---
id: C-24
title: "Disponibilité : une ligne de recette « -- » ne rend plus le cocktail indisponible"
phase: C
lane: backend
criticite: haute
effort: S
status: done
owner: agent
depends_on: [C-08, C-21]
touches: [backend/src/services/availabilityService.ts, backend/src/services/availabilityService.test.ts, backend/src/routes/public.test.ts, backend/AGENTS.md]
sources: []
branch: fix/C-24-orphan-lines-public-availability
pr: https://github.com/Lulu300/carta-cocktail/pull/78
---

## Contexte

Depuis C-08 (PR #75), les routes publiques renvoient `available = cocktail.isAvailable && maxServings > 0`. Un cocktail `available: false` est grisé, marqué « Unavailable » et ne s'ouvre plus sur la carte publique (`PublicCocktailItem.tsx`). C-21 (PR #71) conserve volontairement les lignes de recette dont la source a été supprimée avant v1.8.0 : le formulaire admin les affiche sur « -- ». La revue de la PR #77 (notes de v1.10.0, point 3) a relevé que ces lignes rendent le cocktail indisponible pour les invités. Correctif à merger avant la release v1.10.0.

## Problème constaté

`backend/src/services/availabilityService.ts` :
- `resolveLine` renvoie `INVALID_CONFIGURATION` pour une ligne dont la clé de sa source est NULL, et `{ kind: 'invalid', reason: 'X not found' }` pour une clé qui désigne une ligne absente du stock.
- `describeLine` marque la ligne `isAvailable: false`, `computeAvailability` en déduit `isAvailable = false` (une ligne indisponible au moins) puis `maxServings = 0`.
- Résultat : un cocktail activé dont toutes les autres sources sont en stock passe `available: false` sur la carte publique, et « Indisponible » dans la liste admin, alors que rien ne manque au stock.

## Lignes concernées (lignes « orphelines »)

Une ligne dont le `sourceType` est connu (`BOTTLE`, `CATEGORY` ou `INGREDIENT`) et dont la source de ce type est absente :
- **clé NULL** : `bottleId` pour `BOTTLE`, `categoryId` pour `CATEGORY`, `ingredientId` pour `INGREDIENT`. Ce sont les lignes que `ON DELETE SET NULL` (`0_init`) a laissées jusqu'à v1.7.0, que le formulaire affiche sur « -- » et que C-21 accepte au PUT (comptage par `sourceType` des lignes à clé NULL). Les autres clés ne comptent pas : une ligne `BOTTLE` à `bottleId` NULL et `categoryId` renseigné est aussi orpheline (le formulaire affiche « -- » et ne renvoie que la clé du type) ;
- **clé introuvable** : la clé désigne une ligne absente du stock chargé. Depuis C-07 les clés sont en `ON DELETE RESTRICT`, ce cas ne peut venir que d'une suppression entre les requêtes parallèles de `loadStock`, ou d'une base modifiée à la main : la source n'existe plus, c'est le même défaut ;
- **quantité indifférente** : une ligne orpheline à quantité 0 est traitée de la même façon.

Ne sont **pas** concernées :
- une ligne au `sourceType` inconnu : configuration invalide, refusée par la validation depuis C-04, elle rend toujours le cocktail indisponible ;
- une ligne à quantité 0 dont la source existe : non mesurée, elle demande seulement que la source ait du stock (comportement de C-08 inchangé) ;
- un ingrédient désactivé (`isAvailable: false`) : vrai manque, le cocktail reste indisponible.

## Ce qu'il faut faire

Décision de l'humain (2026-10-11) : une ligne « -- » n'affecte plus la disponibilité publique ; un ingrédient désactivé continue de rendre le cocktail indisponible.

1. Dans `resolveLine`, distinguer la ligne orpheline (`kind: 'orphan'`) de la configuration invalide (`kind: 'invalid'`, `sourceType` inconnu). Les `reason` restent les mêmes (« Invalid ingredient configuration » pour une clé NULL, « Bottle/Category/Ingredient not found » pour une clé introuvable).
2. La ligne orpheline reste décrite comme avant : `name: 'Unknown'`, `isAvailable: false`, `availableCount: null`, son `reason`, et son nom dans `missingIngredients`. L'admin voit toujours le défaut (encadré « Manquant » de la liste des cocktails).
3. Dans `computeAvailability`, `isAvailable` ignore les lignes orphelines ; `maxServings` vient donc des autres ressources (999 si aucune n'est mesurée).
4. Aucun changement de forme JSON, ni dans `routes/public.ts` (qui lit déjà `maxServings`), ni dans le frontend.

## Critères d'acceptation

- [x] Un cocktail activé avec une ligne orpheline (chaque `sourceType`, clé NULL ou introuvable, quantité 0 comprise) et le reste en stock : `available: true` dans `GET /api/public/menus/:slug` et `GET /api/public/cocktails/:id`.
- [x] La ligne orpheline garde `isAvailable: false`, son `reason` et sa place dans `missingIngredients`.
- [x] `maxServings` d'un tel cocktail est celui des autres ressources ; 999 si toutes ses lignes sont orphelines.
- [x] Un ingrédient désactivé, ou une source en rupture, rend toujours le cocktail indisponible, même à côté d'une ligne orpheline.
- [x] Une ligne au `sourceType` inconnu rend toujours le cocktail indisponible.
- [x] Forme JSON inchangée ; aucun fichier frontend modifié.
- [x] `npm test -- --coverage`, `npx tsc --noEmit`, `npm run build` passent dans `backend/` ; couverture des lignes modifiées ≥ 80 %.

## Tests à ajouter ou adapter

- `backend/src/services/availabilityService.test.ts` (`computeAvailability`, sans base) : ligne orpheline à côté d'une bouteille en stock pour chaque `sourceType`, clé NULL et clé introuvable, quantité 0, clé d'un autre type renseignée → cocktail disponible, portions de la bouteille, ligne signalée ; seulement des lignes orphelines → 999 ; ligne orpheline et bouteille vide → indisponible ; `sourceType` inconnu → indisponible ; ingrédient désactivé à côté d'une ligne orpheline → indisponible.
- `backend/src/routes/public.test.ts` : cocktail activé avec une ligne orpheline et le reste en stock → `available: true` (carte et détail) ; cocktail activé avec un ingrédient désactivé → `available: false`.

## Points d'attention

- La liste admin des cocktails suit le même calcul : un tel cocktail affiche ses portions au lieu de « Indisponible », avec l'encadré « Manquant : Unknown » qui signale toujours la ligne. L'aperçu admin de la carte affiche aussi ses portions.
- Un cocktail dont toutes les lignes sont orphelines devient disponible avec 999 portions (« ∞ ») : rien ne manque au stock. L'admin le voit dans « Manquant ».
- `missingIngredients` n'est plus vide seulement quand le cocktail est indisponible : le frontend lit les deux champs séparément (`CocktailsPage.tsx`), rien n'en dépend.
- Le détail public d'un tel cocktail s'ouvre à nouveau ; il s'ouvrait déjà en v1.9.0 (grisé sur `isAvailable` seul), l'affichage de la ligne orpheline n'a pas changé depuis.

## Journal

- 2026-10-11 : tâche créée à partir du point 3 de la revue de la PR #77 (notes de v1.10.0).
- 2026-10-11 : Décision de l'humain 2026-10-11 : les lignes « -- » (source supprimée avant v1.8.0, conservées par C-21) n'affectent plus la disponibilité publique ; un ingrédient désactivé continue de rendre le cocktail indisponible (vrai manque).
- 2026-10-11 : fait (PR #78). `resolveLine` renvoie `kind: 'orphan'` pour une ligne dont la source de son type est absente (clé NULL ou introuvable), `kind: 'invalid'` reste réservé au `sourceType` inconnu ; `reason` inchangés. `computeAvailability` ignore les lignes orphelines pour `isAvailable`, la ligne reste indisponible et dans `missingIngredients`. Aucun changement dans `routes/public.ts` ni dans le frontend ; `backend/AGENTS.md` (section disponibilité) ajouté aux `touches` et complété. 723 tests, couverture des lignes modifiées 100 %.
- Notes de version : une ligne de recette affichée « -- » (source supprimée avant v1.8.0) ne rend plus le cocktail indisponible sur la carte publique ; elle reste signalée dans « Manquant » de la liste admin des cocktails, qui affiche désormais les portions du cocktail au lieu de « Indisponible ». Un ingrédient désactivé rend toujours le cocktail indisponible. À reprendre dans les notes de v1.10.0 (#77), qui disent l'inverse. Aucune action requise, pas de `breaking: true`.
