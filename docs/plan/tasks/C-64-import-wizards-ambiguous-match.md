---
id: C-64
title: "Assistants d'import : faire choisir parmi les catégories ou unités qui ne diffèrent que par la casse"
phase: C
lane: frontend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-19, C-62]
touches: [frontend/src/components/import/importResolutions.ts, frontend/src/components/import/importResolutions.test.ts, frontend/src/components/import/ImportEntityRow.tsx, frontend/src/components/import/ImportEntityRow.test.tsx, frontend/src/components/import/MatchStatus.tsx, frontend/src/components/import/existingMatchMessages.ts, frontend/src/components/import/BottleImportCategoryStep.tsx, frontend/src/components/import/BottleImportConfirmStep.tsx, frontend/src/components/import/bottleImportResolutions.ts, frontend/src/components/import/bottleImportResolutions.test.ts, frontend/src/components/import/ImportBottlesWizard.tsx, frontend/src/components/import/ImportBottlesWizard.test.tsx, frontend/src/components/import/ImportStepResolve.tsx, frontend/src/components/import/ImportStepConfirm.tsx, frontend/src/components/import/ImportCocktailWizard.test.tsx, frontend/src/types/index.ts, frontend/src/i18n/locales/admin/en.json, frontend/src/i18n/locales/admin/fr.json, backend/src/utils/uniqueness.ts, backend/src/routes/bottles.ts, backend/src/routes/bottles.test.ts, backend/src/utils/bottlesImport.ts, backend/src/utils/bottlesImport.test.ts, docs/plan/tasks/C-65-names-unicode-normalization.md, docs/plan/tasks/C-66-bottle-import-row-category-case.md]
sources: []
branch: fix/C-64-import-ambiguous-matches
pr: https://github.com/Lulu300/carta-cocktail/pull/228
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

- [x] Une catégorie ou une unité ambiguë est signalée dans l'aperçu, avec ses correspondances, dans les deux assistants.
- [x] L'import ne part pas tant qu'elle n'est pas résolue ; une fois une ligne choisie, l'import passe sans 409.

## Tests à ajouter ou adapter

- `importResolutions.test.ts`, `bottleImportResolutions` : pas de résolution automatique pour `ambiguous`.
- `ImportEntityRow.test.tsx`, `ImportBottlesWizard.test.tsx`, `ImportCocktailWizard.test.tsx` : affichage et choix d'une correspondance.

## Points d'attention

- C-62 touche les mêmes fichiers : la faire après.
- Le type `ImportMatchStatus` et les champs `ambiguousMatches` sont déjà dans `frontend/src/types/index.ts` (C-19).
- Depuis C-19, une résolution « Créer » dont le nom existe déjà à la casse près (sans ambiguïté) est rattachée à la ligne existante, telle quelle : le type, le stock et les traductions saisis dans l'assistant sont ignorés. Le signaler à côté du nom saisi est possible dans la même tâche, mais pas exigé.

## Journal

- 2026-11-25 : tâche créée pendant C-19 (hors périmètre : C-19 ne touche pas les assistants, que C-62 modifie en parallèle).
- 2026-11-25 : PR #228 (branche `fix/C-64-import-ambiguous-matches`).
  - **Statut `ambiguous` (étape 1).** Pastille et badge propres (`importMatches.ambiguous`, « Plusieurs correspondances », ton `danger`), et la liste des correspondances sous l'entrée (`AmbiguousMatches`, `MatchStatus.tsx`). `MatchDot` et `MatchBadge` prennent le statut au lieu d'un booléen.
  - **Pas de résolution automatique (étape 2).** `buildAutoResolutions` et `buildAutoCategoryResolutions` sautent une entrée ambiguë. « Utiliser l'existant » s'affiche choisi, avec un sélecteur vide (« — Choisir l'une d'elles — »). L'import reste bloqué jusqu'à ce que l'admin choisisse une ligne, ou crée l'entrée sous un nom (ou une abréviation) qu'aucune ligne ne porte à la casse près. Le champ signale un nom que les correspondances portent.
  - **Assistant de bouteilles (étape 3).** « Utiliser l'existant » est proposé avec la liste `ambiguousMatches`. `BottleCategoryResolution.existingId` devient facultatif tant qu'aucune ligne n'est choisie (`frontend/src/types/index.ts` ajouté à `touches`).
  - **Résumé des raisons de blocage de C-62.** Assistant de cocktail : les entrées ambiguës comptent dans `unresolvedCount`, par le même `countIncompleteResolutions`. Assistant de bouteilles : l'encadré liste `bottles.importWizard.categoriesToResolve` (nouvelle clé, `countCategoriesToResolve`) avant `categoriesWithoutType`.
  - **Point d'attention optionnel, fait.** Une catégorie ou une unité à créer dont le nom (ou l'abréviation) existe à la casse près, sans ambiguïté, le dit sous le champ : `importMatches.usedAsItIs`, « Existe déjà sous « Rhum » : elle sera utilisée telle quelle, et les autres champs ignorés ».
    - Les récapitulatifs de confirmation disent la même chose : celui des cocktails la range dans « Entités existantes utilisées », celui des bouteilles ne la compte pas dans « Catégories à créer » (`countCategoriesToCreate`).
    - L'aperçu applique la règle du backend aux seules valeurs du fichier, et l'admin peut saisir une autre valeur. La valeur saisie est donc comparée aux listes déjà chargées par `matchIgnoringCase` (`importResolutions.ts`), miroir de `CaseInsensitiveIndex.match`, appelé seulement par `existingRowFor` et `existingCategoryFor` : valeur trimée comme par les schémas zod, et clé de résolution pour un nom vide de bouteilles, comme la route.
    - Même principe que `isMissingCategoryType`. C-65, qui normalisera la clé du backend, le note dans ses points d'attention (ajouté à `touches`).
  - **Nit de la relecture de C-19.** Helper privé `lookup(value)` (`{ candidates, exact }`), partagé par `match` et `matchFirst`. Tests existants inchangés.
  - **Correctif backend nécessaire à l'étape 2 (`bottles.ts`).** La confirmation des bouteilles rangeait une catégorie créée sous son nouveau nom, alors que l'assistant garde sur chaque ligne le nom du fichier. Les lignes d'une catégorie créée sous un autre nom étaient donc ignorées sans bruit (`skippedNoCategory`), ou refusées en 409 pour un nom ambigu. La catégorie créée est maintenant rangée sous la clé de la résolution, comme `use_existing`. Une ligne déplacée vers le nouveau nom la trouve par l'index.
  - **Hors périmètre, C-66.** Une ligne de bouteilles dont la catégorie du fichier ne diffère que par la casse de celle utilisée affiche « — Choisir une catégorie — » (vérifié par une sonde jetable). C'est un comportement antérieur.
  - **Limite.** Si la liste des catégories ou des unités ne se charge pas, un nom ambigu à créer n'est pas signalé, et le 409 du backend nomme les lignes.
  - **Sondes de sabotage.** 19 sondes, appliquées une à une ; chacune fait échouer au moins un test :
    - backend : clé du nouveau nom, `lookup` sans ligne exacte ;
    - résolution automatique de l'ambigu, dans chaque assistant ;
    - nom ambigu non invalide ;
    - « Utiliser l'existant » qui choisit à la place de l'admin ;
    - sans indication, ou sans liste des correspondances ;
    - sans « Utiliser l'existant », ou sans sélecteur, pour une catégorie de bouteilles ambiguë ;
    - assistant de bouteilles sans le décompte, ou sans la ligne du résumé ;
    - création sous un nom ambigu comptée résolue ;
    - nom vide sans repli sur la clé ;
    - pas de ligne exacte d'abord ;
    - confirmation des cocktails qui liste une ligne reprise comme créée ;
    - décompte des catégories à créer sans les existantes ;
    - nom non trimé ;
    - champ de nom de bouteilles sans indication ni erreur.
  - **Vérifications.** Aucun avertissement `act(...)` ni `[MSW]`. Bundle public : 135,75 kB.
