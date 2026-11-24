---
id: C-62
title: "Assistants d'import : signaler le type au nom vide avant la confirmation"
phase: C
lane: frontend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-59]
touches: [frontend/src/components/import/importResolutions.ts, frontend/src/components/import/importResolutions.test.ts, frontend/src/components/import/ImportEntityRow.tsx, frontend/src/components/import/ImportEntityRow.test.tsx, frontend/src/components/import/BottleImportCategoryStep.tsx, frontend/src/components/import/ImportBottlesWizard.tsx, frontend/src/components/import/ImportBottlesWizard.test.tsx, frontend/src/components/import/ImportStepResolve.tsx, frontend/src/components/import/ImportCocktailWizard.test.tsx, frontend/src/components/import/bottleImportResolutions.ts, frontend/src/components/import/CategoryTypeSelect.tsx, frontend/src/components/import/CategoryTypeSelect.test.tsx, frontend/src/components/ui/Field.tsx, frontend/src/components/ui/Field.test.tsx]
sources: []
branch: fix/C-62-import-empty-type-warning
pr: https://github.com/Lulu300/carta-cocktail/pull/221
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

- [x] Dans les deux assistants, choisir le type au nom vide pour une catégorie à créer affiche un message traduit sur le champ et bloque la confirmation.
- [x] Choisir un autre type retire le message et débloque la confirmation.
- [x] Les autres types, ` SPIRIT ` compris, ne sont pas signalés.

## Tests à ajouter ou adapter

- `importResolutions.test.ts` : type vide signalé, ` SPIRIT ` non signalé.
- `ImportEntityRow.test.tsx`, `ImportBottlesWizard.test.tsx` : message, confirmation bloquée puis débloquée.

## Points d'attention

- Un fichier qui donne un type vide n'est pas concerné : les deux assistants le remplacent par `SPIRIT` (`defaultCreateData`, `defaultCategoryData`), comme le backend à l'aperçu.

## Journal

- 2026-11-24 : tâche créée pendant C-59 (hors périmètre).
- 2026-11-25 : PR #221 (branche `fix/C-62-import-empty-type-warning`). Règle unique `isMissingCategoryType(type, categoryTypes)` (`importResolutions.ts`), celle du backend depuis C-59 et C-56 : le nom vide est refusé même s'il existe ; un type nouveau fait seulement de blancs ou de caractères invisibles (`tidyName`, le helper de C-56 déjà utilisé par le formulaire de catégorie) est refusé ; un type existant est gardé tel quel (` SPIRIT `, et un ancien type `'   '`, accepté par le backend depuis C-59). Faits vérifiés avant de coder : un type de fichier de cocktail n'est pas trimé à l'aperçu, donc `'   '` ou `U+200B` inexistant arrivait aussi au 400 ; le fichier de bouteilles est trimé à la lecture, un type vide y devient `SPIRIT`. Message : `categories.typeRequired`, celui du formulaire de catégorie (consigne du coordinateur, aucune clé nouvelle), au lieu de `fieldRequired` proposé par la tâche. Assistant de cocktail : `invalidCreateFields` signale `type`, le champ de `ImportEntityRow` l'affiche, `countIncompleteResolutions` bloque « Next » ; les trois fonctions reçoivent la liste des types (`lists.categoryTypes`, `ImportStepResolve.tsx` ajouté à `touches`). Assistant de bouteilles : `countCategoriesWithoutType` (`bottleImportResolutions.ts`) désactive « Next » et « Import » ; le select de type passe dans un `Field` à libellé masqué (`hideLabel`, nouveau, `sr-only`) pour avoir le message, `aria-invalid` et `aria-describedby` comme ailleurs ; la prop `aria-label` de `CategoryTypeSelect`, devenue inutile, est retirée. Le type au nom vide reste dans la liste, nommé « (no name) » (point 3). Limite : si la liste des types ne se charge pas, un ancien type `'   '` venu du fichier est signalé alors que le backend l'accepterait (aucun type connu) ; l'assistant de cocktail affiche déjà `listsLoadError`. Sondes de sabotage (nom vide accepté s'il existe, pas de contrôle des blancs, types existants non exemptés, `trim` au lieu de `tidyName`, `type` absent de `invalidCreateFields`, champ sans message, étape de résolution sans la liste, assistant de bouteilles sans le décompte ou sans la liste, décompte qui ignore `create`, étape des catégories sans message ou sans la liste, `hideLabel` ignoré) : chacune fait échouer au moins un test. Bundle public : 135,72 kB.
- Notes de version : « The import wizards flag a category to create under the type with an empty name (data older than v1.9.0), or under a new type made only of spaces or invisible characters, with the category form's message, and keep the import disabled until another type is chosen, instead of failing at the confirmation. »
