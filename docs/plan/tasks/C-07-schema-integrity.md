---
id: C-07
title: "Intégrité du schéma : onDelete explicites, index, contraintes d'unicité"
phase: C
lane: backend
criticite: haute
effort: M
status: done
owner: agent
depends_on: [C-01, C-03]
touches: [backend/prisma/schema.prisma, backend/prisma/migrations/, backend/src/routes/categories.ts, backend/src/routes/bottles.ts, backend/src/routes/ingredients.ts, backend/src/routes/units.ts, backend/src/services/integrityService.ts, backend/src/services/deletionService.ts, backend/src/utils/uniqueness.ts, backend/scripts/check-integrity.ts, backend/src/i18n/, backend/src/test/helpers.ts, backend/src/app.test.ts]
sources: ["02-backend-data-perf.md §2.3", "02-backend-data-perf.md §2.4", "02-backend-data-perf.md §2.5"]
branch: feature/C-07-schema-integrity
pr: https://github.com/Lulu300/carta-cocktail/pull/60
---

## Décisions validées (2026-10-08)

- **Suppression** : bloquée par défaut (409 avec la liste des cocktails et bouteilles impactés). L'admin peut ensuite **forcer** une suppression en cascade, après une confirmation explicite des risques (voir l'étape « Suppression forcée » et E-15 pour l'interface).
- **`Cocktail.name`** : pas de contrainte d'unicité. Les doublons sont signalés à l'import, sans tenir compte de la casse (C-09).

## Contexte

Le schéma laisse SQLite appliquer des règles implicites dangereuses. Supprimer une bouteille, une catégorie ou un ingrédient casse en silence les recettes qui les utilisent. Supprimer une catégorie supprime toutes ses bouteilles. Les imports apparient par nom alors que rien n'empêche deux catégories ou deux unités homonymes. Aucune clé étrangère n'est indexée.

## Problème constaté

Vérifié sur `backend/prisma/schema.prisma` et sur le SQL réel (`sqlite3 backend/prisma/carta_cocktail.db ".schema CocktailIngredient"`) :
- `CocktailIngredient.bottle`, `.category`, `.ingredient` (`schema.prisma:102,104,106`) : `ON DELETE SET NULL`. Une suppression laisse des lignes `sourceType='BOTTLE', bottleId=NULL`, que `availabilityService.ts:186` classe « Invalid ingredient configuration » : le cocktail devient indisponible sans avertissement.
- `Bottle.category` (`:40`) : `onDelete: Cascade`. `DELETE /api/categories/:id` (`routes/categories.ts:113`) supprime les bouteilles et leurs `MenuBottle` sans contrôle.
- `CocktailPreferredBottle.bottle` (`:117`) : `ON DELETE RESTRICT` implicite. Supprimer une bouteille « préférée » échoue, alors que la même bouteille en ingrédient direct passe en SetNull. `bottles.ts:422` renvoie `cannotDelete` dans les deux cas.
- `CocktailIngredient.unit` (`:99`) : `RESTRICT` implicite, message générique (`units.ts:83`).
- Unicité absente : `Category.name` (`:25`), `Unit.abbreviation` (`:71`), `Cocktail.name` (`:79`). Les imports apparient par ces champs (`bottles.ts:178`, `cocktails.ts:238`, seed `:88`).
- Le rapport qualifie le handler P2002 de `cocktails.ts:416` de code mort : **imprécis**. Il est atteint quand l'import crée un ingrédient dont le nom existe (`Ingredient.name @unique`) ou une préférence en double.
- Index : seuls les index d'unicité existent (`Menu_slug_key`, `Ingredient_name_key`, `User_email_key` et trois composés). Aucun index sur les FK.
- `Category.type` est une `String` sans FK vers `CategoryType.name` (`:27`).

## Ce qu'il faut faire

1. **Avant toute migration** : `src/services/integrityService.ts` exporte `findIntegrityIssues(db)` (lecture seule) et `backend/scripts/check-integrity.ts` l'appelle (`npx tsx scripts/check-integrity.ts`, code de sortie 1 si un problème bloquant est trouvé). Requêtes :
   ```sql
   SELECT lower(name) AS k, COUNT(*) AS n FROM Category GROUP BY k HAVING n > 1;
   SELECT abbreviation, COUNT(*) AS n FROM Unit GROUP BY abbreviation HAVING n > 1;
   SELECT lower(name) AS k, COUNT(*) AS n FROM Cocktail GROUP BY k HAVING n > 1;
   SELECT id, cocktailId, sourceType FROM CocktailIngredient
    WHERE (sourceType = 'BOTTLE' AND bottleId IS NULL) OR (sourceType = 'CATEGORY' AND categoryId IS NULL)
       OR (sourceType = 'INGREDIENT' AND ingredientId IS NULL) OR sourceType NOT IN ('BOTTLE', 'CATEGORY', 'INGREDIENT');
   SELECT DISTINCT type FROM Category WHERE type NOT IN (SELECT name FROM CategoryType);
   ```
