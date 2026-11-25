---
id: C-65
title: "Noms de catégories, abréviations d'unités, ingrédients : forme composée (NFC) et forme décomposée"
phase: C
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-61, C-19]
touches: [backend/src/utils/invisibleCharacters.ts, backend/src/utils/invisibleCharacters.test.ts, frontend/src/utils/invisibleCharacters.ts, frontend/src/utils/invisibleCharacters.test.ts, backend/src/utils/storedNames.ts, backend/src/utils/storedNames.test.ts, backend/src/routes/categoryTypes.ts, backend/src/routes/categoryTypes.test.ts, backend/src/routes/bottles.ts, backend/src/routes/bottles.test.ts, backend/src/services/cocktail/cocktailImport.ts, backend/src/services/cocktail/cocktailImport.test.ts, backend/src/bootstrap/defaultUnits.test.ts, backend/AGENTS.md, frontend/src/components/import/ImportEntityRow.tsx, frontend/src/components/import/ImportEntityRow.test.tsx, backend/src/utils/uniqueness.ts, backend/src/utils/uniqueness.test.ts, frontend/src/components/import/importResolutions.ts, frontend/src/components/import/importResolutions.test.ts, backend/src/services/integrityService.ts, backend/src/services/integrityService.test.ts, backend/src/routes/categories.ts, backend/src/routes/categories.test.ts, backend/src/routes/units.ts, backend/src/routes/units.test.ts, backend/src/routes/ingredients.ts, backend/src/routes/ingredients.test.ts]
sources: []
branch: fix/C-65-names-unicode-normalization
pr: https://github.com/Lulu300/carta-cocktail/pull/230
---

## Contexte

Trouvé pendant la relecture de #222 (C-61, « User-visible effects not described » 2), complété par la relecture de #226 (C-19). C-61 range un nouveau type de catégorie en NFC (`composeName` dans `utils/invisibleCharacters.ts`, backend et frontend) : `CRÈME` (U+00C8) et `CRE` + U+0300 + `ME` ne font plus deux types. Les autres noms saisis par l'admin ne sont pas normalisés, et les contrôles de doublon les comparaissent sans tenir compte de la forme Unicode.

## Problème constaté

