---
id: C-56
title: "Types de catégorie : caractères invisibles hors espaces dans un nom"
phase: C
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-55]
touches: [backend/src/services/categoryTypeService.ts, backend/src/services/categoryTypeService.test.ts, frontend/src/components/admin/categories/useCategoryTypeName.ts, frontend/src/pages/admin/CategoriesPage.test.tsx]
sources: []
branch:
pr:
---

## Contexte

Trouvé pendant la relecture de #208 (C-55, nit 2). C-55 réduit les espaces internes d'un nouveau type (`\s`, qui couvre aussi l'espace insécable, la tabulation et les sauts de ligne) et marque ceux des noms existants. Les caractères invisibles qui ne sont pas des blancs au sens de `\s` passent encore.

## Problème constaté

- L'espace sans chasse (U+200B), le gluon de mot (U+2060) et le trait d'union conditionnel (U+00AD) ne sont pas dans `\s`. `X​Y` (avec U+200B) est créé tel quel et s'affiche exactement comme `XY`, dans Manage Types comme dans la liste des types du formulaire.
- Comportement antérieur à C-55, peu probable à la saisie (copier-coller depuis une page web ou un tableur).

## Ce qu'il faut faire

1. Choisir la liste des caractères invisibles à traiter (au minimum U+200B, U+2060, U+00AD, U+FEFF hors début de nom).
2. À la création d'un nouveau type (`newCategoryTypeName`), les retirer ; un type existant choisi tel quel reste inchangé, comme dans C-55.
3. `useCategoryTypeName` : marquer leur présence dans un nom existant, comme les espaces cachés.

## Critères d'acceptation

- [ ] Un nouveau type saisi avec un de ces caractères est créé sans lui.
- [ ] Un type existant qui en contient se distingue du type sans, dans Manage Types et dans la liste des types du formulaire.
- [ ] Les noms normaux, y compris ceux qui contiennent des lettres accentuées ou non latines, restent inchangés.

## Tests à ajouter ou adapter

- `backend/src/services/categoryTypeService.test.ts` : chaque caractère retiré à la création, type existant gardé.
- `frontend/src/pages/admin/CategoriesPage.test.tsx` : marquage d'un nom existant.

## Points d'attention

- Ne pas retirer les caractères de jonction utiles à certaines écritures (U+200C, U+200D dans les emojis composés ou l'écriture persane) sans le vérifier.

## Journal

- 2026-11-24 : tâche créée pendant la relecture de #208 (hors périmètre).
