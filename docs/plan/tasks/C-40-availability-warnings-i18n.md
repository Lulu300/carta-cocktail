---
id: C-40
title: "Disponibilité : avertissements de stock traduits côté frontend, noms localisés"
phase: C
lane: backend
criticite: basse
effort: M
status: todo
owner: agent
depends_on: [E-10]
touches: [backend/src/services/availabilityService.ts, backend/src/services/availabilityService.test.ts, backend/src/routes/availability.test.ts, frontend/src/types/index.ts, frontend/src/components/admin/cocktails/AvailabilityWarnings.tsx, frontend/src/components/admin/cocktails/, frontend/src/pages/admin/CocktailsPage.test.tsx, frontend/src/pages/admin/CocktailFormPage.test.tsx, frontend/src/i18n/locales/admin/, frontend/src/i18n/bundles.test.ts]
sources: []
branch:
pr:
---

## Contexte

La disponibilité d'un cocktail (`GET /api/availability/cocktails` et `/cocktails/:id`) renvoie des listes de textes prêts à afficher. Le frontend les montre tels quels dans `AvailabilityWarnings` (cartes et liste de `/admin/cocktails`, formulaire de cocktail via `IngredientsFields`). Ces textes sont construits par le backend, en anglais, sans tenir compte de la langue de l'interface. Relevé par la relecture de la PR #134 (E-10), lors du parcours manuel de l'admin en français.

## Problème constaté

- **Message de stock bas en anglais, pluriel faux.** `backend/src/services/availabilityService.ts:285` (`lowStockWarnings`) construit `` `${resource.name}: only ${servings} servings left` ``. Dans l'interface française, on lit « Tanqueray: only 1 servings left ». Les tests le figent : `availabilityService.test.ts:269` et `:441` (« 1 servings »).
- **Noms non traduits.** `missingIngredients` et les noms des avertissements reprennent le `name` brut de la catégorie ou de l'ingrédient (`categoryResource`, `bottleResource`, `describeLine`). Le chargement du stock (`availabilityService.ts:360-363`) ne lit pas `nameTranslations` : « Sirop de sucre » et « Amer » restent affichés en anglais alors que « Sugar syrup » et « Bitters » existent. Les bouteilles n'ont pas de traduction (nom de marque).
- **Autres textes anglais en dur, non affichés aujourd'hui.** Les `reason` des lignes (`'Ingredient marked as unavailable'`, `'Bottle is empty'`, `` `No ${category.name} bottles available` ``, `` `Insufficient ${category.name} in stock` ``) et `UNKNOWN_SOURCE_NAME = 'Unknown'` (`:118`), qui finit dans `missingIngredients` pour une ligne orpheline. Le frontend n'affiche pas `reason` (aucun usage dans `frontend/src`) ; « Unknown » apparaît dans la liste « Missing ».

## Ce qu'il faut faire

1. Backend : renvoyer des données plutôt que du texte. Par exemple `lowStock: { name, nameTranslations, servings }[]` et `missing: { name, nameTranslations }[]`, ou un drapeau `orphan` à la place de `'Unknown'`. Lire `nameTranslations` des catégories et des ingrédients dans le chargement du stock. Garder les anciens champs le temps de la transition seulement si un autre consommateur les lit (vérifier `public.ts`, qui n'utilise que `available`).
2. Frontend : `AvailabilityWarnings` localise les noms avec `useLocalizedName` et formate le stock bas avec une clé au pluriel du paquet admin, par exemple `cocktails.lowStockItem_one` / `_other` (« {{name}} : plus que {{count}} dose », « {{name}}: only {{count}} serving left »). Une ligne orpheline utilise une clé (« Source inconnue »).
3. Décider du sort des `reason` : les supprimer s'ils restent inutilisés, ou les remplacer par un code traduit côté frontend.

## Critères d'acceptation

- [ ] Plus aucun texte anglais construit par `availabilityService.ts` n'est affiché dans l'admin (`grep -n "servings left\|'Unknown'" backend/src/services/availabilityService.ts` ne trouve plus rien, ou ces textes ne sont plus renvoyés).
- [ ] En français : « Tanqueray : plus que 1 dose », « … plus que 2 doses » ; en anglais : « only 1 serving left », « only 2 servings left ».
- [ ] Les listes « Missing » et « Low stock » affichent le nom traduit d'une catégorie ou d'un ingrédient quand il existe.
- [ ] Couverture ≥ 80 % sur les lignes modifiées (backend et frontend).

## Tests à ajouter ou adapter

- `availabilityService.test.ts` : forme des nouvelles données (nom, traductions, nombre de doses), ligne orpheline ; adapter les tests `:269` et `:441`.
- `routes/availability.test.ts` : forme de la réponse.
- `AvailabilityWarnings` (ou `CocktailsPage.test.tsx`) : nom localisé, clé au pluriel reçue avec `count` (mock `translateWithValues`).
- `bundles.test.ts` : la nouvelle clé est dans le paquet admin et a ses formes `_one` / `_other` (déjà vérifié par les tests existants).

## Points d'attention

- Changement du contrat de l'API de disponibilité : frontend et backend dans la même PR, pas de version intermédiaire publiée.
- C-14 corrige `nameTranslations` renvoyé en chaîne JSON par `GET /menus/:id` : renvoyer ici un objet déjà parsé, comme le reste de l'API.

## Journal

- 2026-10-13 : tâche créée par E-10, à partir de la relecture de la PR #134.
