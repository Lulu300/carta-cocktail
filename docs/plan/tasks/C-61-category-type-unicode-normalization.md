---
id: C-61
title: "Types de catégorie : un nom composé et sa forme décomposée (NFC / NFD)"
phase: C
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-56]
touches: [backend/src/utils/invisibleCharacters.ts, backend/src/utils/invisibleCharacters.test.ts, backend/src/services/categoryTypeService.ts, backend/src/services/categoryTypeService.test.ts, backend/src/routes/categoryTypes.ts, backend/src/routes/categoryTypes.test.ts, backend/src/routes/categories.test.ts, frontend/src/utils/invisibleCharacters.ts, frontend/src/utils/invisibleCharacters.test.ts, frontend/src/hooks/useCategoryTypeName.ts, frontend/src/hooks/useCategoryTypeName.test.ts, frontend/src/components/admin/categories/categoryForm.ts, frontend/src/components/admin/categories/useCategoryTypeForm.ts, frontend/src/i18n/locales/admin/en.json, frontend/src/i18n/locales/admin/fr.json, frontend/src/pages/admin/CategoriesPage.test.tsx]
sources: []
branch: fix/C-61-category-type-unicode-normalization
pr: https://github.com/Lulu300/carta-cocktail/pull/222
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

- [x] Un nouveau type saisi en NFD est créé en NFC, ou rattaché au type NFC existant.
- [x] Un type existant en NFD se distingue du type NFC dans Manage Types et dans la liste des types du formulaire.
- [x] Les noms déjà en NFC s'affichent comme avant.

## Tests à ajouter ou adapter

- `backend/src/services/categoryTypeService.test.ts` : nom NFD normalisé, type NFD existant gardé tel quel.
- `frontend/src/hooks/useCategoryTypeName.test.ts` : marquage d'un nom NFD.

## Points d'attention

- Ne pas aller jusqu'à NFKC : elle change des caractères visiblement différents (ligatures, exposants, chiffres en largeur pleine).

## Journal

- 2026-11-24 : tâche créée pendant C-56 (hors périmètre).
- 2026-11-25 : PR #222 (branche `fix/C-61-category-type-unicode-normalization`). Nouveau `composeName` (NFC) dans `utils/invisibleCharacters.ts`, mêmes code et cas de test dans les deux paquets. `tidyName` retire les caractères invisibles, compose, puis réduit les espaces : composer après le retrait rapproche une lettre de son accent (`E` + U+200B + U+0300 donne `È`). Tous les chemins de création passent par `newCategoryTypeName` (création d'un type, création et édition d'une catégorie, les deux imports par `ensureCategoryType`, routes d'import inchangées) ; la correspondance exacte d'abord garde tel quel un type existant décomposé choisi ; un nom décomposé saisi va sous le type composé s'il existe (409 pour `POST /api/category-types`). Majuscules avant le nettoyage dans `POST /api/category-types`, le type personnalisé du formulaire de catégorie et le nom de Manage Types : la mise en majuscules peut décomposer une lettre (`ΐ` devient `Ι` + U+0308 + U+0301). Faits établis et choix :
  - NFC plutôt que NFKC : NFC ne fusionne que les suites qu'Unicode déclare canoniquement équivalentes, dessinées pareil. NFKC changerait des caractères dessinés autrement, qu'un admin peut saisir exprès : ligature `ﬁ`, `CO₂`, `№`, lettres pleine largeur (`ＶＯＤＫＡ`), kana demi-largeur (`ｶﾞ` deviendrait `ガ`), jamo hangul de compatibilité joints en syllabe (`ㄱㅏ` deviendrait `가`), et le remplisseur hangul U+3164 (un blanc pour C-56) deviendrait U+1160. Des tests verrouillent chacun de ces cas.
  - Limite assumée : NFC décompose aussi les caractères qu'Unicode exclut de la composition, dessinés pareil sous les deux formes : lettres à nukta du devanagari (U+0958–U+095F, `क़` devient `क` + U+093C), du bengali et du gurmukhi, formes de présentation hébraïques (U+FB1D, U+FB2A…) et idéogrammes de compatibilité CJK (U+F900–U+FAFF, U+2F800–U+2FA1F), remplacés par l'idéogramme unifié, que quelques polices dessinent un peu autrement. Un nouveau nom qui en contient est rangé sous l'autre forme ; un nom stocké qui en contient est marqué « (non-standard Unicode form) », libellé exact pour ces cas aussi. C'est le comportement normal de NFC ; une séquence de variante idéographique (gardée par C-56) garde un glyphe précis.
  - Marquage : toujours, pas seulement quand un type composé équivalent existe. Même règle que C-55 et C-56, qui marquent un nom à espaces ou à caractère invisible sans regarder la liste ; un nom stocké non composé ne peut plus être ressaisi tel quel. Rien ne change dans le texte, les deux formes se dessinant pareil : le nom est suivi de « (non-standard Unicode form) » / « (forme Unicode non standard) », plutôt que « forme décomposée », faux pour le signe angström U+212B ou des marques combinantes dans le désordre. Seul le nom stocké est marqué, jamais une traduction ; `typeLabel` ajoute le nom stocké marqué à une traduction ; tous les écrans de C-54 en profitent (même hook).
  - Bundle public inchangé (135,72 kB). Sondes de sabotage (`tidyName` sans NFC dans chaque paquet, NFKC au lieu de NFC dans chaque paquet, composition avant le retrait des caractères invisibles dans chaque paquet, majuscules après le nettoyage dans la route, le formulaire de catégorie et Manage Types, `visibleName` sans la mention, `isHiddenByHtml` sans le test de forme, `ensureCategoryType` sans la correspondance exacte) : chacune fait échouer au moins un test.
