---
id: C-66
title: "Assistant d'import de bouteilles : la catégorie d'une ligne s'affiche vide quand elle ne diffère que par la casse"
phase: C
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-64]
touches: [frontend/src/components/import/BottleImportRowsStep.tsx, frontend/src/components/import/bottleImportResolutions.ts, frontend/src/components/import/bottleImportResolutions.test.ts, frontend/src/components/import/ImportBottlesWizard.test.tsx]
sources: []
branch:
pr:
---

## Contexte

Trouvé pendant C-64. Chaque ligne de bouteilles garde le nom de catégorie du fichier (`rowCategory`), et le sélecteur de catégorie de la ligne (`BottleImportRowsStep`) propose les catégories existantes sous leur nom, puis celles à créer sous le nom du fichier (`categoryOptions`). Depuis C-19, une catégorie du fichier égale à une catégorie existante à la casse près lui est rattachée : `rhum` dans le fichier, `Rhum` en base.

## Problème constaté

Vérifié sur la branche de C-64 (sonde jetable sur `BottleImportRowsStep`) :

- Fichier `rhum`, catégorie `Rhum` en base, résolution « Utiliser l'existant » : la valeur de la ligne est `rhum`, qu'aucune option ne porte. Le sélecteur contrôlé affiche alors la première option, « — Choisir une catégorie — » (`selectedIndex` 0), alors que l'import mettra la bouteille dans `Rhum`. Rien n'est signalé (`countRowsWithoutCategory` voit un nom), mais l'admin croit la ligne sans catégorie.
- Même chose pour une catégorie ambiguë résolue par une de ses correspondances (C-64) : la ligne garde `rhum`, la confirmation la range dans la catégorie choisie, le sélecteur affiche le choix vide.
- Une résolution « Créer » dont le nom existe à la casse près reste listée « (sera créée) » dans le sélecteur, alors que l'import utilise la catégorie existante (C-64 le dit à côté du nom et dans le récapitulatif de confirmation, pas dans ce sélecteur). Une option « (sera créée) » de même nom exact qu'une catégorie existante ferait aussi deux options de même valeur.

## Ce qu'il faut faire

1. Afficher, pour chaque ligne, la catégorie que la confirmation utilisera : celle de la résolution de la catégorie du fichier (même clé en minuscules que le backend), sinon la catégorie existante trouvée par la règle de `matchIgnoringCase`.
2. Ne marquer « (sera créée) » que les catégories que la confirmation crée vraiment (`existingCategoryFor`, C-64).
3. Garder une seule option par valeur.

## Critères d'acceptation

- [ ] Une ligne dont la catégorie du fichier ne diffère que par la casse de la catégorie utilisée affiche celle-ci.
- [ ] Le sélecteur ne promet pas de créer une catégorie que l'import reprend.

## Tests à ajouter ou adapter

- `bottleImportResolutions.test.ts` : options et catégorie affichée pour une correspondance à la casse près, pour une ambiguïté résolue, pour une création reprise.
- `ImportBottlesWizard.test.tsx` : le sélecteur d'une ligne affiche la catégorie utilisée.

## Points d'attention

- La valeur envoyée pour une ligne reste le nom du fichier tant que l'admin ne la change pas : la confirmation la range par la résolution de ce nom (C-64 classe aussi une catégorie créée sous un autre nom par la clé du fichier).

## Journal

- 2026-11-25 : tâche créée pendant C-64 (hors périmètre : comportement antérieur des lignes, distinct des catégories ambiguës).
