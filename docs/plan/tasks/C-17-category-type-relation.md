---
id: C-17
title: "Category.type en vraie relation vers CategoryType"
phase: C
lane: backend
criticite: moyenne
effort: M
status: done
owner: agent
depends_on: [C-07, C-14]
touches: [backend/prisma/schema.prisma, backend/prisma/migrations/, backend/src/scripts/seed.ts, backend/src/routes/categories.ts, backend/src/routes/categoryTypes.ts, backend/src/routes/shortages.ts, backend/src/routes/bottles.ts, backend/src/routes/cocktails.ts, backend/src/services/categoryTypeService.ts, backend/src/services/integrityService.ts, backend/src/test/, backend/src/i18n/]
sources: ["02-backend-data-perf.md §2.3"]
branch: feature/C-17-category-type-relation
pr: https://github.com/Lulu300/carta-cocktail/pull/202
---

## Contexte

Étape 7 de C-07, optionnelle, sortie de C-07 pour garder la PR dans l'effort M. `Category.type` est une `String` sans clé étrangère vers `CategoryType.name`. L'intégrité est maintenue à la main : `ensureCategoryType` (3 copies, regroupées par C-14), le seed qui recrée les types manquants, les imports.

## Problème constaté

- Rien n'empêche une catégorie de pointer vers un type inexistant (base modifiée à la main, restauration d'une ancienne sauvegarde).
- Supprimer un `CategoryType` encore utilisé n'est contrôlé que dans la route.
- Renommer un type ne met pas à jour les catégories.
- C-07 a ajouté `@@index([type])` et le contrôle `unknownCategoryTypes` de `scripts/check-integrity.ts`, sans la relation.

## Ce qu'il faut faire

1. `schema.prisma` : `Category.categoryType CategoryType @relation(fields: [type], references: [name], onDelete: Restrict, onUpdate: Cascade)`, et la relation inverse `categories Category[]` dans `CategoryType`.
2. Migration : avant la redéfinition de la table, créer les `CategoryType` manquants (`INSERT INTO CategoryType (name, color) SELECT DISTINCT type, 'gray' FROM Category WHERE type NOT IN (SELECT name FROM CategoryType)`), pour qu'aucune base existante ne soit refusée. Relire le SQL (aucune colonne perdue, `PRAGMA foreign_key_check`), `npm run db:check`.
3. Supprimer le code de synchronisation devenu inutile (création à la volée de `ensureCategoryType` à garder seulement là où un type nouveau est saisi, synchronisation du seed).
4. `DELETE /api/category-types/:name` : s'appuyer sur la contrainte (P2003 → 409) ou sur un contrôle explicite avec la liste des catégories, sur le modèle de `deletionService.ts` (C-07).

## Critères d'acceptation

- [ ] Une catégorie ne peut plus référencer un type inexistant (création, modification, import).
- [ ] Supprimer un type utilisé → 409 ; renommer un type met à jour ses catégories.
- [ ] La migration passe sur une base dont une catégorie a un type sans `CategoryType` (le type est créé).
- [ ] `npm run db:check` passe ; le banc `scripts/upgrade-test/` passe sur le jeu d'essai.

## Tests à ajouter ou adapter

- `categoryTypes.test.ts` : suppression d'un type utilisé → 409 ; renommage → catégories mises à jour.
- `categories.test.ts` : création avec un type inconnu → type créé une seule fois.
- `integrityService.test.ts` : `unknownCategoryTypes` reste testé sur une base sans la contrainte (ou retiré si la contrainte le rend impossible).

## Points d'attention

- Une seule tâche de schéma à la fois (voir `docs/plan/README.md`).
- Le renommage d'un type passe par sa clé primaire : vérifier que la route le permet et que `onUpdate: Cascade` est bien généré dans le SQL SQLite.

## Journal

- 2026-10-10 : tâche créée pendant C-07 (étape 7 optionnelle non faite, pour rester dans l'effort M).
- 2026-10-12 : D-01 (PR #108) déplace le seed de `backend/prisma/seed.ts` vers `backend/src/scripts/seed.ts` (compilé dans `dist/`, l'image n'a plus `tsx`) : `touches` mis à jour.
- 2026-11-24 : fait dans la PR #202.
  - **Schéma.** Relation `Category.categoryType` (`Restrict` à la suppression, `Cascade` au renommage).
  - **Migration `20261124120000_category_type_relation`.** Elle crée d'abord, en gris, les types sans ligne, comme le seed le faisait à chaque démarrage. Cette instruction peut être rejouée. La migration reconstruit ensuite `Category` avec le SQL de Prisma.
  - **Code.**
    - Synchronisation du seed supprimée.
    - `ensureCategoryType` gardé aux 4 endroits où un type est saisi : création et modification de catégorie, import de bouteilles, import de cocktails.
    - `withCategoryType` (C-14) remplacé par `include: { categoryType: true }`, et le décompte de `GET /category-types` par `_count`. La forme des réponses ne change pas ; `categoryType` n'est plus jamais `null`.
    - `DELETE` garde son contrôle explicite (409 `typeInUse`) ; la contrainte le double.
    - `unknownCategoryTypes` reste (audit d'une copie avant mise à jour), testé avec les clés étrangères coupées.
  - **Écart avec la tâche.** La route ne permet pas de renommer un type (`PUT` ne change que la couleur et les traductions) ; aucun renommage n'est ajouté, hors périmètre. Le critère « renommer un type met à jour ses catégories » est vérifié au niveau de la base : test Prisma, et test sur le SQL migré.
  - **Vérifications.**
    - Nouveau test qui rejoue les migrations précédentes puis celle-ci sur une base temporaire.
    - À la main, `prisma migrate deploy` sur une base au schéma v1.14.0 avec 5 types sans ligne (dont `''`, `' SPIRIT '` et `syrup` à côté de `SYRUP`) : catégories identiques, 5 types créés, `foreign_key_check` vide.
    - Banc `1.4.0,local --mode conformant` : `friend` OK et `official` OK. 758 lignes → 763 (`_prisma_migrations`), aucune perte. La fixture n'a aucun type sans ligne.
    - `db:check` passe.
    - Couverture backend : 99,48 / 96,57 / 100 / 99,8 %.
- 2026-11-24 : revue de la PR #202 approuvée ; nits 1 et 3 appliqués avant le merge. Le commentaire de `migration.sql` ne suggère plus de relancer la migration après `migrate resolve --rolled-back` : l'`INSERT` peut s'exécuter deux fois, mais un échec après `CREATE TABLE "new_Category"` laisse cette table, il faut donc restaurer la copie `pre-migrate` (README, « Recovering from a failed migration »). Le libellé de `check-integrity` devient « Category types missing from CategoryType (created by the migration) ». Le SQL ne change pas. Nit 2 non retenu : la course entre création et suppression d'un type finit en 400 générique, sans gravité. Rebasé sur `develop` (E-58, #201).
- **Notes de version** (règle 9). `breaking: false`, aucune action requise. Au premier démarrage : copie `pre-migrate-<date>.db`, puis migration `20261124120000_category_type_relation`. Un type utilisé par une catégorie mais absent de la liste des types est créé en gris, sans traduction ; le seed le faisait déjà à chaque démarrage, donc en pratique rien n'est créé sur une instance en service. Le rapport de `check-integrity` peut encore compter des « category types missing » sur une base pas encore migrée : la migration les crée. Épinglage recommandé : `:<majeure>.<mineure>`.
