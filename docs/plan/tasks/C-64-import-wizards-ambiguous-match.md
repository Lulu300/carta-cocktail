---
id: C-64
title: "Assistants d'import : faire choisir parmi les catégories ou unités qui ne diffèrent que par la casse"
phase: C
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-19, C-62]
touches: [frontend/src/components/import/importResolutions.ts, frontend/src/components/import/importResolutions.test.ts, frontend/src/components/import/ImportEntityRow.tsx, frontend/src/components/import/ImportEntityRow.test.tsx, frontend/src/components/import/MatchStatus.tsx, frontend/src/components/import/BottleImportCategoryStep.tsx, frontend/src/components/import/bottleImportResolutions.ts, frontend/src/components/import/ImportBottlesWizard.test.tsx, frontend/src/components/import/ImportCocktailWizard.test.tsx, frontend/src/i18n/locales/admin/en.json, frontend/src/i18n/locales/admin/fr.json]
sources: []
branch:
pr:
---

## Contexte

Trouvé pendant C-19. Des données antérieures à C-07 peuvent contenir deux catégories (`Rhum`, `RHUM`) ou deux unités (`CL`, `Cl`) qui ne diffèrent que par la casse. Depuis C-19, les deux aperçus d'import (`POST /api/cocktails/import/preview`, `POST /api/bottles/import/preview`) cherchent d'abord la ligne exacte, puis la seule ligne égale à la casse près. Quand plusieurs lignes sont égales à la casse près et aucune exactement, l'entrée a le statut `ambiguous`, `existingMatch: null` et la liste `ambiguousMatches` des lignes possibles. La confirmation refuse alors de créer cette catégorie ou cette unité (409 `errors.ambiguousCategoryName` / `errors.ambiguousUnitAbbreviation`, qui nomment les lignes).

## Problème constaté

Sur la branche de C-19 :

- Les deux assistants traitent `ambiguous` comme `missing` (`status === 'matched'`) : la résolution automatique propose « Créer », la pastille dit « À créer », et la confirmation répond 409. Le message nomme les lignes, mais seulement après le clic sur « Importer ».
- Assistant de cocktail : l'admin peut choisir « Utiliser l'existant » et une ligne de la liste complète, mais rien ne lui dit lesquelles correspondent.
- Assistant de bouteilles, étape des catégories : « Utiliser l'existant » n'apparaît que s'il y a un `existingMatch` ; l'admin ne peut que choisir la catégorie de chaque ligne de bouteilles une à une.

## Ce qu'il faut faire

1. Statut `ambiguous` : pastille et libellé propres (« Plusieurs correspondances » / « Several matches »), en/fr.
2. Pas de résolution automatique : l'entrée reste à compléter (le bouton d'import reste désactivé) tant que l'admin n'a pas choisi une des lignes de `ambiguousMatches`, ou « Créer » avec un nom qui ne correspond à aucune ligne.
3. Assistant de bouteilles : proposer « Utiliser l'existant » avec la liste `ambiguousMatches`.

## Critères d'acceptation

- [ ] Une catégorie ou une unité ambiguë est signalée dans l'aperçu, avec ses correspondances, dans les deux assistants.
- [ ] L'import ne part pas tant qu'elle n'est pas résolue ; une fois une ligne choisie, l'import passe sans 409.

## Tests à ajouter ou adapter

- `importResolutions.test.ts`, `bottleImportResolutions` : pas de résolution automatique pour `ambiguous`.
- `ImportEntityRow.test.tsx`, `ImportBottlesWizard.test.tsx`, `ImportCocktailWizard.test.tsx` : affichage et choix d'une correspondance.

## Points d'attention

- C-62 touche les mêmes fichiers : la faire après.
- Le type `ImportMatchStatus` et les champs `ambiguousMatches` sont déjà dans `frontend/src/types/index.ts` (C-19).

## Journal

- 2026-11-25 : tâche créée pendant C-19 (hors périmètre : C-19 ne touche pas les assistants, que C-62 modifie en parallèle).