2. `schema.prisma` :
   - `CocktailIngredient.bottle`, `.category`, `.ingredient`, `.unit` : `onDelete: Restrict` explicite ;
   - `Bottle.category` : `onDelete: Restrict` ;
   - `CocktailPreferredBottle.bottle` : `onDelete: Cascade` ;
   - `@unique` sur `Category.name` et `Unit.abbreviation` (pas sur `Cocktail.name`, décision validée) ;
   - `@@index` : `CocktailIngredient([cocktailId])`, `([bottleId])`, `([categoryId])`, `([ingredientId])`, `([unitId])` ; `CocktailPreferredBottle([bottleId])` ; `CocktailInstruction([cocktailId])` ; `MenuCocktail([cocktailId])`, `([menuSectionId])` ; `MenuBottle([bottleId])`, `([menuSectionId])` ; `MenuSection([menuId])` ; `Bottle([categoryId])` ; `Category([type])`.
3. `npx prisma migrate dev --name schema_integrity`. Relire le SQL : Prisma recrée les tables SQLite (`PRAGMA foreign_keys=OFF`, `INSERT INTO "new_…" SELECT`, `PRAGMA foreign_key_check`). Vérifier qu'aucune colonne n'est perdue.
4. Contrôles avant suppression, plus parlants que le P2003 générique mappé par C-03 :
   - `categories.ts` DELETE : bouteilles présentes → `ConflictError('errors.categoryNotEmpty', { bottles: n })` ; utilisée par des recettes → `ConflictError('errors.inUseByCocktails', { cocktails: [{ id, name }] })` ;
   - `bottles.ts`, `ingredients.ts`, `units.ts` DELETE : `errors.inUseByCocktails` avec la liste.
5. **Suppression forcée** (décision validée) : les routes DELETE de `bottles`, `categories` et `ingredients` acceptent `?force=true`. Tout se passe dans une `$transaction` :
   - bouteille : supprimer les lignes `CocktailIngredient` qui la référencent, ses `CocktailPreferredBottle` et ses `MenuBottle`, puis la bouteille ;
   - ingrédient : supprimer les lignes `CocktailIngredient` qui le référencent, puis l'ingrédient ;
   - catégorie : appliquer la suppression forcée à chacune de ses bouteilles, supprimer les lignes `CATEGORY` qui la référencent, puis la catégorie ;
   - réponse 200 : `{ deleted: true, impact: { cocktails: [{ id, name, removedLines }], bottles: [{ id, name }] } }`.
   Le schéma reste en `Restrict` : la cascade est toujours explicite dans le code, jamais implicite en base. Les unités n'ont pas de forçage : une ligne de recette sans unité n'a pas de sens, l'admin change d'abord l'unité des lignes concernées. La réponse 409 par défaut utilise le même format `details` (cocktails et bouteilles impactés), pour que l'interface affiche la liste avant de proposer le forçage.
6. Unicité côté routes (`categories.ts`, `units.ts`) : avant création ou renommage, comparer en minuscules en JS et lever `ConflictError()`. Prisma ne propose pas de comparaison insensible à la casse sur SQLite.
7. Optionnel, seulement si le reste tient dans l'effort M : `Category.type` en vraie relation vers `CategoryType.name` (`onDelete: Restrict`, `onUpdate: Cascade`). Sinon, créer une nouvelle tâche.

## Critères d'acceptation

- [x] `DELETE …?force=true` sur une bouteille, un ingrédient ou une catégorie utilisés → 200, suppression en cascade dans une transaction, `impact` liste les cocktails modifiés ; en cas d'erreur, rien n'est supprimé.
- [x] Le script d'intégrité a tourné sur une copie de la prod ; résultat joint à la PR.
- [x] Migration `schema_integrity` versionnée ; `npm run db:check` (C-01) passe.
- [x] Supprimer une bouteille, catégorie, unité ou ingrédient utilisé par une recette → 409 avec la liste des cocktails ; rien n'est supprimé.
- [x] Supprimer une catégorie non vide → 409 ; bouteilles intactes.
- [x] Supprimer une bouteille seulement « préférée » → 200 ; la préférence disparaît.
- [x] Créer la catégorie « rhum » quand « Rhum » existe → 409.
- [x] `EXPLAIN QUERY PLAN SELECT * FROM CocktailIngredient WHERE cocktailId = 1` utilise un index.

## Tests à ajouter ou adapter

