---
id: C-17
title: "Category.type en vraie relation vers CategoryType"
phase: C
lane: backend
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [C-07, C-14]
touches: [backend/prisma/schema.prisma, backend/prisma/migrations/, backend/prisma/seed.ts, backend/src/routes/categories.ts, backend/src/routes/categoryTypes.ts, backend/src/routes/bottles.ts, backend/src/routes/cocktails.ts, backend/src/services/categoryTypeService.ts, backend/src/i18n/]
sources: ["02-backend-data-perf.md §2.3"]
branch:
pr:
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
