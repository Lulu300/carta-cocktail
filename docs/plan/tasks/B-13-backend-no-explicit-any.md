---
id: B-13
title: "Backend : typer les `any` restants et repasser `no-explicit-any` en erreur"
phase: B
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [B-05]
touches: [backend/eslint.config.js, backend/src/routes/categories.ts, backend/src/utils/translations.ts, backend/src/utils/translations.test.ts, backend/src/utils/records.ts, backend/src/utils/bottlesImport.ts, backend/src/test/helpers.ts, backend/src/routes/bottles.test.ts, backend/src/routes/categoryTypes.test.ts, backend/src/routes/cocktails.test.ts, backend/src/routes/menus.test.ts, backend/src/routes/public.test.ts]
sources: []
branch: chore/B-13-backend-no-explicit-any
pr: "#147"
---

## Contexte

B-05 a posé ESLint sur le backend. Pour garder la PR petite, la règle `@typescript-eslint/no-explicit-any` y est en `warn` : le code antérieur au linter contient 45 `any`. La tâche B-05 comptait sur C-04 pour les faire disparaître, mais C-04 (validation zod, PR #69) était déjà fermée et ne les a pas touchés.

## Problème constaté

`npx eslint .` dans `backend/` (2026-10-12) : 45 avertissements `no-explicit-any`, aucune erreur.

- Code : `routes/cocktails.ts` (12), `routes/public.ts` (5), `utils/bottlesImport.ts` (3), `utils/translations.ts` (2), `routes/categories.ts` (1).
- Tests : `routes/public.test.ts` (9), `routes/cocktails.test.ts` (6), `routes/bottles.test.ts` (3), `routes/categoryTypes.test.ts` (2), `routes/menus.test.ts` (2).

## Ce qu'il faut faire

1. Remplacer chaque `any` par le type réel : types Prisma (`Prisma.CocktailGetPayload<…>`), types inférés des schémas zod (`z.infer`), `unknown` suivi d'un rétrécissement, ou une interface locale.
2. Dans les tests, typer les corps de réponse (`res.body as …`) plutôt que de passer par `any`.
3. Retirer la dérogation `'@typescript-eslint/no-explicit-any': 'warn'` de `backend/eslint.config.js` (la règle revient à `error` via `tseslint.configs.recommended`).

## Critères d'acceptation

- [x] `npm run lint` dans `backend/` : 0 erreur, 0 avertissement.
- [x] Plus de dérogation `no-explicit-any` dans `backend/eslint.config.js`.
- [x] `npx tsc --noEmit` et `npm test` verts.

## Tests à ajouter ou adapter

Aucun nouveau test : seuls les types changent. Les tests existants doivent rester verts.

## Points d'attention

- Les routes sont modifiées par plusieurs tâches de la phase C : vérifier qu'aucune tâche ouverte ne touche les mêmes fichiers (`build.mjs --ready`).
- Ne pas remplacer un `any` par un cast `as unknown as X` qui masque une vraie incohérence de type : la signaler plutôt dans une nouvelle tâche.

## Journal

- 2026-10-12 : tâche créée par B-05, qui a laissé `no-explicit-any` en `warn`.
- 2026-11-05 : fait dans la PR #147. Le 2026-11-05, il restait 25 avertissements au lieu de 45 : `routes/categories.ts` (1), `utils/translations.ts` (2) et 6 fichiers de test. `routes/cocktails.ts`, `routes/public.ts` et `bottlesImport.ts` n'en contenaient plus. Dans `integrityService.ts` et `uploadsCheck.ts`, `any` n'apparaît que dans des commentaires. `parseNameTranslations` passe en `unknown` → `unknown` : la fonction transforme son entrée, et son résultat ne sert qu'à `res.json()`. `isRecord` est extrait de `bottlesImport.ts` vers `utils/records.ts` pour être partagé. `enrichWithCategoryType` devient générique. Dans les tests, les corps de réponse sont typés avec les types existants (charges d'export et d'import, modèles Prisma) ou de petites interfaces locales, et un helper `lineOfSource()` est ajouté dans `test/helpers.ts`. Aucun `as unknown as`. Aucune incohérence de type trouvée, donc ni B-17 ni B-18. `touches` mis à jour (ajout de `records.ts`, `translations.test.ts` et `test/helpers.ts` ; retrait de `cocktails.ts` et `public.ts`, qui n'ont pas changé).
