---
id: C-62
title: "Assistants d'import : signaler le type au nom vide avant la confirmation"
phase: C
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-59]
touches: [frontend/src/components/import/importResolutions.ts, frontend/src/components/import/importResolutions.test.ts, frontend/src/components/import/ImportEntityRow.tsx, frontend/src/components/import/ImportEntityRow.test.tsx, frontend/src/components/import/BottleImportCategoryStep.tsx, frontend/src/components/import/ImportBottlesWizard.tsx, frontend/src/components/import/ImportBottlesWizard.test.tsx]
sources: []
branch:
pr:
---

## Contexte

Trouvé pendant C-59. Des données antérieures à v1.9.0 peuvent contenir un type de catégorie au nom vide. Depuis C-54, la liste des types des deux assistants d'import (`CategoryTypeSelect`) le propose sous le libellé « (no name) » / « (sans nom) ». Une catégorie ne peut pas aller sous ce type : le formulaire de catégorie affiche `categories.typeRequired` (C-53), la création d'une catégorie répond 400 (C-57), et les imports répondent 400 aussi depuis C-59 (même schéma `CategoryTypeName`).

## Problème constaté

Sur `fix/C-59-imports-keep-chosen-type` :

- Assistant de cocktail : choisir « (no name) » pour une catégorie à créer laisse « Import » actif. La confirmation répond 400 et l'assistant passe à l'écran d'erreur avec le message générique du backend (`messageOf` lit `error.message`, pas `validationErrorMessage`).
- Assistant de bouteilles : même choix, même 400 ; l'écran d'erreur affiche « Type : obligatoire » (`validationErrorMessage`, chemin `body.resolutions.categories.<clé>.data.type`). L'admin doit recommencer l'import depuis le fichier.
- Le formulaire de catégorie, lui, signale le type manquant sur le champ et garde la fenêtre ouverte (C-53).

## Ce qu'il faut faire

1. Assistant de cocktail : `invalidCreateFields` signale un type vide (`type` dans `CreateDataField`, message `fieldRequired` déjà traduit) ; le champ de type de `ImportEntityRow` l'affiche, et `countIncompleteResolutions` bloque la confirmation comme pour un nom vide.
2. Assistant de bouteilles : même signalement dans `BottleImportCategoryStep`, et « Next » / « Import » désactivés tant qu'une catégorie à créer a un type vide.
3. Ne pas retirer le type au nom vide de la liste : il reste nommé, comme dans le formulaire de catégorie, pour que l'admin le reconnaisse.

## Critères d'acceptation

- [ ] Dans les deux assistants, choisir le type au nom vide pour une catégorie à créer affiche un message traduit sur le champ et bloque la confirmation.
- [ ] Choisir un autre type retire le message et débloque la confirmation.
- [ ] Les autres types, ` SPIRIT ` compris, ne sont pas signalés.

## Tests à ajouter ou adapter

- `importResolutions.test.ts` : type vide signalé, ` SPIRIT ` non signalé.
- `ImportEntityRow.test.tsx`, `ImportBottlesWizard.test.tsx` : message, confirmation bloquée puis débloquée.

## Points d'attention

- Un fichier qui donne un type vide n'est pas concerné : les deux assistants le remplacent par `SPIRIT` (`defaultCreateData`, `defaultCategoryData`), comme le backend à l'aperçu.

## Journal

- 2026-11-24 : tâche créée pendant C-59 (hors périmètre).
