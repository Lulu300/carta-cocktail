---
id: C-08
title: "Calcul de disponibilité : 5 requêtes au lieu de 600, et des volumes justes"
phase: C
lane: backend
criticite: haute
effort: M
status: todo
owner: agent
depends_on: [A-05, C-02]
touches: [backend/src/services/availabilityService.ts, backend/src/services/availabilityService.test.ts, backend/src/routes/availability.ts, backend/src/routes/public.ts, backend/src/routes/public.test.ts]
sources: ["02-backend-data-perf.md §3.1", "02-backend-data-perf.md §3.2", "02-backend-data-perf.md §3.3"]
branch:
pr:
---

## Décisions validées (2026-10-08)

- **Bouteilles préférées** : toutes les bouteilles de la catégorie comptent dans le calcul. Chaque ligne `CATEGORY` qui a des préférées expose en plus `preferredAvailable: boolean` (au moins une préférée non vide). L'admin affiche un avertissement quand c'est `false` (affichage dans E-06).
- **`Cocktail.isAvailable`** : sur la carte publique, un cocktail est disponible si l'interrupteur manuel est activé **et** si le stock permet au moins une portion. Le backend expose ce champ combiné, l'affichage est fait dans E-11.

## Contexte

La disponibilité (nombre de portions possibles avec le stock) s'affiche dans la liste admin des cocktails et dans l'aperçu de la carte. Le calcul actuel fait une requête par ingrédient et par cocktail, et compte faux pour la moitié des unités du seed. Objectif : charger les données en quelques requêtes, puis calculer avec une fonction pure, testable sans base.

## Problème constaté

`src/services/availabilityService.ts` :
- `:257-279` : boucle séquentielle sur les cocktails ; chacun fait un `findUnique` (`:199`) puis une requête par ingrédient (`:88`, `:108`, `:144`). Soit 1 + N × (1 + M) requêtes : environ 600 pour 100 cocktails de 5 ingrédients. Les mêmes catégories sont relues des dizaines de fois.
- `:6-22` : table `UNIT_TO_ML` en dur, alors que `Unit.conversionFactorToMl` existe (`schema.prisma:72`) et est déjà chargé (`include: { unit: true }`, `:203`). Les unités du seed `g`, `goutte`, `rondelle`, `pincée`, `brin`, `branche`, `écorce`, `tasse` en sont absentes : elles passent par `:52-56` et sont comptées **comme des ml** (1 tasse = 1 ml au lieu de 250), avec un `console.warn` à chaque appel. Les unités créées par l'utilisateur sont ignorées.
- `:214-216` : chaque ligne est évaluée seule. Une bouteille de 100 ml utilisée sur deux lignes de 40 ml → 2 portions annoncées, 1 réelle.
- `:131`, `:175` : `Math.floor` sur des flottants (3 × 0,6 = 1,7999…).
- `:143-184` : `preferredBottles` ignoré pour les sources `CATEGORY`.
- `:233` : seuil « stock faible » `<= 3` en dur. `:210` : `throw new Error('Cocktail not found')`, testé par son texte dans `routes/availability.ts:18`.

## Ce qu'il faut faire

1. Types d'entrée, sans dépendance Prisma :
   ```ts
   export interface RecipeLine {
     id: number; sourceType: string; quantity: number;
     unit: { abbreviation: string; conversionFactorToMl: number | null };
     bottleId: number | null; categoryId: number | null; ingredientId: number | null;
     preferredBottleIds: number[];
   }
   export interface StockSnapshot {
     bottles: Map<number, { id: number; name: string; categoryId: number; capacityMl: number; remainingPercent: number }>;
     bottleIdsByCategory: Map<number, number[]>;
     categories: Map<number, { id: number; name: string }>;
     ingredients: Map<number, { id: number; name: string; icon: string | null; isAvailable: boolean }>;
   }
   export function computeAvailability(cocktailId: number, lines: RecipeLine[], stock: StockSnapshot): CocktailAvailability;
   ```
2. Algorithme de `computeAvailability` :
   1. Ressource de chaque ligne : `bottle:<id>`, `category:<id>` ou `ingredient:<id>`. Configuration invalide (FK absente, cible introuvable, `sourceType` inconnu) → ligne indisponible avec le `reason` actuel.
   2. `requiredMl = quantity × conversionFactorToMl`. Facteur `null` ou ≤ 0 → ligne « non mesurable », disponible si la ressource a du stock.
   3. Additionner `requiredMl` par ressource.
   4. `availableMl` = Σ `capacityMl × remainingPercent / 100` (bouteilles non vides pour une catégorie).
   5. `servings = Math.floor(availableMl / totalRequiredMl + 1e-9)`.
   6. Chaque ligne reçoit les portions de sa ressource (`availableCount`). `maxServings` = minimum sur les ressources mesurables, 999 s'il n'y en a aucune. `lowStockWarnings` si `0 < servings <= LOW_STOCK_THRESHOLD` (constante, 3).
   Garder **exactement** la forme de réponse (`CocktailAvailability`, `IngredientAvailability`, `reason` compris) : le frontend la lit (`CocktailsPage.tsx:116-154`, `PublicCocktailItem.tsx:62-66`, `types/index.ts:205-290`).