- 2026-11-25 : relecture de #228 (changements demandés, 1 bloquant), corrigée dans la même PR selon les décisions du coordinateur.
  - **Bloquant : doublons comptés dans la mauvaise catégorie.** La confirmation des bouteilles comparait chaque ligne aux bouteilles de la catégorie du *nom du fichier*. Une ligne mise dans une catégorie créée sous un autre nom, ou dans une des deux catégories qui ne diffèrent que par la casse, comptait donc comme doublon d'une bouteille d'une autre catégorie (`duplicatesCreated: 1` dans une catégorie créée à l'instant). La clé de doublon de la confirmation est maintenant `${name.toLowerCase()}|${capacityMl}|${categoryId}`, avec l'id de la catégorie résolue (`b.categoryId` côté existant). L'aperçu, qui n'a pas encore de résolution, garde le nom de catégorie en minuscules, par la même fonction `duplicateKey`. Tests : catégorie renommée (0 doublon) ; correspondance ambiguë choisie, `Rhum` (1) contre `RHUM` (0).
  - **Nit 1 : catégories absentes de `json.categories`.** Le lecteur JSON ajoute maintenant, avec les valeurs par défaut, chaque catégorie qu'une ligne nomme et que la liste omet, comme le lecteur CSV. La logique est partagée : `withRowCategories` (`utils/bottlesImport.ts`, ajouté à `touches` avec son test). Les catégories listées restent telles quelles, et une catégorie déjà listée à la casse près n'est pas ajoutée. Effet visible : l'aperçu signale une catégorie ambiguë que seules les lignes nomment ; les bouteilles d'une catégorie nommée seulement par les lignes et inconnue en base sont importées dans une catégorie créée, au lieu d'être ignorées faute de catégorie. Ce cas n'était pas dans C-66, qui reste inchangée : affichage de la catégorie d'une ligne quand elle ne diffère que par la casse, libellé « (sera créée) » d'une création reprise, options de même valeur.
  - **Nit 2.** Le commentaire de `existingRowFor` nomme la limite : deux entrées d'un même import créées sous des noms égaux à la casse près ne se voient pas l'une l'autre (pas d'indication, et le récapitulatif des bouteilles compte les deux), alors que le backend crée la première et la reprend pour la seconde.
  - **Nit 3.** Le sélecteur des correspondances de l'assistant de bouteilles a sa clé, `importMatches.existingEntry` (en/fr), au lieu d'emprunter `cocktails.importWizard.existingEntity`.
  - **Sondes de sabotage.** 4 sondes, appliquées une à une ; chacune fait échouer au moins un test : doublons revenus au nom de catégorie du fichier ; lecteur JSON sans les catégories des lignes ; catégories des lignes qui ignorent celles listées ; libellé emprunté à l'assistant de cocktail.
- Notes de version : « The import wizards now flag a category or a unit that matches several existing ones differing only by case ("Several matches", with their names), and keep the import disabled until one of them is picked or the entry is created under another name, instead of failing at the confirmation; the bottle wizard offers "Use existing" with those matches. A category or unit to create that already exists ignoring case now says it will be used as it is, with the other fields ignored, and the confirmation summaries count it as used, not created. The bottle import now puts the bottles of a category created under another name in that category, instead of skipping them or putting them in the existing category of the file's name, and counts as duplicates only the bottles already in the category a row goes in. A JSON bottle file whose rows name a category its category list leaves out now gets that category, with the default values, as a CSV file does: the bottles are imported in it instead of being skipped. »
