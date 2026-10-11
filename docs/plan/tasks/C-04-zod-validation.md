---
id: C-04
title: "Validation des entrées avec zod"
phase: C
lane: backend
criticite: haute
effort: M
status: done
owner: agent
depends_on: [C-03]
touches: [backend/src/validation/, backend/src/routes/, backend/package.json, backend/package-lock.json, AGENTS.md, backend/AGENTS.md, docs/plan/tasks/C-10-bottles-import-robust.md, docs/plan/tasks/E-23-validation-error-details.md]
sources: ["01-backend-routes.md §M4", "01-backend-routes.md §R2", "03-security.md §14"]
branch: feature/C-04-zod-validation
pr: https://github.com/Lulu300/carta-cocktail/pull/69
---

## Contexte

Aucune route ne valide ses entrées. Un mauvais type finit en erreur Prisma (500, ou 400 sans détail après C-03), des valeurs absurdes sont enregistrées (pourcentage à 150) et des valeurs légitimes sont déformées (`0` devient `1` ou `null`). L'import de cocktail étale dans `prisma.*.create` des objets venus d'un fichier tiers, sans liste blanche.

## Problème constaté

- `routes/categories.ts:74` : `desiredStock || 1` transforme 0 en 1 au POST ; le PUT accepte 0 (`:98`).
- `routes/bottles.ts:355` : `purchasePrice || null` efface un prix de 0 ; `:359` idem pour `alcoholPercentage`. `remainingPercent` et `alcoholPercentage` ne sont bornés nulle part (POST `:357`, PUT `:394`, import `:246`).
- `routes/cocktails.ts`, fonction `mapInstruction` (partagée par `POST /` et `PUT /:id` depuis A-03) : `text: inst.text || inst` ; avec `inst = { text: '' }`, l'objet entier part à Prisma. Fonction `mapIngredient` (même partage) : `sourceType` accepte n'importe quelle chaîne et sa cohérence avec `bottleId`/`categoryId`/`ingredientId` n'est pas vérifiée.
- `routes/bottles.ts:84,296` : `?categoryId=x` → `NaN`.
- `routes/settings.ts:26-38`, `routes/units.ts:59-64` : aucun contrôle de type.
- `routes/auth.ts:13` : `{ "email": {} }` part à Prisma.
- Mass assignment (sécurité §14) : dans le handler `POST /import/confirm` de `cocktails.ts`, les boucles sur `resolutions.units`, `resolutions.categories`, `resolutions.bottles` et `resolutions.ingredients` étalent `r.data` (`...rest`, `...bottleData`) dans `tx.<entité>.create`. On peut forcer `id`, `createdAt`, `purchasePrice`.
- Typage : `where: any`, `updateData: any`, `ing: any`, `error: any` dans la plupart des routes.

## Ce qu'il faut faire

1. Ajouter `zod` (v4) aux `dependencies` de `backend/package.json`.
2. `src/validation/validate.ts` :
   ```ts
   import { z } from 'zod';
   import type { RequestHandler, Response } from 'express';
   import { BadRequestError } from '../errors';

   type Schemas = { params?: z.ZodType; query?: z.ZodType; body?: z.ZodType };

   export function validate(schemas: Schemas): RequestHandler {
     return (req, res, next) => {
       const valid: Record<string, unknown> = {};
       const issues: { path: string; code: string; message: string }[] = [];
       for (const part of ['params', 'query', 'body'] as const) {
         const schema = schemas[part];
         if (!schema) continue;
         const r = schema.safeParse(req[part]);
         if (r.success) valid[part] = r.data;
         else issues.push(...r.error.issues.map((i) => ({ path: [part, ...i.path].join('.'), code: i.code, message: i.message })));
       }
       if (issues.length) return next(new BadRequestError('errors.validationError', issues));
       res.locals.valid = valid;
       if ('body' in valid) req.body = valid.body; // req.query est un getter en Express 5 : ne pas l'assigner
       next();
     };
   }

   export const valid = <T>(res: Response): T => res.locals.valid as T;
   ```
   Usage :
   ```ts
   router.put('/:id', validate({ params: IdParams, body: UnitUpdate }), async (req, res) => {
     const { params: { id }, body } = valid<{ params: z.infer<typeof IdParams>; body: z.infer<typeof UnitUpdate> }>(res);
   });
   ```