3. `loadStock(db = prisma)` : `bottle.findMany`, `category.findMany`, `ingredient.findMany` avec `select` minimal, plus `cocktail.findMany` avec `ingredients` (`unit`, `preferredBottles: { select: { bottleId: true } }`). Aucune requête dans une boucle.
4. `calculateAllCocktailsAvailability(db = prisma)` : un chargement, puis `computeAvailability` par cocktail. `calculateCocktailAvailability(id, db = prisma)` : même chargement filtré sur un cocktail, `NotFoundError` (C-03) s'il n'existe pas. Si C-03 n'est pas encore mergée, garder `throw new Error('Cocktail not found')` : C-03 fera la bascule.
5. Supprimer `UNIT_TO_ML`, `convertToMl` et le `console.warn`.
6. `routes/availability.ts` : seulement l'adaptation aux signatures.

7. **Bouteilles préférées** (décision validée) : dans `computeAvailability`, pour une ligne `CATEGORY` avec `preferredBottleIds` non vide, calculer `preferredAvailable` = au moins une bouteille préférée non vide. Ce champ n'entre pas dans le calcul de `maxServings`.
8. **Disponibilité publique** (décision validée) : `GET /api/public/menus/:slug` et `GET /api/public/cocktails/:id` renvoient pour chaque cocktail `available = cocktail.isAvailable && maxServings > 0`. Un seul `loadStock` par requête. `isAvailable` reste renvoyé tel quel pour l'admin.

## Critères d'acceptation

- [ ] `preferredAvailable` présent sur les lignes `CATEGORY` avec préférées ; `available` présent et combiné dans les deux réponses publiques.
- [ ] Le nombre de requêtes de `GET /api/availability/cocktails` ne dépend pas du nombre de cocktails (8 au plus).
- [ ] « 1 tasse » consomme 250 ml ; « 2 g » ou « 1 rondelle » sont non mesurables.
- [ ] Deux lignes de 40 ml sur une bouteille de 100 ml → `maxServings = 1`.
- [ ] 3 × 0,6 ml sur 1,8 ml disponibles → 1 portion.
- [ ] La forme JSON est inchangée : tests frontend verts sans modification.
- [ ] Les décisions sur `preferredBottles` et `isAvailable` sont notées dans la PR et en commentaire du code.

## Tests à ajouter ou adapter

- `computeAvailability` : catégorie avec deux bouteilles dont la préférée vide → disponible, `preferredAvailable: false`. `public.test.ts` : cocktail `isAvailable: true` sans stock → `available: false` ; `isAvailable: false` avec stock → `available: false`.
- `src/services/availabilityService.test.ts`, partie unitaire sur `computeAvailability` (sans base, `StockSnapshot` construit à la main) :
  - facteur `null` → non mesurable : disponible si stock > 0, indisponible si la bouteille est vide ;
  - « tasse » (250) : 1 tasse sur 700 ml → 2 portions ;
  - même bouteille sur 2 lignes, même catégorie sur 2 lignes (agrégation) ;
  - catégorie : somme des bouteilles non vides ;
  - ligne `BOTTLE` avec `bottleId: null` → indisponible, `reason` « Invalid ingredient configuration » ;
  - `INGREDIENT` indisponible → `maxServings = 0` ;
  - tolérance flottante, plafond 999, seuil de stock faible.
- Partie intégration (base de test) : un `PrismaClient` jetable créé avec `log: [{ emit: 'event', level: 'query' }]` et passé en paramètre ; même nombre de requêtes pour 1 et 20 cocktails.
- `routes/availability.test.ts` : les tests existants restent verts (ils fixent `conversionFactorToMl: 10` sur `cl`) ; ajouter un cas « tasse ».

## Points d'attention

- Décisions produit validées le 2026-10-08 : voir en tête.
- Une bouteille utilisée sur une ligne `BOTTLE` et comptée dans sa catégorie sur une autre ligne est comptée deux fois. Cas rare : le documenter dans le code.
- Changement visible : les cocktails qui utilisent g, rondelle, tasse… peuvent changer d'état. C'est la correction attendue ; le signaler dans la PR.
- `missingIngredients` et `reason` restent en anglais et non traduits (P3, hors périmètre).
- Les bouteilles avec `capacityMl = 0` (défaut de l'import CSV, `bottlesImport.ts:146`) donnent 0 portion : C-10 refuse ces lignes.
- Pas de cache : inutile après la réécriture (rapport 02 §3.3).
- `availabilityService.ts` est aussi touché par C-03 (une ligne) : enchaîner.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
