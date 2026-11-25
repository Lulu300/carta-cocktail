---
id: C-68
title: "Import de bouteilles : une ligne ne peut pas aller dans une catégorie existante dont une catégorie du fichier porte le nom à la casse près"
phase: C
lane: backend
criticite: basse
effort: M
status: todo
owner: agent
depends_on: [C-66]
touches: [backend/src/routes/bottles.ts, backend/src/validation/bottleImport.ts, backend/src/routes/bottles.test.ts, frontend/src/types/index.ts, frontend/src/components/import/bottleImportResolutions.ts, frontend/src/components/import/bottleImportResolutions.test.ts, frontend/src/components/import/BottleImportRowsStep.tsx, frontend/src/components/import/ImportBottlesWizard.test.tsx]
sources: []
branch:
pr:
---

## Contexte

Trouvé pendant C-66. Une ligne de bouteilles désigne sa catégorie par un nom (`resolutions.bottles[i].categoryName`, sinon celui du fichier). La confirmation (`POST /api/bottles/import/confirm`) cherche d'abord la résolution de catégorie de ce nom en minuscules (`resolvedCategories`), puis seulement la catégorie existante de ce nom (`existingCategories.findUnambiguous`).

## Problème constaté

Quand une catégorie du fichier a une résolution qui mène ailleurs que la catégorie existante de même nom à la casse près, aucune ligne ne peut aller dans cette catégorie existante :

- Base `Rhum` et `RHUM`, fichier `rhum` résolu vers `RHUM` (C-64) : une ligne qui choisit `Rhum` envoie `Rhum`, la confirmation lit la résolution de `rhum` et la range dans `RHUM`.
- Base `Rhum`, fichier `Rhum` créé sous le nom `Rhum agricole` : une ligne qui choisit `Rhum` va dans `Rhum agricole`.

Depuis C-66, le sélecteur de la ligne n'offre plus ces catégories (il ne propose que celles qu'une ligne peut atteindre par leur nom) : l'admin ne peut pas y ranger une bouteille de ce fichier, sauf à l'importer ailleurs puis la déplacer.

## Ce qu'il faut faire

1. Permettre à une ligne de désigner la catégorie choisie sans ambiguïté, par exemple un `categoryId` dans la résolution de ligne pour une catégorie existante, le nom restant pour une catégorie créée par l'import.
2. Proposer alors dans le sélecteur toutes les catégories existantes, et afficher celle que la confirmation utilisera.

## Critères d'acceptation

- [ ] Dans les deux cas ci-dessus, une ligne peut être rangée dans `Rhum`.
- [ ] Une ligne qui garde le nom du fichier va toujours dans la catégorie résolue pour ce nom.

## Tests à ajouter ou adapter

- `backend/src/routes/bottles.test.ts` : ligne rangée dans une catégorie existante dont le nom, à la casse près, a une résolution qui mène ailleurs.
- `bottleImportResolutions.test.ts`, `ImportBottlesWizard.test.tsx` : options et valeur envoyée.

## Points d'attention

- Compatibilité de l'API : une résolution de ligne par nom seul doit rester acceptée.

## Journal

- 2026-11-25 : tâche créée pendant C-66 (hors périmètre : la règle de la confirmation, que C-66 reproduit côté frontend sans la changer).