3. `src/validation/common.ts` : `IdParams = z.object({ id: z.coerce.number().int().positive() })` (et `MenuIdParams`), `Percent = z.number().int().min(0).max(100)`, `Translations = z.record(z.enum(['fr', 'en']), z.string().trim()).nullable()`, `OptionalIntQuery = z.coerce.number().int().positive().optional()`.
4. Un fichier de schémas par ressource dans `src/validation/` (`auth`, `settings`, `units`, `categories`, `bottles`, `ingredients`, `cocktails`, `menus`, `menuBottles`, `menuSections`, `cocktailImport`, `bottleImport`). Règles :
   - `desiredStock` entier ≥ 0 (défaut 1 appliqué avec `??`) ; `minimumPercent` : `Percent` ;
   - `capacityMl` entier > 0 ; `remainingPercent` : `Percent` ; `alcoholPercentage` 0-100 nullable ; `purchasePrice` ≥ 0 nullable (0 conservé) ; `openedAt` date ISO valide ou null ; `quantity` (création en lot) 1-50 ;
   - ligne d'ingrédient : `sourceType: z.enum(['BOTTLE', 'CATEGORY', 'INGREDIENT'])`, `quantity > 0`, `unitId` entier positif, et un `superRefine` qui exige la FK de `sourceType` et refuse les deux autres ; `preferredBottleIds` seulement pour `CATEGORY` ;
   - instructions : `z.array(z.union([z.string(), z.object({ text: z.string() })]))` normalisé en chaîne non vide ;
   - import cocktail : `ImportRecipeV1` (`version: 1`, `cocktail.name` requis, `ingredients[].sourceName` et `unit.abbreviation` requis) et `ImportResolutions` avec un schéma `data` **explicite** par entité (unit : `name`, `abbreviation`, `conversionFactorToMl`, `nameTranslations` ; category : `name`, `type`, `desiredStock`, `minimumPercent`, `nameTranslations` ; bottle : `name`, `categoryName`, `capacityMl`, `remainingPercent`, `alcoholPercentage` ; ingredient : `name`, `icon`, `nameTranslations`). `z.object` retire les clés inconnues : c'est la liste blanche ;
   - import bouteilles (`/bottles/import/confirm`) : schéma de `NormalizedImportPayload` avec les mêmes bornes, 2 000 lignes maximum ;
   - query de `GET /bottles` et `/bottles/export` : `categoryId` en `OptionalIntQuery`, `format` en `z.enum(['json', 'csv'])`.
5. Brancher `validate(...)` sur chaque route qui lit `params`, `query` ou `body`. Remplacer `parseInt(String(req.params.id))` par la valeur validée, supprimer les contrôles manuels devenus redondants (`if (!name) … 400`), remplacer les `any` de payload par les types inférés.
6. Garder le comportement métier (champs optionnels au PUT, défauts au POST), sauf les corrections de valeurs « falsy » de l'étape 4.

## Critères d'acceptation

- [x] Plus aucun `parseInt(String(req.params` dans `src/routes/`.
- [x] Plus aucun `any` sur `req.body`, `where` ou `updateData` dans les routes.
- [x] Une entrée invalide renvoie 400 avec `details[]` (`path`, `code`, `message`).
- [x] `POST /categories` avec `desiredStock: 0` enregistre 0 ; `POST /bottles` avec `purchasePrice: 0` enregistre 0.
- [x] `remainingPercent: 150` → 400 (POST, PUT, import confirm).
- [x] Ligne `sourceType: 'BOTTLE'` sans `bottleId` → 400 (POST et PUT cocktail).
- [x] Import cocktail : `id` ou `purchasePrice` glissés dans `resolutions.*.data` sont ignorés.
- [ ] Les formulaires admin (bouteille, cocktail, catégorie, unité, réglages) fonctionnent toujours (vérification manuelle). Non faite dans un navigateur. À la place, les payloads exacts construits par chaque formulaire et par les deux assistants d'import ont été rejoués contre les nouvelles routes (test temporaire) : tous passent, sauf la quantité 0 et un fichier d'import hors bornes, refus acceptés par l'humain.

## Tests à ajouter ou adapter

- `src/validation/*.test.ts` (unitaires, sans base) : une assertion par règle de l'étape 4, en particulier la cohérence `sourceType`/FK et la normalisation des instructions.
- `src/validation/validate.test.ts` : middleware sur une mini-app Express ; params invalides → 400 avec `details[0].path === 'params.id'` ; clés inconnues retirées du body ; `res.locals.valid` rempli.
- Tests de routes existants :
  - `categories.test.ts` : POST `desiredStock: 0` → 201 et 0 en base ;
  - `bottles.test.ts` : POST `purchasePrice: 0` → 0 en base ; PUT `remainingPercent: 150` → 400 ; `GET /api/bottles?categoryId=x` → 400 ;
  - `cocktails.test.ts` : POST ligne `BOTTLE` sans `bottleId` → 400 ; instructions `[{ text: '' }]` → 400 ; import confirm avec `data: { id: 999, name: 'u', abbreviation: 'u2' }` → l'unité créée n'a pas l'id 999 ;
  - `auth.test.ts` : `{ email: {}, password: 'x' }` → 400 ;
  - `settings.test.ts` : `siteName: 42` → 400.

## Points d'attention

