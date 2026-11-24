---
id: C-65
title: "Noms de catégories, abréviations d'unités, ingrédients : forme composée (NFC) et forme décomposée"
phase: C
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-61, C-19]
touches: [backend/src/utils/uniqueness.ts, backend/src/utils/uniqueness.test.ts, backend/src/services/integrityService.ts, backend/src/services/integrityService.test.ts, backend/src/routes/categories.ts, backend/src/routes/categories.test.ts, backend/src/routes/units.ts, backend/src/routes/units.test.ts, backend/src/routes/ingredients.ts, backend/src/routes/ingredients.test.ts]
sources: []
branch:
pr:
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

- [ ] Créer une catégorie `Crème` en NFD à côté de `Crème` en NFC répond 409, comme `crème` à côté de `Crème`.
- [ ] Un import ou le seed qui rencontre une catégorie ou une unité en NFD la rapproche de celle qui existe en NFC.
- [ ] Le contrôle d'intégrité signale `Écorce` / `écorce` et une paire NFC / NFD.
- [ ] Une catégorie, une unité ou un ingrédient existant en NFD reste inchangé tant que l'admin ne le renomme pas.

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

## Journal

- 2026-11-25 : tâche créée pendant la relecture de #222 (C-61, hors périmètre), complétée d'après la relecture de #226 (C-19 : `CaseInsensitiveIndex`, contrôle d'intégrité par `lower()`).
