---
id: C-19
title: "Imports : ne pas créer une catégorie ou une unité qui existe à la casse près"
phase: C
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-07, C-09, C-10, C-33]
touches: [backend/src/scripts/seed.ts, backend/src/bootstrap/defaultUnits.ts, backend/src/bootstrap/defaultUnits.test.ts, backend/src/utils/uniqueness.ts, backend/src/utils/uniqueness.test.ts, backend/src/services/categoryTypeService.ts, backend/src/routes/cocktails.test.ts, backend/src/routes/bottles.ts, backend/src/routes/bottles.test.ts, backend/src/services/cocktail/, backend/src/i18n/, frontend/src/types/index.ts, docs/plan/tasks/C-64-import-wizards-ambiguous-match.md]
sources: ["02-backend-data-perf.md §2.4"]
branch: fix/C-19-imports-case-insensitive-names
pr: https://github.com/Lulu300/carta-cocktail/pull/226
---

## Contexte

C-07 a rendu `Category.name` et `Unit.abbreviation` uniques en base, et les routes `categories.ts` et `units.ts` refusent un nom ou une abréviation qui existe à la casse près (`assertUniqueIgnoringCase`, `backend/src/utils/uniqueness.ts`). Les imports créent ces lignes par un autre chemin.

## Problème constaté