- Suppression forcée : bouteille utilisée dans deux cocktails → 200, lignes supprimées, `impact.cocktails` de longueur 2 ; catégorie non vide utilisée en `CATEGORY` → bouteilles, lignes et catégorie supprimées ; erreur simulée en cours de transaction → aucune suppression ; `DELETE /units/:id?force=true` → toujours 409.
- `src/services/integrityService.test.ts` : catégories « Rhum »/« rhum » → doublon signalé ; ligne `BOTTLE` sans `bottleId` → signalée ; base propre → aucun problème.
- `categories.test.ts` : DELETE avec bouteilles → 409 et bouteilles présentes ; DELETE d'une catégorie utilisée en `CATEGORY` → 409 avec `details.cocktails[0].name` ; POST doublon de casse → 409.
- `bottles.test.ts` : DELETE d'une bouteille utilisée en `BOTTLE` → 409 ; DELETE d'une bouteille seulement préférée → 200 et `CocktailPreferredBottle` vide.
- `ingredients.test.ts`, `units.test.ts` : DELETE utilisé → 409 avec liste ; POST d'une unité à l'abréviation existante → 409.
- Adapter les tests existants qui supprimaient une catégorie avec bouteilles en attendant 200.

## Points d'attention

- **Migration de données** : une contrainte `@unique` échoue s'il existe des doublons. `migrate deploy` tournant au démarrage du conteneur (C-01), un doublon en prod **bloque le démarrage**. Procédure : lancer le script sur une copie de la prod avant de livrer, fusionner ou renommer les doublons à la main, puis livrer. La copie `pre-migrate` de C-01 permet de revenir en arrière.
- Décisions validées le 2026-10-08 : voir en tête.
- Les lignes orphelines existantes ne sont pas corrigées par la migration : le script les liste pour correction manuelle.
- Le frontend affiche le message serveur (A-10) mais pas encore `details.cocktails` : à prévoir dans E-05.
- La comparaison en minuscules ne gère pas les accents (« Écorce »/« ecorce ») : acceptable.
- Une seule tâche de schéma à la fois : C-11 et C-15 attendent. `bottles.ts` est aussi touché par C-06 et C-10 : enchaîner.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
- 2026-10-10 : fait (PR #60). Schéma (`Restrict` explicites, `Cascade` sur les bouteilles préférées, `@unique` sur `Category.name` et `Unit.abbreviation`, 14 index), migration `20261010173910_schema_integrity`, `findIntegrityIssues` et `scripts/check-integrity.ts` (`--counts-only`), suppressions gardées dans `src/services/deletionService.ts` (409 avec `details`, `?force=true` en `$transaction`, pas de forçage pour les unités), unicité insensible à la casse dans `src/utils/uniqueness.ts`.
- 2026-10-10 : écarts et choix. Migration générée par `prisma migrate diff` (`migrate dev` refuse le mode non interactif), avec les deux index uniques déplacés en tête : SQLite n'exécute pas la migration dans une transaction, et dans l'ordre de Prisma un doublon arrêtait la migration après la reconstruction de `Bottle` (essai sur base jetable). `PRAGMA foreign_key_check` ajouté à la main (Prisma 6 ne le génère plus) : il n'arrête pas la migration, d'où le contrôle `foreignKeyViolations` du script. Le 409 d'une catégorie non vide utilise le format commun `{ cocktails, bottles }` (liste des bouteilles) plutôt que `{ bottles: n }`. Les doublons de catégories à la casse près sont bloquants pour le script (la migration ne refuse que les doublons exacts). `touches` complété : `deletionService.ts`, `uniqueness.ts`, `src/test/helpers.ts` (fabrique `seedCocktailUsing`), `src/app.test.ts` (deux cas adaptés). Étape 7 (relation `Category.type`) non faite : nouvelle tâche C-17. Nouvelles tâches C-18 (reprise après une migration en échec) et C-19 (imports et casse).
- 2026-10-10 : jeu d'essai réel (copie temporaire, montée en v1.6.0) : 0 doublon de catégorie, d'unité et de cocktail, 0 ligne orpheline, 0 type inconnu, 0 violation de clé étrangère ; migration appliquée sans perte de lignes. Banc conforme 1.4.0 → 1.6.0 → 1.7.0 → local : `friend` 69 OK, 0 échec ; `official` 67 OK, 1 échec attendu (bug photos v1.4.0), 0 inattendu.
- 2026-10-10 : Notes de version : `breaking: true` proposé. Le conteneur refuse de démarrer si des catégories ou des unités sont en double. Avant la mise à jour : lancer `scripts/check-integrity.ts` de la nouvelle image sur une copie de la base et corriger les doublons. Après : la suppression d'un élément utilisé est refusée (409 avec la liste des cocktails), y compris une catégorie qui contient des bouteilles. Retour arrière : copie `pre-migrate` de C-01, ou `migrate resolve --rolled-back` (la migration s'arrête sur sa première instruction). Section « Required actions » dans la PR, à valider par l'humain.
- 2026-10-10 : reste à l'humain : valider la section « Required actions » et `breaking: true`. Côté interface, l'affichage de `details` et le forçage sont prévus dans E-05 et E-15.