- Notes de version : « A new category type name is stored in its composed Unicode form (NFC): a name pasted with decomposed accents (often copied from macOS file names) joins the type with composed accents instead of creating a second one that looks the same. An existing type picked as it is stays unchanged, and a stored name that is not in that form is shown with "(non-standard Unicode form)" / "(forme Unicode non standard)" on the admin screens. »
- 2026-11-25 : relecture de #222 (changements demandés), corrigée dans la même PR. (1) Bloquant : `tidyName` n'était plus idempotent. NFC peut changer le caractère qui précède un joiner après le passage de la règle de C-56 (U+0308 et U+0303 comptent le syriaque, écriture qui lie, dans leur `Script_Extensions`) : `E` + U+0308 + U+200D + `X` donnait `Ë` + U+200D + `X`, un joiner après une lettre latine, marqué dès la création et différent de `ËX` obtenu depuis la forme composée. `removeInvisibleAndCompose` (les deux copies) répète le retrait des caractères invisibles et NFC jusqu'au point fixe, avant la réduction des espaces et le rognage ; chaque passe qui change le texte retire au moins un caractère, donc la boucle se termine. Cas ajoutés dans les deux fichiers de tests (`'Ë‍X'` → `'ËX'`, `'ë‌क'` → `'ëक'`, `'E​̈‍'` → `'Ë'`), et propriété vérifiée sur tous les cas de `tidyName` : idempotence, plus aucun caractère retiré par `replaceInvisibleCharacters`. Sondes : une seule passe (6 échecs par paquet), NFC avant et après le retrait sans boucle (2 échecs). Fuzz de 300 000 chaînes (lettres, marques combinantes, joiners, blancs, devanagari, arabe, jamo, emoji ; nom tel quel et en majuscules) : aucun résultat non idempotent, non NFC ou avec un caractère invisible. (2) Limite assumée complétée (exclusions de composition), aussi dans le JSDoc de `composeName`. (3) Noms de catégories, abréviations d'unités et noms d'ingrédients non normalisés, `CaseInsensitiveIndex` de C-19 (#226) et contrôle de doublons d'`integrityService` (`lower()` SQLite, limité à l'ASCII) : C-65. (4) Nit : JSDoc d'`ensureCategoryType` remis en forme.
