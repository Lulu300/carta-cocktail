---
id: C-12
title: "Messages d'erreur backend : clés manquantes, textes en dur, test de cohérence"
phase: C
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-03]
touches: [backend/src/i18n/, backend/src/routes/categoryTypes.ts, backend/src/routes/menuSections.ts, backend/src/routes/backup.ts, backend/src/middleware/auth.ts]
sources: ["01-backend-routes.md §M1", "01-backend-routes.md §R7"]
branch:
pr:
---

## Contexte

Les messages d'erreur passent par `req.t()`, mais trois clés appelées n'existent pas : l'API renvoie alors la clé brute (« menuBottles.synced »). Plusieurs routes répondent en anglais en dur, quelle que soit la langue. Un test automatique doit empêcher que ça revienne, d'autant que beaucoup de tâches de la phase C ajoutent des clés.

## Problème constaté

- Clés appelées mais absentes de `src/i18n/en.json` et `fr.json` : `errors.cannotDeleteDefaultMenu` (`routes/menus.ts:169`), `menuBottles.deleted` (`routes/menuBottles.ts:87`), `menuBottles.synced` (`routes/menuBottles.ts:166`).
- Messages en dur :
  - `routes/categoryTypes.ts` : `:30,58,84,101` `'Server error'` (disparus avec C-03), `:39` `'Name is required'`, `:45` `'Type already exists'`, `:69` `'Type not found'`, `:94` `'Type is in use by categories'` (en 400, devrait être 409), `:98` `'Type deleted'` ;
  - `routes/menuSections.ts:79` `'Section deleted'`, `:107` `'Sections reordered'` ;
  - `routes/menuBottles.ts:116` (réécrit par C-06) ; `routes/backup.ts:30,43,78,144` (réécrit par C-05) ; `routes/bottles.ts:110`, message brut du parseur (traité par C-03 puis C-10) ;
  - `middleware/auth.ts:12` `'Unauthorized'`, `:22` `'Invalid token'`.
- Réponses de succès hétérogènes : `{ message }` (DELETE), `{ success, message }` (`backup.ts:144`), `{ updated }` (`ingredients.ts:29`), l'entité (POST/PUT).
- `en.json` et `fr.json` ont aujourd'hui les mêmes clés : rien ne le garantit.

## Ce qu'il faut faire

1. Ajouter dans les deux fichiers : `errors.cannotDeleteDefaultMenu`, `errors.typeInUse`, `errors.invalidToken`, `menuBottles.deleted`, `menuBottles.synced`, `menuSections.deleted`, `menuSections.reordered`, `categoryTypes.deleted`.
2. `categoryTypes.ts` : erreurs C-03 à la place des textes (`BadRequestError()`, `ConflictError()`, `NotFoundError()`, `ConflictError('errors.typeInUse')` en **409**) ; `{ message: req.t('categoryTypes.deleted') }`.
3. `menuSections.ts:79,107` : `req.t('menuSections.deleted')`, `req.t('menuSections.reordered')`.
4. `middleware/auth.ts` : `req.t('errors.unauthorized')` et `req.t('errors.invalidToken')`, ou `throw new UnauthorizedError(...)` si C-11 a rendu le middleware `async`.
5. `backup.ts` : si C-05 n'est pas mergée, traduire les 4 messages ; sinon vérifier qu'il n'en reste aucun.
6. Convention de réponse : `{ message }` traduit pour les DELETE et les actions sans entité (`/sync`, `/reorder`, import de backup) ; l'entité pour POST/PUT. Garder les champs en plus (`added`, `removed`, `updated`, `skippedFiles`). Le frontend ignore le corps de la réponse d'import (`frontend/src/pages/admin/SettingsPage.tsx:116`) : retirer `success`.
7. `src/i18n/i18n.test.ts` :
   - lit tous les `.ts` de `src/` hors `*.test.ts` ;
   - extrait les clés avec `/\bt\(\s*['"`]([\w.]+)['"`]/g` et `/new \w+Error\(\s*['"`]([\w.]+)['"`]/g` ;
   - vérifie que chaque clé existe dans `en.json` **et** `fr.json` (chemin pointé) ;
   - vérifie que les deux fichiers ont exactement le même ensemble de clés ;
   - vérifie qu'aucun fichier de `src/routes` ni `src/middleware` ne contient `error: '` suivi d'un texte littéral (regex `/error:\s*['"`]/`).

## Critères d'acceptation

- [ ] `i18n.test.ts` passe, et échoue si on ajoute `req.t('foo.bar')` sans la clé.
- [ ] Plus aucun message d'erreur littéral dans `src/routes` ni `src/middleware`.
- [ ] `DELETE /api/category-types/:name` d'un type utilisé → 409 traduit.
- [ ] `Accept-Language: fr` sur `DELETE /api/menu-bottles/:id` → message français, pas la clé brute.

## Tests à ajouter ou adapter

- `src/i18n/i18n.test.ts` (étape 7).
- `categoryTypes.test.ts` : adapter `:84` (400 → 409) ; POST sans nom avec `Accept-Language: fr` → message français.
- `menuSections.test.ts` : DELETE et reorder renvoient un `message` traduit (fr et en).
- `menuBottles.test.ts` : DELETE → `message` différent de `'menuBottles.deleted'`.
- `auth.test.ts` : token invalide avec `Accept-Language: fr` → message français.
- `menus.test.ts` : DELETE du menu apéritifs → 403 avec un message différent de la clé brute.

## Points d'attention

- Les clés des autres tâches (C-03, C-05, C-06, C-07, C-09, C-10, C-11, C-13, C-14) sont ajoutées par ces tâches ; le test de cohérence attrapera les oublis de celles qui passent après.
- `en.json`/`fr.json` sont modifiés par beaucoup de tâches : conflits fréquents mais simples. Garder les clés regroupées par section.
- `backend/AGENTS.md` indique `i18n/locales/en.json` ; le vrai chemin est `src/i18n/en.json` (D-09 corrige).
- Conflits : `middleware/auth.ts` (C-11), `backup.ts` (C-05, B-07), `categoryTypes.ts` (C-14). Enchaîner.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
