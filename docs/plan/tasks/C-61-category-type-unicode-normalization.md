---
id: C-61
title: "Types de catégorie : un nom composé et sa forme décomposée (NFC / NFD)"
phase: C
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-56]
touches: [backend/src/services/categoryTypeService.ts, backend/src/services/categoryTypeService.test.ts, frontend/src/hooks/useCategoryTypeName.ts, frontend/src/hooks/useCategoryTypeName.test.ts]
sources: []
branch:
pr:
---

## Contexte

Trouvé pendant C-56. C-55 et C-56 rangent un nouveau type sous une forme que l'admin peut distinguer des autres (espaces réduits, caractères invisibles retirés) et marquent les noms anciens qui ne la respectent pas. Une autre paire de noms s'affiche pareil : un nom écrit avec une lettre accentuée composée (`È`, U+00C8) et le même nom écrit en forme décomposée (`E` suivi de l'accent combinant U+0300). Unicode les déclare canoniquement équivalents ; le navigateur dessine les deux à l'identique.

## Problème constaté

- `newCategoryTypeName` ne normalise pas le nom : `POST /api/category-types` avec `crème` en NFC puis en NFD crée deux types `CRÈME` qui s'affichent pareil dans Manage Types et dans la liste des types du formulaire.
- La forme décomposée vient surtout d'un copier-coller depuis macOS (noms de fichiers) ou de certains tableurs. Peu probable, comme les caractères invisibles de C-56.

## Ce qu'il faut faire

1. `newCategoryTypeName` : normaliser un nouveau nom en NFC. Un type existant choisi tel quel reste inchangé (même règle que C-55 et C-56).
2. `useCategoryTypeName` : marquer un nom stocké qui n'est pas en NFC (par exemple « (forme décomposée) »), à décider avec le libellé.

## Critères d'acceptation

- [ ] Un nouveau type saisi en NFD est créé en NFC, ou rattaché au type NFC existant.
- [ ] Un type existant en NFD se distingue du type NFC dans Manage Types et dans la liste des types du formulaire.
- [ ] Les noms déjà en NFC s'affichent comme avant.

## Tests à ajouter ou adapter

- `backend/src/services/categoryTypeService.test.ts` : nom NFD normalisé, type NFD existant gardé tel quel.
- `frontend/src/hooks/useCategoryTypeName.test.ts` : marquage d'un nom NFD.

## Points d'attention

- Ne pas aller jusqu'à NFKC : elle change des caractères visiblement différents (ligatures, exposants, chiffres en largeur pleine).

## Journal

- 2026-11-24 : tâche créée pendant C-56 (hors périmètre).