- Import de cocktail (`cocktails.ts`, résolution `create` des catégories et des unités) et import de bouteilles (`bottles.ts`, `/import/confirm`, résolution `create` des catégories) : `tx.category.create` / `tx.unit.create` sans contrôle.
- Nom identique : l'index unique lève P2002, tout l'import est refusé avec le 409 générique « Cette entrée existe déjà », sans dire quelle catégorie pose problème.
- Nom identique à la casse près (« rhum » quand « Rhum » existe) : la création passe et crée le doublon que les routes interdisent. `scripts/check-integrity.ts` le signale ensuite comme bloquant.
- Seed (`prisma/seed.ts:80`, relevé en revue de la PR #60) : les unités par défaut sont cherchées par abréviation exacte (`findFirst({ where: { abbreviation } })`). Un admin peut maintenant renommer `cl` en `CL` (changer la casse de sa propre abréviation est permis) : au démarrage suivant, le seed recrée `cl`, un doublon à la casse près que les routes refusent.

## Ce qu'il faut faire

1. Seed : chercher les unités par défaut sans tenir compte de la casse (comparaison en JS sur la liste des unités), et ne créer que celles qui manquent vraiment.
2. Dans les deux imports, avant de créer une catégorie ou une unité, chercher une ligne existante à la casse près : la réutiliser (comme `use_existing`) ou refuser avec un 409 qui nomme la ligne, selon le choix fait pour l'aperçu.
3. Réutiliser `assertUniqueIgnoringCase` ou une variante qui renvoie la ligne trouvée, sans dupliquer la comparaison.

## Critères d'acceptation

- [x] Un import qui demande à créer « rhum » quand « Rhum » existe ne crée pas de doublon.
- [x] Après le renommage de `cl` en `CL`, le seed ne recrée pas `cl`.
- [x] Le message d'erreur éventuel nomme la catégorie ou l'unité en cause (i18n en et fr).

## Tests à ajouter ou adapter

- Import de cocktail et import de bouteilles : création d'une catégorie existante à la casse près ; création d'une unité existante à la casse près (import de cocktail).
- Seed : une unité par défaut renommée avec une autre casse n'est pas recréée.

## Points d'attention

- C-09 (service cocktail) et C-10 (import de bouteilles) réécrivent ces chemins : faire cette tâche après eux, ou l'intégrer à leur PR si elle est encore ouverte.

## Journal

- 2026-10-10 : tâche créée pendant C-07 (les imports contournent le contrôle d'unicité insensible à la casse des routes).
- 2026-10-10 : seed ajouté (revue de la PR #60).
- 2026-10-12 : dépend aussi de C-33 (découpage de C-09 : l'import cocktail est réécrit par C-33).
- 2026-10-12 : D-01 (PR #108) déplace le seed de `backend/prisma/seed.ts` vers `backend/src/scripts/seed.ts` (compilé dans `dist/`, l'image n'a plus `tsx`) : `touches` mis à jour, la ligne citée plus haut (`prisma/seed.ts:80`) est dans ce fichier.
- 2026-11-25 : PR #226 (branche `fix/C-19-imports-case-insensitive-names`). Faits vérifiés sur `origin/develop` (b36d8f6) : les deux confirmations créaient sans contrôle (doublon à la casse près, ou 409 générique pour un nom exact) ; les aperçus prenaient la première ligne égale à la casse près, la confirmation des bouteilles la dernière ; le seed cherchait l'abréviation exacte. Règle unique dans `utils/uniqueness.ts` (`CaseInsensitiveIndex`), utilisée par les deux aperçus, les deux confirmations, le seed et `assertUniqueIgnoringCase` (routes) : la ligne exacte d'abord, sinon la seule ligne égale à la casse près ; plusieurs lignes égales à la casse près et aucune exactement (données antérieures à C-07) : ambiguïté. Aperçus : statut `ambiguous`, `existingMatch: null`, `ambiguousMatches` (`previewMatch`, partagé) ; bouteilles et ingrédients gardent la première correspondance (rien ne les rend uniques à la casse près). Confirmations : une catégorie ou une unité à créer qui existe à la casse près est reprise telle quelle (son type, son stock et ses traductions ; aucun type de catégorie créé) ; une ligne créée par l'import rejoint l'index (deux références de même nom à la casse près donnent une ligne) ; une ambiguïté répond 409 `errors.ambiguousCategoryName` / `errors.ambiguousUnitAbbreviation`, qui nomme la valeur et les lignes (en, fr), sans rien écrire ; la catégorie de chaque ligne de bouteilles suit la même règle. Seed : unités par défaut déplacées dans `bootstrap/defaultUnits.ts` (`ensureDefaultUnits`, testable comme `ensureAdmin`), rien n'est créé pour une unité trouvée ou ambiguë. Pas de correspondance par les traductions : la règle d'unicité des routes et de `check-integrity` porte sur le nom, et les traductions ne sont pas uniques. Règles des types de catégorie (C-52 à C-59) inchangées : `ensureCategoryType` n'est appelé que pour une catégorie vraiment créée. `frontend/src/types/index.ts` : `ImportMatchStatus` et `ambiguousMatches`, sans changement d'écran. Sondes de sabotage (correspondance exacte retirée, ambiguïté résolue par la première ligne, ligne créée hors de l'index, création directe dans chacun des trois chemins, aperçus des catégories et des unités revenus à la première correspondance, ingrédients passés à la règle ambiguë, catégorie de ligne sans contrôle d'ambiguïté, ambiguïté masquée dans l'aperçu des bouteilles, seed par abréviation exacte, seed qui crée sur ambiguïté) : chacune fait échouer au moins un test. Hors périmètre : C-64 (afficher l'ambiguïté dans les deux assistants et faire choisir une ligne, après C-62, qui touche les mêmes fichiers). Relevé sans ID de réserve : l'import de cocktail qui crée un ingrédient dont le nom exact existe échoue encore avec le 409 générique (`Ingredient.name` unique, sensible à la casse).
- 2026-11-25 : relecture de #226 (changements demandés), corrigée dans la même PR. (1) Bloquant : une catégorie à créer réutilisée ne contrôlait plus son type (`ensureCategoryType` n'était appelé que dans la création) : un nouveau type blanc ou invisible passait (201) si le nom existait à la casse près, et répondait 400 sinon. `ensureCategoryType` est séparé en une partie en lecture seule, `categoryTypeNameFor` (type existant exact, sinon nom nettoyé, même 400 au même chemin), et une partie écriture, `createMissingCategoryType` (upsert en gris) ; `ensureCategoryType` les enchaîne pour les routes. Les deux imports appellent la première pour chaque résolution `create` avant `findOrCreate`, et la seconde seulement dans la création : la validité de la requête ne dépend plus de la base, et une catégorie réutilisée ne crée aucun type. (2) Label `fix` posé. (3) Aperçu de cocktail : bouteilles et ingrédients aussi en correspondance exacte d'abord, puis première ligne égale à la casse près, jamais ambiguë (`matchFirst`, ces noms n'étant pas uniques à la casse près). (4) Nits : clé de test `mescal` avec `MEZCAL` saisi. Le seed remplit maintenant aussi les traductions nulles d'une unité par défaut renommée dans une autre casse (`CL`), comme il le faisait pour l'abréviation exacte ; il ne remplace jamais des traductions existantes. Sondes de sabotage (type non contrôlé avant la réutilisation, dans chaque import ; type créé avant la réutilisation, dans chaque import ; `matchFirst` sans correspondance exacte ; `ensureCategoryType` sans upsert) : chacune fait échouer au moins un test. Hors périmètre, déjà suivi : normalisation NFC des noms de catégories et d'unités et comparaison de `integrityService` (C-65, créée par C-61) ; affichage de l'ambiguïté dans les assistants (C-64).
- Notes de version : « An import that creates a category or a unit which already exists, ignoring case, now uses the existing one as it is (its type, stock and translations are kept, whatever the wizard said) instead of creating a duplicate or failing with "This entry already exists". When older data holds several categories or units that differ only by case and the file matches none of them exactly, the import is refused with a message that names them (since C-64, #228, the wizards flag it before the confirmation). The startup seed no longer recreates a default unit (`cl`) renamed in another case (`CL`). »
