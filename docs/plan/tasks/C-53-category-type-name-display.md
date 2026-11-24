---
id: C-53
title: "Types de catégorie : distinguer un nom à espaces ou vide, message à l'enregistrement, types `.` et `..`"
phase: C
lane: frontend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-52]
touches: [frontend/src/components/admin/categories/CategoryTypesManager.tsx, frontend/src/components/admin/categories/CategoryFormModal.tsx, frontend/src/components/admin/categories/categoryForm.ts, frontend/src/components/admin/categories/useCategoryTypeName.ts, frontend/src/pages/admin/CategoriesPage.test.tsx, frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/i18n/locales/admin/en.json, frontend/src/i18n/locales/admin/fr.json, backend/src/routes/categoryTypes.test.ts]
sources: []
branch: fix/C-53-category-type-names-display
pr: 207
---

## Contexte

Trouvé pendant C-52. Des données antérieures à v1.9.0 peuvent contenir un type de catégorie ` SPIRIT ` (espaces autour) à côté de `SPIRIT`, ou un type au nom vide. Depuis C-52, l'API édite et supprime le bon type, mais l'admin doit encore savoir lequel il choisit. La relecture de #206 a relevé deux autres effets, antérieurs à C-52.

## Décisions validées

- 2026-11-24, humain : « C-53 before the rc » — « Extend C-53 to cover (1) visible marking of spaced/empty names, (2) a message instead of a silent Save, and (3) the query form for '.' and '..' too; author + reviewer, merged before the rc. Notes say nothing special. »

## Problème constaté

- Dans Categories > Manage Types, le HTML réduit les espaces : ` SPIRIT ` s'affiche exactement comme `SPIRIT`. L'admin ne sait pas laquelle des deux lignes il édite ou supprime.
- Le type au nom vide s'affiche comme une ligne vide : il ne reste que la pastille de couleur et le nombre de catégories.
- Même chose dans la liste des types du formulaire de catégorie (`CategoryFormModal`), où seule la traduction s'affiche : deux types traduits pareil ne se distinguent pas.
- Une catégorie dont le type est le nom vide ne s'enregistre pas, sans message : `toCategoryInput` renvoie `null` et `handleSubmit` sort sans rien dire. Même chose pour un type personnalisé fait d'espaces.
- Les types nommés `.` et `..` (la création les accepte) ne s'éditent ni ne se suppriment : `encodeURIComponent` garde les points et le navigateur résout ces segments (`/api/category-types/..` devient `/api/`).

## Ce qu'il faut faire

1. Nouveau hook `useCategoryTypeName` (`components/admin/categories/`) :
   - `visibleName(text)` : le nom vide devient « (no name) » / « (sans nom) » ; les espaces autour d'un nom deviennent `␣`, suivis de « (with spaces) » / « (avec espaces) » (des mots, pour que le lecteur d'écran distingue aussi les lignes). Un nom normal reste tel quel.
   - `typeLabel(type)` : la traduction ; pour un type à espaces ou au nom vide qui a une traduction, la traduction suivie du nom stocké marqué (`Spirits – ␣SPIRIT␣ (with spaces)`).
2. Manage Types : `visibleName` sur le libellé et sur le nom stocké. Formulaire de catégorie : `typeLabel` dans la liste des types.
3. Formulaire de catégorie : un type vide affiche `categories.typeRequired` sur le champ concerné (liste des types ou type personnalisé), avec `aria-invalid`, et lui donne le focus. Le message disparaît quand le type change et à la fermeture.
4. `categoryTypeUrl()` (`services/api.ts`) : la forme `?name=` pour `''`, `.` et `..`. Le backend les accepte déjà (`CategoryTypeQuery`).

## Critères d'acceptation

- [x] ` SPIRIT ` et `SPIRIT` se distinguent dans Manage Types et dans le formulaire de catégorie, aussi quand ils ont la même traduction.
- [x] Le type au nom vide a un libellé lisible, traduit en en/fr.
- [x] Les noms normaux s'affichent comme avant.
- [x] « Save » sur une catégorie de type vide affiche un message traduit, au lieu de ne rien faire.
- [x] Les types `.` et `..` s'éditent et se suppriment par `?name=`.

## Tests à ajouter ou adapter

- `CategoriesPage.test.tsx` : liste des types du formulaire (espaces, nom vide, traductions identiques) ; lignes de Manage Types ; catégorie de type vide (message, focus, `aria-invalid`, enregistrement après un autre choix, message absent à la réouverture, axe) ; type personnalisé blanc (message, focus).
- `api.test.ts` : `.` et `..` dans la query, `...` dans le chemin.
- `backend/src/routes/categoryTypes.test.ts` : édition puis suppression de `.` et `..` par `?name=`, les autres types intacts.

## Points d'attention

- Seuls les noms stockés avant v1.9.0 ont des espaces autour ou sont vides : la création trime et refuse un nom vide.
- `api.ts` fait partie du premier chargement : 135,68 kB sur `develop`, 135,71 kB avec la PR (budget 140 kB). Les messages sont dans le bundle admin.

## Journal

- 2026-11-24 : tâche créée pendant C-52 (hors périmètre).
- 2026-11-24 : étendue par la décision de l'humain (message à l'enregistrement, types `.` et `..`). Fait dans #207 : hook `useCategoryTypeName`, message sur le champ de type, `?name=` pour `.` et `..`. `touches` complété (`categoryForm.ts`, le hook, `services/api.ts`, les locales admin, le test backend). Les autres écrans qui affichent un type (badge de la table, manques, formulaire de bouteille, import) : C-54. Pas de ligne « Notes de version », comme l'a demandé l'humain.