Sur la branche de C-61 (#222) et celle de C-19 (#226) :

- Routes : `assertUniqueIgnoringCase` (`backend/src/utils/uniqueness.ts`) compare noms de catégories et abréviations d'unités avec `toLowerCase()` seulement. `Crème` (NFC) et `Crème` (NFD) passent le contrôle et font deux catégories qui s'affichent pareil. Même effet pour une abréviation d'unité.
- Imports et seed : C-19 (#226) ajoute `CaseInsensitiveIndex` dans le même fichier (`uniqueness.ts`, présent seulement sur la branche de C-19 pour l'instant), utilisé par les routes, les deux imports et le seed. Sa clé est `toLowerCase()` : la paire NFC / NFD n'y est pas rapprochée non plus.
- Contrôle d'intégrité : le contrôle de doublons d'`integrityService.ts` (catégories, unités, cocktails) groupe par SQLite `lower()`, qui ne change que les lettres ASCII. Il rate déjà `Écorce` / `écorce`, et à plus forte raison une paire NFC / NFD.
- Nom d'ingrédient : aucun contrôle de doublon ; un nom NFD et un nom NFC coexistent.
- Source probable, comme pour C-61 : copier-coller depuis des noms de fichiers macOS ou certains tableurs. Peu probable à la saisie.

## Ce qu'il faut faire

1. Une seule clé de comparaison, pour tous les contrôles d'un coup : `CaseInsensitiveIndex` (et `assertUniqueIgnoringCase` s'il reste) compare `composeName(value).toLowerCase()` (ou `toLowerCase` puis NFC, à vérifier sur les lettres que la casse décompose, comme `ΐ` dans C-61). Routes, imports et seed en profitent ensemble.
2. `integrityService` : même comparaison que les routes, en JS avec la clé du point 1 au lieu de `lower()` en SQL, pour signaler `Écorce` / `écorce` et la paire NFC / NFD.
3. Décider si un nom nouveau (catégorie, unité, ingrédient) est rangé en NFC à la création et à l'édition, comme un type de catégorie depuis C-61, un nom existant gardé tel quel tant qu'il n'est pas modifié ; et si l'affichage admin doit marquer un nom stocké non composé, comme `useCategoryTypeName` pour les types.

## Critères d'acceptation

- [x] Créer une catégorie `Crème` en NFD à côté de `Crème` en NFC répond 409, comme `crème` à côté de `Crème`.
- [x] Un import ou le seed qui rencontre une catégorie ou une unité en NFD la rapproche de celle qui existe en NFC.
- [x] Le contrôle d'intégrité signale `Écorce` / `écorce` et une paire NFC / NFD.
- [x] Une catégorie, une unité ou un ingrédient existant en NFD reste inchangé tant que l'admin ne le renomme pas.

## Tests à ajouter ou adapter

- `backend/src/utils/uniqueness.test.ts` : clé NFC et casse hors ASCII.
- `backend/src/services/integrityService.test.ts` : doublons `Écorce` / `écorce` et NFC / NFD.
- Routes de catégories, d'unités et d'ingrédients : 409 face à la forme NFC (et création rangée en NFC si le point 3 le retient).
- Imports (après C-19) : rapprochement NFC / NFD.

## Points d'attention

- Dépend de C-19 (#226), qui introduit `CaseInsensitiveIndex` : partir de sa version mergée.
- Même règle que C-61 : NFC, pas NFKC (NFKC changerait des caractères dessinés autrement : ligatures, chiffres pleine largeur, jamo hangul de compatibilité).
- Le contrôle d'intégrité est lancé par `scripts/check-integrity.ts` : comparer en JS lit toutes les lignes des trois tables, acceptable pour un script ponctuel.
- `uniqueness.test.ts` est ajouté par C-19.
- Depuis C-64, les assistants d'import appliquent la même règle au nom saisi pour une catégorie ou une unité à créer : `matchIgnoringCase` (`frontend/src/components/import/importResolutions.ts`), miroir de `CaseInsensitiveIndex.match`. Une normalisation ajoutée à la clé du backend doit y être reportée (le frontend a déjà `composeName`, C-61), sinon l'assistant laisse passer une valeur que la confirmation refuse.

## Journal

- 2026-11-25 : tâche créée pendant la relecture de #222 (C-61, hors périmètre), complétée d'après la relecture de #226 (C-19 : `CaseInsensitiveIndex`, contrôle d'intégrité par `lower()`).
- 2026-11-25 : PR #230 (branche `fix/C-65-names-unicode-normalization`).
  - **Clé unique (étape 1).** `caseInsensitiveKey` dans `utils/invisibleCharacters.ts`, copies backend et frontend identiques : minuscules, puis NFC. L'ordre compte : les minuscules peuvent laisser décomposée une lettre qui a une forme composée (`Ϊ` + U+0301 devient `ϊ` + U+0301, dont la forme NFC est `ΐ`), si bien que composer d'abord mettrait `ΐ` et sa majuscule sous deux clés. `İ` donne `i` + U+0307 dans les deux ordres (pas de forme composée) et reste distinct de `I`. Vérifié sur tous les points de code, suivis ou non de marques combinantes : deux formes équivalentes ont toujours la même clé, toujours en NFC. `CaseInsensitiveIndex` l'utilise, donc aussi `assertUniqueIgnoringCase` (routes), les deux imports et le seed ; la règle de l'exact d'abord ne change pas. `matchIgnoringCase` (frontend, C-64) importe la même fonction, sans seconde implémentation, et ses tests reprennent ceux du backend.
  - **Contrôle d'intégrité (étape 2).** Les noms sont lus en SQL brut et groupés en JS sous la même clé, triés. Le format `{ value, count }`, les libellés, `--counts-only`, les codes de sortie et `scripts/check-integrity.ts` ne changent pas ; `value` est la clé (identique à l'ancien `lower()` pour un nom ASCII).
  - **Noms nouveaux en NFC (étape 3, décision du coordinateur).** `utils/storedNames.ts` : `nameToStore` et `translationsToStore` composent la valeur envoyée, sauf si elle est exactement la valeur stockée (langue par langue pour les traductions), gardée telle quelle : les formulaires renvoient tous les champs, et un nom ancien décomposé ne change pas tant que l'admin ne le modifie pas. Aucune migration, aucune réécriture, aucun marquage. Appliqué au nom et aux traductions des catégories, au nom, à l'abréviation et aux traductions des unités, au nom et aux traductions des ingrédients, à la création comme à l'édition, et aux lignes que créent l'import de cocktails et celui de bouteilles. Les routes d'édition lisent la ligne stockée et répondent elles-mêmes 404.
  - **Traductions aussi en NFC.** Choix : oui. Elles sont saisies dans les mêmes formulaires, viennent des mêmes copier-coller et s'affichent à la place du nom sur la carte publique ; les composer ne change rien à l'écran et donne une seule forme au texte stocké. Même règle pour les traductions des types de catégorie, dont le nom est composé depuis C-61 : tout ce que l'admin saisit sur ces quatre écrans suit une seule règle.
  - **Clés de résolution laissées en minuscules (question de la relecture de C-66, #229).** La table `resolvedCategories` de la confirmation des bouteilles et `resolutionKey` du frontend gardent `toLowerCase()` seul, des deux côtés. Les clés viennent du même texte du fichier des deux côtés, et l'aperçu liste chaque forme comme une catégorie à part, avec sa propre résolution. Une ligne dont la forme diffère de la clé la manque, et tombe des deux côtés sur la même règle : `findUnambiguous` de l'index (création de l'import comprise) côté backend, `matchIgnoringCase` côté frontend (`categoryOf` de #229), qui utilisent tous deux `caseInsensitiveKey`. Test backend : une ligne `Cre` + U+0300 + `me` va dans la catégorie créée pour `Crème`. Normaliser ces clés demanderait de changer aussi le lecteur de fichiers (`withRowCategories`), l'aperçu et l'import de cocktails, hors périmètre.
  - **Limites connues, non traitées.** Les clés de résolution de l'import de cocktails (`lowercase`, `resolutionKey`) restent en `toLowerCase()` seul : un même fichier qui nomme `Crème` sous les deux formes donne deux références. Pour une catégorie ou une unité, `findOrCreate` les réunit en une ligne à la création ; pour un ingrédient, voir la relecture ci-dessous. Les noms d'ingrédients ne sont toujours pas comparés à la casse près : seule leur forme Unicode est nouvelle, le nom étant composé avant que l'index unique le voie (409 pour l'autre forme d'un ingrédient existant).
  - **Sondes de sabotage.** 34, appliquées une à une ; chacune fait échouer au moins un test : clé composée avant les minuscules (chaque paquet), clé sans NFC (chaque paquet), index sans la clé à l'ajout ou à la recherche, `matchIgnoringCase` revenu à `toLowerCase`, intégrité groupée par `toLowerCase` ou non triée, `nameToStore` qui compose toujours ou jamais, `translationsToStore` transparent ou sans la traduction stockée, et chaque appel retiré ou sans la valeur stockée dans les routes, les types de catégorie et les deux imports.
  - **Vérifications.** Backend 1733 tests, frontend 1435, sans avertissement `act(...)` ni `[MSW]` ; `npm audit` à 0 ; bundle public 135,86 kB (la clé est dans le chunk admin).
- Notes de version : « Category names and unit abbreviations are now compared ignoring case and Unicode form: a name pasted with decomposed accents (often copied from macOS file names) is refused next to the same name with composed accents (409), and the imports and the startup seed reuse the existing category or unit instead of creating a second one that looks the same. An ingredient name pasted with decomposed accents is refused next to the same name with composed accents (409), and the cocktail import uses the ingredient that already holds a name (exact, or in the other Unicode form, also when the file names it in both forms) instead of failing with "This entry already exists". A new or edited category, unit or ingredient name, and the translations of these and of category types, are stored in the composed form (NFC); an existing name stays unchanged until the admin edits it. The integrity check (`check-integrity`) now also reports, as blocking, category names or unit abbreviations that differ only by the case of an accented letter (`Écorce` and `écorce`) or by Unicode form, which it used to miss. A category or unit that check-integrity reports this way cannot be edited until one of the pair is renamed (409). »
- 2026-11-25 : relecture de #230 (changements demandés, 1 bloquant), corrigée dans la même PR selon les décisions du coordinateur ; branche mise à jour par un merge d'`origin/develop` (78c2666, avec #229).
  - **Bloquant : texte sur les ingrédients.** La ligne « Notes de version » disait les noms d'ingrédients comparés à la casse près : faux, seule la forme Unicode est nouvelle pour eux. Ligne réécrite, et « Limites connues » corrigé : `findOrCreate` réunit les deux formes pour une catégorie ou une unité, pas pour un ingrédient (P2002, 409 générique, avant le correctif ci-dessous). Clause ajoutée : une catégorie ou une unité que `check-integrity` signale ainsi ne peut plus être modifiée tant que l'une des deux n'est pas renommée (409), comme `Rum` / `rum` depuis C-07.
  - **Effet 2, ingrédients de l'import de cocktails.** L'import réutilise l'ingrédient qui porte déjà le nom qu'il rangerait (`ingredientsByStoredName`, clé `composeName`, la casse compte toujours) : créé plus tôt dans le même import, ou existant sous ce nom exact ou sous l'autre forme ; la ligne rangée exactement sous le nom composé passe d'abord. Choix : réutiliser plutôt qu'une erreur nommant la ligne de recette. C'est la règle des catégories et des unités depuis C-19 (une création que l'existant porte déjà est utilisée telle quelle), l'ingrédient repris s'affiche exactement comme le nom saisi, et une erreur bloquerait l'import pour une différence invisible que l'admin ne pourrait résoudre qu'en choisissant ce même ingrédient. Cela règle aussi le 409 générique d'un nom exact noté par C-19. Limite : l'assistant ne compare pas les ingrédients (`existingRowFor` les crée toujours), donc le récapitulatif liste comme créé un ingrédient que la confirmation reprend.
  - **Nit 1.** Les chaînes non ASCII des nouveaux tests (et du JSDoc de `caseInsensitiveKey`) sont écrites en échappements (`\u0300`…), comme les tests de C-61 ; les deux copies de `invisibleCharacters` restent identiques.
  - **Nits 2 et 3.** `ImportEntityRow.pickableOptions` (bouteilles d'une catégorie) et `duplicateKey` de l'aperçu des bouteilles (clé de catégorie) comparent les noms de catégories par `caseInsensitiveKey` ; la confirmation garde l'id de catégorie (C-64). Un test pour chacun, dans les deux sens (fichier décomposé et existant composé, et l'inverse).
  - **Sondes de sabotage.** 8, appliquées une à une ; chacune fait échouer au moins un test : ingrédient non réutilisé, ingrédient créé non ajouté, index par nom brut, sans priorité au nom composé, index à la casse près, avertissement de doublon revenu à `toLowerCase` côté existant puis côté ligne, filtre des bouteilles revenu à `toLowerCase`.
  - **Vérifications.** Backend 1742 tests (99,86 % de lignes), frontend 1445 (99,48 %), lint et `tsc` dans les deux paquets, aucun avertissement `act(...)` ni `[MSW]`.