- `req.query` est en lecture seule en Express 5 : ne jamais l'assigner, lire via `valid(res)`.
- Contrat frontend : un `<input type="number">` peut envoyer une chaîne. Vérifier ce que l'UI envoie (`unitId`, `capacityMl`, `categoryId`...) et utiliser `z.coerce` sur ces champs plutôt que casser l'UI.
- Le schéma `Translations` et `serializeTranslations` (C-14) doivent porter la même règle. Si C-14 est mergée avant, l'appeler dans un `.transform()`.
- Le périmètre est le **contrat**. La logique d'import (unité non résolue, lignes orphelines, `resolveEntities`) est dans C-09 ; la validation des fichiers CSV/JSON de bouteilles (BOM, séparateur, erreurs par ligne) dans C-10.
- `package.json`/`package-lock.json` : couloir `deps`, une seule tâche à la fois (A-07, B-01, B-04, B-05, B-07, C-11…).
- Garder les schémas sans dépendance à Prisma : F-05 les partagera avec le frontend.
- Touche toutes les routes : rien d'autre sur `routes/` pendant la PR.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : suivi des revues de la phase A. Références à `cocktails.ts` passées des numéros de ligne aux noms de fonction et de handler (`mapInstruction`, `mapIngredient`, `POST /import/confirm`) pour résister aux prochaines modifications. Seules celles de `mapInstruction` et `mapIngredient` (`:490,543`, `:477,528`) étaient périmées depuis A-03 ; celles de l'import étaient encore justes.
- 2026-10-11 : fait (PR #69). zod 4.6.5 ; middleware `validate()` / `valid(res)` et un fichier de schémas par ressource dans `backend/src/validation/`, sans dépendance à Prisma (plus `categoryTypes`, dont la route lit aussi `params` et `body`). Toutes les routes branchées. `Translations` utilise `z.partialRecord` : avec zod v4, `z.record` sur un enum exige toutes les langues alors que les formulaires n'envoient que celles remplies ; C-14 doit appliquer la même règle (fr/en, chaînes trimées). Contrat frontend vérifié (l'UI envoie des nombres dans les bodies : `z.coerce` seulement sur `params` et `query`) et données réelles contrôlées sur une copie de base (aucune valeur hors bornes). Décisions humaines : `quantity > 0` dès C-04 ; schéma strict à la confirmation de l'import de bouteilles (ligne ajoutée au Journal de C-10) ; création d'E-23 (affichage des `details` d'une 400). `AGENTS.md`, `backend/AGENTS.md` (modèle `validate`/`valid` au lieu de `parseInt(String(req.params.id))`), C-10 et E-23 ajoutés à `touches`.
- 2026-10-11 : suite de la revue de la PR #69. Import de bouteilles : une catégorie à créer dont le nom est vidé reprend sa clé, comme avant C-04. Import de cocktail (décision humaine) : un nom vidé dans l'assistant (unité, catégorie, bouteille, ingrédient) reprend le nom écrit dans le fichier importé, et une abréviation d'unité vidée reprend celle du fichier ; aucune nouvelle 400. Une unité dont le fichier ne donne pas de nom (fichier fait à la main ; les exports de l'app en ont toujours un) n'a pas de nom source : décision humaine, son nom est pris dans l'ordre nom saisi, nom du fichier, abréviation. La collecte des références de l'aperçu est extraite (`collectImportReferences`) pour servir aussi à la confirmation. `?force` des trois DELETE passe par un schéma de query ; l'exception de `public.ts` (404 voulu, A-05) est nommée dans `backend/AGENTS.md`. Commentaires sur la souplesse de `quantity` et du texte des étapes à l'import.
- Notes de version : les entrées invalides sont refusées en 400 avec `details[]`. Nouvelles 400 : quantité 0 sur une ligne de cocktail (UI actuelle : 0 saisi ou champ vidé) et ligne laissée sur « -- » ; **un cocktail déjà enregistré avec une ligne à quantité 0 doit être corrigé avant de pouvoir être réenregistré** (même un simple renommage renvoie 400, avec un message générique jusqu'à E-23) ; import de bouteilles d'un fichier fait à la main avec une ligne hors bornes (capacité vide ou 0, pourcentage > 100, prix négatif…) refusé en entier, à corriger puis réimporter (les fichiers exportés par l'app passent tant que les valeurs stockées respectent les nouvelles bornes) ; valeurs hors bornes (pourcentages hors 0-100, capacité ≤ 0, prix, stock désiré ou facteur de conversion négatifs) ; `quantity` > 50 refusée au lieu d'être plafonnée ; mauvais types, ids non numériques, `?categoryId=x`, `?force` répété ; `sourceType` inconnu ou incohérent avec la clé renseignée, bouteilles préférées hors `CATEGORY`, instruction vide ; nom vide au PUT (avant : ignoré) ; type de carte inconnu ; traductions hors fr/en. Valeurs désormais conservées : `desiredStock` 0, `purchasePrice` 0, `alcoholPercentage` 0. Action facultative après la mise à jour, sans perte de données : si l'enregistrement d'un cocktail échoue, corriger ses lignes à quantité 0. Pas de `breaking: true`.
