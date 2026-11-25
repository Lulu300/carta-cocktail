---
id: C-63
title: "Noms et emplacements : les retours à la ligne entrent par l'API et les imports, pas par les formulaires"
phase: C
lane: backend
criticite: basse
effort: M
status: todo
owner: mixed
depends_on: [C-36]
touches: [backend/src/validation/common.ts, backend/src/validation/bottles.ts, backend/src/validation/categories.ts, backend/src/validation/bottleImport.ts, backend/src/utils/bottlesImport.ts, backend/src/utils/bottlesImport.test.ts, backend/src/utils/bottlesExport.ts, backend/src/utils/bottlesExport.test.ts, frontend/src/components/import/BottleImportRowErrors.tsx, frontend/src/i18n/locales/admin/]
sources: []
branch:
pr:
---

## Contexte

Trouvé pendant C-36 (PR #225), à la demande du coordinateur, qui voulait signaler à l'import CSV une valeur sur plusieurs lignes dans une colonne d'une seule ligne (`name`, `categoryName`, `categoryType`, `location`). Le but était de fermer le dernier cas de « lignes avalées » : `"Bourbon,700` … `C 3",700` est un CSV valide (RFC 4180) qui donne une bouteille dont le nom contient les lignes du milieu.

## Problème constaté

Vérifié sur `fix/C-36-csv-stray-quote` :

- **Formulaires** : nom, emplacement, nom de catégorie et type sont des `<input>` (`BottleFormModal`, `LocationAutocomplete`, `CategoryTypesManager`…). Un champ d'une ligne ne laisse pas entrer de retour à la ligne.
- **Schémas zod** : `RequiredText` (`z.string().trim().min(1)`) et `location: z.string()` acceptent `\n` et `\r`. Cela vaut pour `BottleCreate`, `BottleUpdate`, `CategoryCreate` et la confirmation d'import `bottleImport.ts`. Un appel à l'API, un import JSON ou une sauvegarde restaurée peut donc enregistrer un nom ou un emplacement sur plusieurs lignes.
- **Import CSV** : C-10 garde volontairement un `\r\n` dans une cellule entre guillemets, et le test `keeps a Windows line break inside a quoted field` le fait pour `location`.
- **Export** : `buildCsvPayload` écrit ces valeurs entre guillemets, avec leur retour à la ligne. L'aller-retour export → import est aujourd'hui sans erreur : `Gin\nOld Tom` / `Rhum\nagricole` / `Shelf\r\nleft` reviennent à l'identique.

Refuser ces valeurs à l'import CSV seul ferait donc échouer la réimport d'un export de l'app dès qu'une base contient une telle valeur. C'est pourquoi C-36 ne l'a pas fait.

## Ce qu'il faut faire (décision humaine d'abord)

Choisir une règle unique pour les champs d'une ligne, puis l'appliquer partout :

- **Option A, interdire** : un schéma `SingleLineText` refuse `\r` et `\n` dans ces champs (API, confirmation d'import). L'import CSV et l'import JSON les signalent comme erreur de ligne. Pour les données existantes, il faut au choix une migration qui remplace les retours à la ligne par une espace (réécriture de données : à valider), ou bien un export qui les remplace à l'écriture, pour que l'aller-retour reste sans erreur.
- **Option B, normaliser** : l'API et les imports remplacent tout retour à la ligne de ces champs par une espace, sans erreur. Une valeur avalée sur plusieurs lignes devient visible sur une seule ligne dans la prévisualisation, mais elle n'est pas signalée.
- **Option C, avertir** : garder les valeurs, mais la prévisualisation de l'import affiche un avertissement non bloquant pour une valeur sur plusieurs lignes dans une colonne d'une ligne.

## Critères d'acceptation

- [ ] La règle choisie est la même pour les formulaires, l'API, l'import JSON, l'import CSV et l'export.
- [ ] `"Bourbon,700` … `C 3",700` n'est plus importé en silence comme une bouteille au nom sur plusieurs lignes (erreur, avertissement ou normalisation visible, selon l'option).
- [ ] L'aller-retour export → import d'une base qui contient déjà de telles valeurs reste sans erreur, ou la PR décrit l'action requise.

## Points d'attention

- Les options A et B réécrivent ou refusent des données existantes : il faut la décision de l'humain, et une ligne « Notes de version ».
- `categoryType` est la clé d'un type : la normaliser peut créer un doublon ou en fusionner deux (voir C-61).

## Journal

- 2026-11-25 : tâche créée pendant C-36 (PR #225), hors de son périmètre.
