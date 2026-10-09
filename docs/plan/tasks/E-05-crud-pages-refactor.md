---
id: E-05
title: "Pages CRUD (catégories, ingrédients, unités, bouteilles) : TanStack Query + découpage"
phase: E
lane: frontend
criticite: moyenne
effort: L
status: todo
owner: agent
depends_on: [E-02, E-03, E-04]
touches: [frontend/src/pages/admin/CategoriesPage.tsx, frontend/src/pages/admin/IngredientsPage.tsx, frontend/src/pages/admin/UnitsPage.tsx, frontend/src/pages/admin/BottlesPage.tsx, frontend/src/pages/admin/MenusPage.tsx, frontend/src/components/admin/, frontend/src/queries/, frontend/src/components/layout/AdminLayout.tsx, frontend/src/utils/bottleGrouping.ts, frontend/src/utils/translations.ts, frontend/src/utils/colors.ts]
sources: ["05-frontend-archi.md §4.2", "05-frontend-archi.md §H2"]
branch:
pr:
---

## Décisions validées (2026-10-08)

- **Suppression bloquée** (décision C-07) : sur une réponse 409 avec `details`, afficher la liste des cocktails et bouteilles impactés dans la boîte de dialogue ou le toast d'erreur. Le bouton « Supprimer quand même » (suppression forcée) est ajouté par E-15, pas ici.

## Contexte

Les cinq pages CRUD de l'admin ont la même structure (liste, recherche, tri, pagination, modale, suppression) et les mêmes défauts : aucune erreur affichée, double envoi possible, pas de retour de succès. Une suppression refusée par le backend ne produit rien. Cette tâche les passe sur TanStack Query (E-02), les composants de base (E-03) et les toasts (E-04), et coupe les deux plus grosses.

## Problème constaté

- Chargement sans `catch` et mutations sans `try/catch` : `UnitsPage.tsx:34-35, 50-71`, `IngredientsPage.tsx:26-27, 60-93`, `CategoriesPage.tsx:43-45, 74-102, 124-141`, `MenusPage.tsx:19-20, 31-43`, `BottlesPage.tsx:90-92, 152-184`. Un slug de menu en double (`MenusPage.tsx:33`) n'affiche rien.
- Aucun état `isSubmitting` : double clic = double création.
- « Aucun résultat » affiché pendant le chargement (`CategoriesPage.tsx:212` et équivalents).
- `openEdit` ne réinitialise pas `showTranslations` : `CategoriesPage.tsx:54-67`, `IngredientsPage.tsx:51-58`, `UnitsPage.tsx:38-48`.
- Bloc « Traductions FR/EN » copié 4 fois (`CategoriesPage.tsx:225-245, 354-374`, `IngredientsPage.tsx:233-253`, `UnitsPage.tsx:131-151`) et construction de `nameTranslations` copiée 4 fois (`CategoriesPage.tsx:78-80, 126-129`, `IngredientsPage.tsx:62-64`, `UnitsPage.tsx:52-54`).
- `CategoriesPage.tsx` (390 lignes) : valeur magique `'__OTHER__'` (`:59, 70, 252, 254`), `COLOR_DOT_CLASSES[ct.color || 'gray'] || …` (`:299`), gestion des types de catégorie (`:282-387`) mêlée à la page.
- `BottlesPage.tsx` (502 lignes) : `groupBottles` et `isGroup` (`:25-51`) avec variable morte `singles` (`:27, 40`) ; même clé de regroupement dans `MenuBottleEditPage.tsx:25` et `MenuPublicPage.tsx:25`. Menu d'export (`:278-301`) qui ne se ferme pas au clic extérieur. Tri sur `category.name` brut et non localisé.
- `MenusPage.tsx:70` : menus système détectés par slug en dur.

## Ce qu'il faut faire

### Socle commun (premier commit)

1. `queries/crud.ts` : fabrique de mutations.
   ```ts
   function useCrudMutations<T, Input>(opts: {
     key: QueryKey;
     api: { create(d: Input): Promise<unknown>; update(id: number, d: Partial<Input>): Promise<unknown>; delete(id: number): Promise<unknown> };
     invalidates?: QueryKey[];
     messages: { created: string; updated: string; deleted: string }; // clés i18n
   }): { create: UseMutationResult; update: UseMutationResult; remove: UseMutationResult }
   ```
   `onSuccess` : `invalidateQueries` sur `key` et `invalidates`, puis `toast.success(t(message))`. `onError` : `toast.error(err)`.
2. `components/admin/useEntityForm.ts` :
   ```ts
   useEntityForm<T, F>(toForm: (item?: T) => F): { isOpen; editing: T | null; form: F; setField<K extends keyof F>(k: K, v: F[K]); open(item?: T); close() }
   ```
   `open()` réinitialise tout l'état du formulaire, y compris l'ouverture du bloc traductions.
3. `utils/translations.ts` : `toTranslationForm(nt)` → `{ fr, en }` et `buildNameTranslations({ fr, en })` → `Record<string,string> | null` (chaînes vides retirées).
4. `components/admin/TranslationFields.tsx` : `value: { fr: string; en: string }`, `onChange`, `placeholder?`, `defaultOpen?`. Remplace les 4 blocs.
5. `components/admin/DataTable.tsx` :
   ```ts
   interface Column<T> { key: string; header: string; sortable?: boolean; align?: 'left' | 'right'; render(row: T): ReactNode }
   DataTable<T>({ columns, rows, getRowKey, sort, pagination, isLoading, emptyLabel })
   ```
   Réutilise `SortableHeader` et `Pagination`, affiche des `Skeleton` pendant `isLoading`, `emptyLabel` seulement quand les données sont chargées.
6. `utils/colors.ts` : ajouter `getDotClasses(color?: string)` sur le modèle de `getBadgeClasses`.
7. `utils/bottleGrouping.ts` : déplacer `groupBottles`, `isGroup` et une fonction `bottleGroupKey(b)`. Supprimer `singles`. E-07 et E-11 réutiliseront `bottleGroupKey`.

### Migration, une page par commit, dans cet ordre

1. **UnitsPage** (177 lignes, le cas le plus simple) : `useUnits` + `useCrudMutations` (invalide aussi `qk.availability`), `Modal`, `Field`, `TranslationFields`, `DataTable`, `useConfirm` pour la suppression, bouton « Enregistrer » en `loading` pendant la mutation.
2. **IngredientsPage** : idem ; `toggleAvailability` et `bulkAvailability` deviennent des mutations qui invalident `qk.ingredients` et `qk.availability`.
3. **CategoriesPage** : extraire `components/admin/categories/CategoryFormModal.tsx` et `CategoryTypesManager.tsx` (avec un hook `useCategoryTypeForm`). Constante `OTHER_TYPE = '__OTHER__'`. Remplacer `alert()` (`:149`) par `toast.error`. Les mutations de catégories invalident `qk.categories`, `qk.categoryTypes`, `qk.bottles`, `qk.shortages`, `qk.availability`.
4. **MenusPage** : erreur 409 (slug pris) affichée par toast, menus système via un helper `isSystemMenu(menu)` (voir Points d'attention).
5. **BottlesPage** : extraire `components/admin/bottles/BottleRow.tsx`, `BottleGroupRow.tsx`, `BottleHistoryTable.tsx`, `BottleFormModal.tsx`, `ExportMenu.tsx` (fermeture via `useClickOutside`) et `useBottleFilters.ts`. Trier la colonne catégorie sur le nom localisé. Les mutations de bouteilles invalident `qk.bottles`, `qk.shortages`, `qk.categories`, `qk.menus`, `qk.availability`. Objectif : page sous 200 lignes.
6. Supprimer l'invalidation transitoire de `AdminLayout` ajoutée par E-02.

Les textes en dur déplacés (« Alcool % (vol.) », « Facteur de conversion (ml) », « Français »/« English »…) restent tels quels ; E-10 les traduit. Les nouveaux textes passent par `t()`. Les couleurs en dur des fichiers touchés passent aux tokens d'E-03.

## Critères d'acceptation

- [ ] Plus aucun `confirm(`, `alert(`, `useEffect(() => { load(); }` dans les 5 pages.
- [ ] Supprimer une catégorie qui a des bouteilles affiche le message d'erreur du backend dans un toast.
- [ ] Chaque création, modification et suppression réussie affiche le toast `*.created`, `*.updated` ou `*.deleted`.
- [ ] Double clic rapide sur « Enregistrer » : une seule requête `POST` (onglet Réseau ou test).
- [ ] Vider une bouteille dans `BottlesPage` met à jour le badge de pénuries sans changer de page.
- [ ] « Aucun résultat » n'apparaît jamais pendant le chargement.
- [ ] Rouvrir l'édition après avoir ouvert les traductions d'une autre entité : le bloc revient à son état par défaut.
- [ ] `BottlesPage.tsx` ≤ 200 lignes, `CategoriesPage.tsx` ≤ 150 lignes.
- [ ] Plus de `bg-[#…]` dans les fichiers touchés.
- [ ] Tests et couverture ≥ 80 % sur les lignes modifiées.

## Tests à ajouter ou adapter

- Unitaires : `utils/translations.test.ts`, `utils/bottleGrouping.test.ts` (groupe d'une bouteille, groupe de plusieurs, clé insensible à la casse), `useEntityForm.test.ts` (`open(item)` puis `open()` remet le formulaire à zéro), `queries/crud.test.tsx` (invalidation des bonnes clés, toast succès et erreur).
- `DataTable.test.tsx` : squelette pendant le chargement, `emptyLabel` après chargement, tri au clic sur un en-tête.
- Adapter les tests des 5 pages (`*.test.tsx` existants) : suppression via `getByRole('alertdialog')` au lieu de `window.confirm` ; erreur de suppression → `getByRole('alert')` contient le message ; bouton désactivé pendant l'envoi ; vérification que `shortages.list` est rappelé après une mise à jour de bouteille.
- `BottlesPage.test.tsx` mocke aujourd'hui `MultiSelectDropdown` et `LocationAutocomplete` (`:32-41`). Garder ces mocks ici ; E-13 les retirera.

## Points d'attention

- Tâche longue (effort L). Si elle dépasse 2 jours, la couper en deux PR : Units + Ingredients + Categories, puis Menus + Bottles, avec le socle commun dans la première.
- E-06 touche aussi `queries/`. Les deux tâches ne peuvent pas tourner en parallèle ; finir E-05 d'abord permet à E-06 de réutiliser `useCrudMutations` et la mutation de création d'ingrédient.
- Menus système : si A-02 expose un champ `isSystem` (ou une constante partagée), l'utiliser. Sinon, centraliser les slugs `aperitifs` et `digestifs` dans `isSystemMenu()` sous `components/admin/menus/` pour que E-07 l'importe.
- A-09 corrige avant cette tâche le bouton « Enregistrer et dupliquer » (`BottlesPage.tsx:484`) et la clé du fragment (`:236`). Repartir de ces correctifs et les garder dans `BottleFormModal` et `BottleGroupRow`.
- Les entrées `Partial<Category>`, `Partial<Bottle>`, `Partial<Unit>` de `api.ts` restent larges. Les DTO précis viennent avec F-05 ; ne pas toucher `api.ts` ici.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
