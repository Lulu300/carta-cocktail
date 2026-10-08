# Revue 5 : architecture et qualité du frontend admin

**Périmètre lu en entier** : `frontend/src/pages/admin/*.tsx` (12 pages), `components/import/*.tsx` (6), `components/layout/*.tsx` (2), `services/api.ts`, `services/exportZip.ts`, `types/index.ts`, `contexts/*.tsx`, `utils/*.ts`, `hooks/*.ts` (lus pour le contexte), `App.tsx`, `main.tsx`, `eslint.config.js`, `tsconfig*.json`, plus `i18n/locales/{en,fr}.json` (comparaison des clés). Quelques routes backend ont été lues pour vérifier le contrat (`backend/src/routes/menus.ts`, `menuBottles.ts`, `settings.ts`, `auth.ts`, `backup.ts`).

**Méthode** : revue en lecture seule. J'ai lancé `npx eslint src` une fois (lecture seule) : 0 erreur, 1 avertissement (directive `eslint-disable` inutile dans `SettingsPage.tsx:49`). Je n'ai lancé ni les tests ni `tsc`.

## Synthèse

| Axe | Verdict |
|---|---|
| Logique | **fail** : 1 bug critique de perte de données (sections de menu), plusieurs bugs HIGH |
| Gestion des erreurs | **fail** : la plupart des mutations n'ont ni `try/catch` ni retour utilisateur ; le 401 est mal géré |
| Design | **warn** : architecture « page autonome » cohérente, mais beaucoup de duplication, pas de couche d'état serveur, contrat front/back non partagé |
| Maintenabilité | **warn** : environ 55 chaînes en dur en français, 11 coquilles de modale copiées, logique d'import dupliquée à 3 endroits |

**Verdict global : NEEDS WORK.** La base est saine (TS strict, hooks utilitaires, découpage du wizard cocktail, i18n en/fr synchronisés). Le gros de la dette tient à trois choses : pas de gestion d'état serveur, pas de gestion d'erreurs homogène, et de la duplication entre pages CRUD.

---

## 1. Ce qui va bien

- **TypeScript strict** (`tsconfig.app.json:20-25` : `strict`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`). Aucun `any` dans le périmètre lu.
- **`services/api.ts` centralisé** : un seul `request<T>()` générique, endpoints regroupés par ressource, `FormData` géré correctement (`api.ts:21-24`), `encodeURIComponent` sur les noms de types de catégorie (`api.ts:60`).
- **Hooks réutilisables déjà en place** : `useSort`, `usePagination` (le `safePage` de `usePagination.ts:24` évite les pages hors limites quand on filtre), `useLocalizedName` (mémoïsé sur `i18n.language`), `useClickOutside`.
- **Utilitaires purs et testés** : `cocktailSearch.ts` (normalisation des accents et recherche multi-termes, bien pensée), `localization.ts` (chaîne de fallback claire), `unitConverter.ts`, `uploads.ts` (gère le `BASE_URL` derrière un reverse proxy).
- **`ImportCocktailWizard` bien découpé** : orchestrateur avec `ImportStepUpload`, `ImportStepResolve`, `ImportStepConfirm` et `ImportEntityRow`, fonction pure `buildAutoResolutions`.
- **`ImportBottlesWizard`** : `setState` fonctionnels (`ImportBottlesWizard.tsx:122-128`), unions discriminées bien typées (`BottleCategoryResolution`, `BottleRowResolution` dans `types/index.ts:346-361`).
- **`SettingsPage`** est le bon modèle de gestion d'erreurs : `try/catch`, message de succès ou d'erreur par section, état `exporting/importing` (`SettingsPage.tsx:53-126`). À généraliser.
- **i18n** : `en.json` et `fr.json` ont exactement les mêmes 307 clés, et toutes les clés `t('…')` utilisées existent dans les deux fichiers.
- **`useMemo` utilisé là où ça compte** : filtrage et tri des listes (`BottlesPage.tsx:94-117`, `CocktailsPage.tsx:32-54`).

---

## 2. Problèmes critiques et majeurs

### [CRITICAL] C1. Chaque sauvegarde d'un menu cocktails efface les sections des cocktails
- **Où** : `pages/admin/MenuEditPage.tsx:143-148` envoie `menuSectionId` dans `cocktails[]`. Côté serveur, `backend/src/routes/menus.ts:99-108` fait `deleteMany` puis `createMany` avec seulement `cocktailId`, `position` et `isHidden`, et **ignore `menuSectionId`**.
- **Pourquoi TS ne le voit pas** : `MenuInput.cocktails` (`types/index.ts:189-193`) ne déclare pas `menuSectionId`. Le littéral est produit par un `.map()` dont le type est inféré, donc le contrôle des propriétés en trop ne s'applique pas.
- **Impact** : l'admin range ses cocktails en sections et clique « Enregistrer ». Tout revient dans « Sans section ». Perte de données silencieuse, sur chaque sauvegarde. Aucun test ne couvre `MenuEditPage` (pas de `MenuEditPage.test.tsx`).
- **Correctif** : ajouter `menuSectionId?: number | null` à `MenuInput.cocktails` et à `MenuInput.bottles`, le persister dans `menus.ts` (`createMany`), et ajouter un test d'intégration backend plus un test de page front. Faire aussi un `deleteMany` + `createMany` en `prisma.$transaction` (sujet backend).

### [HIGH] H1. Gestion du 401 dans `api.ts` : déconnexion silencieuse et messages d'erreur perdus
- **Où** : `services/api.ts:31-34`
  ```ts
  if (res.status === 401) {
    localStorage.removeItem('token');
    throw new Error('Unauthorized');
  }
  ```
- **Problèmes** :
  1. `AuthContext` n'est pas notifié. `user` reste rempli et l'UI admin reste affichée, mais toutes les requêtes suivantes échouent sans redirection vers `/login`.
  2. Le backend renvoie aussi 401 pour des erreurs **métier** : mot de passe actuel incorrect dans `backend/src/routes/settings.ts:65`, et identifiants invalides dans `auth.ts:21,27`. Résultat : dans `SettingsPage`, une faute de frappe sur le mot de passe actuel **supprime le token** et affiche « Unauthorized » en anglais au lieu du message traduit `errors.invalidCredentials`. Même chose sur la page de login.
  3. `exportFile`, `exportBackup` et `importBackup` (`api.ts:93-121, 269-303`) contournent `request()` et ne gèrent pas le 401 du tout. La politique d'authentification n'est donc pas la même selon l'endpoint.
- **Correctif** : créer une classe `ApiError { status, message, body }` qui conserve **toujours** `data.error`. N'invalider la session que si une requête authentifiée reçoit un 401 et que ce n'est pas `/auth/login` ni `/settings/profile`. Le mieux est que le backend renvoie 400 ou 403 pour un mauvais mot de passe actuel. Ajouter un callback `onUnauthorized` (ou un `EventTarget`) écouté par `AuthProvider`, qui appelle `logout()` puis `navigate('/login', { state: { from } })`. Faire passer les trois appels `fetch` bruts par un helper commun `requestBlob()`.

### [HIGH] H2. Mutations sans `try/catch` : promesses rejetées non gérées, modales bloquées, aucun retour utilisateur
Le même schéma se répète partout :
```ts
const load = () => api.list().then(setItems);       // pas de catch
const handleSubmit = async (e) => { ...; await api.create(data); setShowModal(false); load(); };
```
| Fichier | Lignes |
|---|---|
| `CategoriesPage.tsx` | 43-45 (chargement), 74-96 (submit), 98-102 (delete), 124-141 (submit type) |
| `BottlesPage.tsx` | 90-92, 152-178, 180-184 |
| `IngredientsPage.tsx` | 26-27, 60-77, 79-93 |
| `UnitsPage.tsx` | 34-35, 50-65, 67-71 |
| `MenusPage.tsx` | 19-20, 31-37 (slug dupliqué : rien ne s'affiche), 39-43 |
| `CocktailsPage.tsx` | 59, 78-82 ; 103-104 et l'export batch ne font qu'un `console.error` |
| `CocktailFormPage.tsx` | 49-61, 63-88, 127-133, 135-168 |
| `MenuEditPage.tsx` | 33-50 (un 404 laisse « Chargement… » affiché pour toujours), 83-151 |
| `MenuBottleEditPage.tsx` | 67-78, 103 (`console.error` seulement), 109-202 |
| `DashboardPage.tsx` | 11-27 (si une requête échoue, toutes les stats restent à 0) |
| `ShortagesPage.tsx` | 13 |

- **Impact** :
  - Un `DELETE` refusé par le backend (catégorie avec bouteilles, unité utilisée…) ne fait rien de visible.
  - La modale reste ouverte sans message.
  - `unhandledrejection` dans la console.
  - Les clés i18n `*.created`, `*.updated` et `*.deleted` existent dans les deux langues mais ne sont **jamais utilisées** : il n'y a aucun retour de succès non plus.
- **Cas grave, `CocktailFormPage.tsx:156-167`** : il n'y a pas d'état `isSubmitting`. Un double-clic crée deux cocktails. Si `create` réussit mais que `uploadImage` échoue, l'utilisateur reste sur la page en mode création. Un nouveau clic sur « Enregistrer » **crée un doublon**.
- **Correctif** : voir la recommandation R1 (TanStack Query). À défaut, un hook `useMutationWithFeedback()` combiné à un `ToastProvider`. Bloquer le bouton de soumission pendant la requête. Dans `CocktailFormPage`, après un `create` réussi, faire `navigate` vers `/admin/cocktails/:id` avant l'upload, ou gérer l'échec de l'upload séparément.

### [HIGH] H3. `ShortagesPage` annonce « aucune pénurie » pendant le chargement et en cas d'erreur
- **Où** : `ShortagesPage.tsx:11-21`. Le state initial `[]` est rendu immédiatement comme un bandeau vert `shortages.noShortages`, et une erreur API produit le même affichage.
- **Impact** : l'information est fausse et rassurante, sur la page même dont le rôle est d'alerter.
- **Correctif** : gérer `isLoading` et `error`. Le même défaut existe sous une forme plus légère dans `DashboardPage` (affiche 0 partout) et dans `CategoriesPage`, `UnitsPage` et `MenusPage` (« Aucun résultat » pendant le chargement).
- **À noter aussi** : `ShortagesPage.tsx:46` divise par `item.requiredPercent`, ce qui donne `NaN` ou `Infinity` si ce pourcentage vaut 0.

### [HIGH] H4. `CocktailFormPage` : le mode édition dépend de la présence d'unités
- **Où** : `CocktailFormPage.tsx:63-88`, avec `if (isEdit && allUnits.length > 0)` et la dépendance `[isEdit, id, allUnits]`.
- **Impact** :
  - Si la base ne contient aucune unité, le formulaire d'édition reste vide indéfiniment.
  - L'effet dépend de l'identité du tableau `allUnits` : tout nouveau `setAllUnits` relance le `GET` et écrase les modifications en cours.
  - La requête n'est pas annulée si `id` change. React Router réutilise le composant entre `/admin/cocktails/new` et `/admin/cocktails/:id`, puisque c'est le même type d'élément au même emplacement : le state de l'un peut se retrouver dans l'autre.
- **Correctif** : charger le cocktail indépendamment, dans `Promise.all` ou avec `useQuery(['cocktail', id])`. Mettre `key={id ?? 'new'}` sur la route (`App.tsx:57-58`) pour remonter le composant. Annuler avec `AbortController` ou un flag `ignore`.
- **Autres points du même formulaire** :
  - Aucune validation : les lignes d'ingrédient avec `bottleId`, `categoryId` ou `ingredientId` à `null` (`:146-148`) et `unitId: 0` (`:97`) partent au backend.
  - `key={idx}` sur des lignes supprimables (`:266`, `:359`).
  - `URL.createObjectURL` n'est jamais révoqué (`:231`).

### [HIGH] H5. `MenuBottleEditPage` : closures périmées et mises à jour non atomiques
- **Où** : `MenuBottleEditPage.tsx:109-122` et `184-196`. On a `setMenuBottlesList(menuBottlesList.map(...))` **après un `await`**, donc sur une valeur capturée avant l'appel réseau. Deux clics rapides (masquer le groupe A, puis le groupe B) font perdre la première mise à jour locale.
- **`moveGroupUp` / `moveGroupDown`** (`:124-161`) :
  1. Les deux fonctions sont copiées-collées à 95 %.
  2. Chaque déplacement envoie **N requêtes `PUT`** en parallèle, une par bouteille de la section.
  3. Si un `PUT` échoue, les positions restent incohérentes et l'erreur n'est pas gérée.
- **Correctif** :
  - Utiliser des `setState` fonctionnels : `setMenuBottlesList(prev => prev.map(...))`.
  - Fusionner les deux fonctions en `moveGroup(sectionId, from, to)`.
  - Ajouter côté backend un endpoint `POST /menu-bottles/menu/:id/reorder { ids: number[] }` exécuté en transaction. L'API `menuSections.reorder` existe déjà mais n'est utilisée nulle part.

### [HIGH] H6. `BottlesPage` : le bouton « Enregistrer et dupliquer » contourne la validation du formulaire
- **Où** : `BottlesPage.tsx:484`. Le bouton `type="button"` appelle `handleSubmit(e as unknown as React.FormEvent, true)`. La validation HTML5 (`required` sur le nom, `:425`) ne s'applique donc pas, et une bouteille sans nom peut être envoyée. Le cast `as unknown as` signale le problème.
- **Point lié** : `openCreate` (`:131`) met `categoryId: cats[0]?.id || 0`. Si les catégories ne sont pas encore chargées, ou s'il n'y en a aucune, la requête part avec `categoryId: 0`.
- **Correctif** : utiliser un bouton `type="submit"` avec `name="intent" value="duplicate"` et lire `(e.nativeEvent as SubmitEvent).submitter`, ou appeler `form.requestSubmit()`. Désactiver « Ajouter » tant que `cats` est vide.

### [HIGH] H7. `CocktailsPage` : « Tout sélectionner » ignore les filtres
- **Où** : `CocktailsPage.tsx:172-179`. Le code fait `setSelectedIds(new Set(items.map(...)))` sur **tous** les cocktails, pas sur `filteredItems`. Avec une recherche « rhum » active, l'export ZIP contient tout le catalogue.
- **Correctif** : utiliser `filteredItems`, que ce soit pour l'état coché ou pour la sélection.

### [MEDIUM] M1. `BottlesPage` : fragment sans `key` dans une liste
- **Où** : `BottlesPage.tsx:236`. `renderGroupRow` renvoie `<>…</>` et la `key` est posée sur le `<tr>` interne. Les éléments de `paginatedGroups.map` n'ont donc pas de clé : React émet un avertissement, et la réconciliation se fait mal quand on déplie un groupe.
- **Correctif** : `<Fragment key={group.key}>`.
- Variable morte au même endroit : `singles` (`:27, :40`).

---

## 3. Architecture

### 3.1 État serveur : `useEffect` et `fetch` manuels partout
- Chaque page réimplémente `useState<T[]>([])` + `useEffect(() => { load(); }, [])` + `load()` après chaque mutation. Il n'y a ni cache, ni déduplication, ni annulation, ni état loading ou error homogène (seuls `SettingsPage`, `CocktailsPage` pour la disponibilité et les wizards en ont un).
- **Conséquences concrètes** :
  - `AdminLayout.tsx:30-32` relance `GET /shortages` à **chaque navigation**. Le badge ne se met pas à jour après une mutation faite sur la même page, par exemple quand on vide une bouteille dans `BottlesPage`.
  - `DashboardPage.tsx:11-27` charge **5 listes complètes**, bouteilles avec relations comprises, juste pour compter. `/shortages` est donc demandé deux fois sur `/admin`.
  - `ImportStepResolve.tsx:23-29` recharge 5 listes à chaque montage, donc à chaque aller-retour entre les étapes et pour chaque recette d'un import batch, sans `catch`.
  - `CocktailFormPage` charge 4 listes, déjà chargées par d'autres pages quelques secondes plus tôt.
  - Aucune requête n'est annulée (`AbortController` absent du code). Une réponse arrivée dans le désordre peut écraser un état plus récent (badge des pénuries, formulaire cocktail).

### 3.2 Couche `api.ts`
| Constat | Où | Proposition |
|---|---|---|
| 401 mal géré, message serveur perdu | `api.ts:31-34` | Voir H1 : `ApiError` + `onUnauthorized` |
| `fetch` brut dupliqué 3 fois, logique de téléchargement dupliquée 2 fois (regex `Content-Disposition` différentes : `:113` gère les guillemets, `:281` non) | `api.ts:93-121`, `269-288`, `289-303` | Helpers `requestBlob()` et `downloadBlob(blob, filename)`, réutilisés aussi par `exportZip.ts:30-37` |
| `revokeObjectURL` appelé juste après `a.click()` (certains navigateurs annulent alors le téléchargement) | `api.ts:119-120`, `286-287` | `setTimeout(() => URL.revokeObjectURL(url), 0)` ou attacher le lien au DOM comme dans `exportZip.ts` |
| Entrées trop larges : `Partial<Category>`, `Partial<Bottle>`, `Partial<Unit>` laissent passer `id`, `createdAt`, `_count`… | `api.ts:69-72`, `87-90`, `157` | DTO explicites : `CategoryInput`, `BottleInput`, `UnitInput` |
| Pas d'en-tête `Accept-Language` : le backend (`i18next-http-middleware`) choisit la langue d'après le navigateur, pas d'après la langue choisie dans l'UI. Un admin en anglais sur un navigateur français reçoit des erreurs en français | `api.ts:13-24` | `headers['Accept-Language'] = i18n.language` |
| Environ 10 méthodes jamais appelées : `categories.get`, `bottles.get`, `ingredients.get`, `units.get`, `menuBottles.listByMenu/create/delete`, `menuSections.listByMenu/reorder`, `availability.getCocktail` | `api.ts` | Les supprimer, ou brancher `reorder` dans l'UI (les sections ne peuvent pas être réordonnées aujourd'hui) |
| `request()` appelle `res.json()` sans condition : un 204 ou une réponse vide fait planter l'appel | `api.ts:41` | `if (res.status === 204) return undefined as T` |

### 3.3 Types front et back : duplication manuelle et dérive
- `types/index.ts` (372 lignes) est **écrit à la main** et doublonne les modèles Prisma et les sérialisations du backend. Dérives constatées :
  - **C1** : `menuSectionId` absent de `MenuInput`.
  - `Cocktail.tags: string` en lecture (`:96`) contre `CocktailInput.tags: string[]` en écriture (`:177`). Le contrat est asymétrique, d'où les `split(',')` éparpillés (`CocktailsPage.tsx:36, 49, 317, 399`, `CocktailFormPage.tsx:137, 204`).
  - `IngredientAvailability.sourceType: string` (`:204`) au lieu de l'union `'BOTTLE' | 'CATEGORY' | 'INGREDIENT'`.
  - L'union `'COCKTAILS' | 'APEROS' | 'DIGESTIFS'` est répétée à 3 endroits (`:136`, `:187`, et en dur dans `MenusPage`). L'union des sources est répétée 4 fois (`:65`, `:164`, `:235`, `CocktailFormPage.tsx:16`).
  - `EntityResolutionAction.data` est un `ImportEntityRef` fourre-tout, avec tous les champs optionnels (`:257-268`). Il faudrait une union discriminée par type d'entité, comme celle déjà faite pour l'import de bouteilles.
- **Proposition (effort M)** :
  - Créer un workspace `shared/` (ou `packages/contracts`) avec des **schémas zod** pour les DTO d'entrée et de sortie. Le backend s'en sert pour valider `req.body` (ce qu'il ne fait pas aujourd'hui), le frontend en dérive les types via `z.infer`.
  - Alternative plus légère : générer les types de base avec `prisma-zod-generator` ou `prisma-json-types-generator`.
  - Dans tous les cas, déclarer les unions une seule fois : `export type SourceType = …`, `export type MenuType = …`.

### 3.4 Authentification et contextes
- `AuthContext.tsx:20-30` : après `login()`, `setToken` relance l'effet, qui rappelle `/auth/me`. La requête est redondante, puisque `login` renvoie déjà l'utilisateur.
- `AuthContext.tsx:46` : l'objet `value` est recréé à chaque rendu, et `login` / `logout` ne sont pas mémoïsés. Tous les consommateurs re-rendent. Impact faible, mais `useMemo` et `useCallback` suffisent.
- `App.tsx:25` : `<Navigate to="/login" />` sans `replace` ni `state.from`. Après connexion, on n'est pas ramené à la page demandée.
- `App.tsx:24` : « Loading... » en dur, non traduit.
- `SiteSettingsContext.tsx:29-33` duplique la logique de `refresh` (`:20-27`). L'effet devrait simplement appeler `refresh()`.

---

## 4. Composants trop gros : quoi extraire

### 4.1 Duplication transversale (mesurée)
| Motif | Occurrences | Extraction proposée |
|---|---|---|
| Coquille de modale `fixed inset-0 z-50 … bg-black/60` | 11 (Categories ×2, MenuEdit ×2, Ingredients, Units, Menus, Bottles, MenuBottleEdit, 2 wizards) | `<Modal title onClose size>` avec Échap, clic sur le fond et focus trap |
| Bloc « Traductions FR/EN » repliable + construction de `nameTranslations` | 4 blocs JSX (`CategoriesPage:225-245, 354-374`, `IngredientsPage:233-253`, `UnitsPage:131-151`) + 4 fonctions de construction (`CategoriesPage:78-80, 126-129`, `IngredientsPage:62-64`, `UnitsPage:52-54`) | `<TranslationFields value onChange placeholder />` + `utils/translations.ts` avec `toTranslationForm()` et `buildNameTranslations()` |
| SVG inline des icônes Éditer et Supprimer | 9 et 8 copies | `<IconButton icon="edit" | "delete" label />` (corrige aussi les boutons sans libellé accessible) |
| Interrupteur `w-12 h-6 rounded-full` | 4 (`CocktailFormPage:212`, `MenuEditPage:193`, `MenuBottleEditPage:282`, `MenusPage:158`) | `<ToggleSwitch checked onChange label />` |
| `confirm()` natif suivi de `await api.delete()` puis `load()` | 7 | `useConfirm()` + `<ConfirmDialog>` |
| Tableau triable + pagination + « Aucun résultat » | Categories, Units, Menus, Bottles | `<DataTable columns rows sort pagination emptyLabel />` |
| Badge de tags (`split(',')` puis `<span>`) | 3 (`CocktailsPage:317, 399`, `CocktailFormPage:204`) | `<TagList tags />` + `parseTags()` |

### 4.2 Pages CRUD (Categories, Ingredients, Units, Bottles, Menus)
Elles suivent toutes la même structure : liste, recherche, tri, pagination, modale de création ou d'édition, suppression avec `confirm`.
- **Hook `useCrudResource<T, Input>(api)`** qui renvoie `{ items, isLoading, error, create, update, remove, isMutating }`. Avec TanStack Query, il tient en 30 lignes.
- **Hook `useEntityForm<T>(toForm, fromForm)`** qui gère `editing`, `form`, `open(item?)`, `close()` et `submit()`. Il remplace les couples `openCreate` / `openEdit` copiés partout, dont le défaut : `openEdit` ne réinitialise pas `showTranslations` dans `CategoriesPage:54-67`, `IngredientsPage:51-58` et `UnitsPage:38-48`.
- **`CategoriesPage` (390 lignes)** : extraire `<CategoryFormModal>` (`:216-279`) et `<CategoryTypesManager>` (`:282-387`, environ 100 lignes avec leur propre state `typeForm`, `editingType` et `showTypeTranslations`, à sortir dans un hook). Remplacer la valeur magique `'__OTHER__'` (`:59, 70, 252, 254`) par une constante. `COLOR_DOT_CLASSES[ct.color || 'gray'] || COLOR_DOT_CLASSES.gray` (`:299`) devrait passer par un helper `getDotClasses()`, sur le modèle de `getBadgeClasses()`.
- **`BottlesPage` (502 lignes)** :
  - `groupBottles` et `isGroup` vont dans `utils/bottleGrouping.ts`. La même clé de regroupement existe dans `MenuBottleEditPage.tsx:25`.
  - `<BottleRow>`, `<BottleGroupRow>` et `<BottleHistoryTable>` (`:192-265`, `:363-417`).
  - `<BottleFormModal>` (`:419-492`) et `<ExportMenu>` (`:278-301`). Ce menu ne se ferme pas au clic extérieur, alors que `useClickOutside` existe déjà.
  - `useBottleFilters()` (`:58-61`, `:99-114`).
  - Une fois découpée, la page tiendrait en environ 150 lignes.
- **`CocktailsPage` (442 lignes)** :
  - Les vues grille (`:267-344`) et liste (`:346-428`) dupliquent les actions, les tags, l'image et le badge. Extraire `<CocktailActions>`, `<CocktailThumbnail>`, `<AvailabilityBadge>` et `<AvailabilityWarnings>`, puis `<CocktailCard>` et `<CocktailListItem>`.
  - Ajouter un hook `useSelection<number>()` (`:25-26`, `:84-91`).

### 4.3 `MenuEditPage` (391 lignes) et `MenuBottleEditPage` (424 lignes)
Environ 40 % de code identique :
- gestion des sections (state, create, rename, delete et modale) : `MenuEditPage:26-29, 83-112, 205-244, 370-388` contre `MenuBottleEditPage:62-65, 163-196, 297-336, 403-421`, quasiment ligne pour ligne ;
- formulaire d'infos du menu (nom, description, public, lien) ;
- boutons ▲/▼, sélecteur de section, bouton visible/masqué ;
- regroupement « sans section » puis sections (`MenuEditPage:156-166` contre `MenuBottleEditPage:81-94`).

**Proposition (effort M)** :
- `useMenuSections(menuId, initial)` qui renvoie `{ sections, create, rename, remove }`, avec `setState` fonctionnels et gestion d'erreurs.
- `<MenuSectionsManager>`, `<MenuInfoForm>`, `<ReorderButtons onUp onDown disableUp disableDown>` et `<SectionSelect>`.
- Une fonction générique `groupBySection<T extends { menuSectionId: number | null }>(items, sections)`.

**Modèles de persistance incohérents** :
- `MenuEditPage` enregistre les cocktails **au clic sur Enregistrer**, mais les sections **immédiatement**.
- `MenuBottleEditPage` enregistre tout **immédiatement**, sauf le nom et la description.
- « Annuler » n'a donc pas le même sens selon la page et selon l'élément. Il faut choisir un seul modèle. Je recommande l'enregistrement immédiat avec retour optimiste, cohérent avec `menuBottles`.

**Autres points** :
- `isDefaultMenu` repose sur des slugs en dur (`MenusPage.tsx:70`, `MenuBottleEditPage.tsx:206`). Le backend devrait exposer `isSystem`.
- `MenuBottleEditPage.tsx:257` : tout menu qui n'est pas `APEROS` est titré « digestifs ».
- `:241` : `{group.alcoholPercentage && …}` affiche « 0 » si le taux vaut 0.
- `:24` : `mb.bottle!` plante si la relation n'est pas incluse.
- `:30` : le nom de catégorie n'est pas localisé.
- `MenuEditPage.tsx:114-134` : `moveCocktailUp` et `moveCocktailDown` sont dupliqués. Une fonction `move(sectionId, from, to)` suffit.

### 4.4 Les deux wizards d'import
| Duplication | Où |
|---|---|
| Coquille de modale, en-tête, indicateur d'étapes 1-2-3, écrans succès et erreur | `ImportCocktailWizard.tsx:189-238` contre `ImportBottlesWizard.tsx:166-189`, `453-490` |
| Zone de dépôt de fichier | `ImportStepUpload.tsx:111-126` contre `ImportBottlesWizard.tsx:194-213` |
| Calcul de la clé de résolution (`abbreviation \|\| name`, en minuscules) | **3 copies** : `ImportCocktailWizard.tsx:31, 43, 55, 67`, `ImportStepResolve.tsx:41-44`, `ImportStepConfirm.tsx:21-23`. Modifier la règle oblige à toucher 3 fichiers |
| Données de création par défaut | `ImportCocktailWizard.tsx:35-75` contre `ImportEntityRow.tsx:51-83` ; `ImportBottlesWizard.tsx:30-39` contre `:281-289` |
| Libellé de type de catégorie forcé en français (`ct.nameTranslations?.fr \|\| …`), qui ignore la langue courante | `ImportBottlesWizard.tsx:316`, `ImportEntityRow.tsx:202`. Utiliser `useLocalizedName()` |

**Proposition** :
- `<WizardModal title steps currentStep onClose>`, `<FileDropzone accept onFile>` et `<WizardResult variant>`.
- `utils/importResolutions.ts` qui exporte `resolutionKey(type, ref)` et `defaultCreateData(type, ref)`.
- Découper `ImportBottlesWizard` (523 lignes) en `BottleImportCategoryStep`, `BottleImportRowsStep` et `BottleImportConfirmStep`, sur le modèle du wizard cocktail.
- Porter la machine d'états dans un `useReducer` (étape, aperçu, résolutions, erreur) : elle devient testable sans DOM.

**Bugs dans les wizards** :
- **[MEDIUM] Batch cocktails, « Réessayer »** : `ImportCocktailWizard.tsx:168-175` ajoute un échec à `importResults`. « Réessayer » (`:319`) puis une réussite ajoutent une deuxième entrée pour la même recette. Le récapitulatif et le compteur `success/total` deviennent faux (`total > recipes.length`).
- **[MEDIUM] Écran blanc** : si l'aperçu de la recette suivante échoue (`advanceToNextRecipe` aux lignes `:134-147`, puis `previewRecipe` dont le `catch` ne change pas d'étape), on reste sur `step === 'confirm'` avec `preview === null`. Le modal s'affiche vide, sans message d'erreur ni bouton.
- `ImportEntityRow.tsx:175, 181, 191, 222, 239` : `resolution?.data?.name || entity.ref.name`. On ne peut pas vider le champ, le texte revient. Utiliser `??`.
- `ImportEntityRow.tsx:230` : `parseInt('')` donne `NaN`, envoyé au backend.
- `ImportEntityRow.tsx:42` : `existingId` peut valoir `undefined` s'il n'y a aucune option.
- `ImportStepConfirm.tsx:32-36` : `mappedTo` est calculé à partir de `existingMatch` (faux si l'utilisateur a choisi une autre entité existante), et il n'est **jamais affiché** (`:85`).
- `ImportStepResolve.tsx:47-61` : comme `buildAutoResolutions` remplit toutes les entrées, `allResolved` vaut presque toujours `true`. La logique est quasiment morte.
- `ImportStepUpload.tsx:27-42` : `FileReader` n'a pas d'`onerror`. `validateRecipe` (`:21-25`) accepte n'importe quel objet avec `version === 1` et un `cocktail.name`, sans vérifier `ingredients` ni `instructions`.

---

## 5. Hooks : dépendances, re-rendus, courses

- **Lint** : `npx eslint src` ne remonte **aucun** avertissement `exhaustive-deps`, alors que le motif `useEffect(() => { load(); }, [])` avec un `load` défini dans le composant apparaît dans 8 pages. Il faut vérifier que la règle est active dans le preset `reactHooks.configs.flat.recommended` v7 et l'ajouter explicitement dans `eslint.config.js` (`'react-hooks/exhaustive-deps': 'error'`). Ajouter aussi `--max-warnings=0` au script `lint`. Supprimer la directive inutile de `SettingsPage.tsx:49` (on peut d'ailleurs initialiser `email` directement depuis `user`).
- **Courses** :
  - `CocktailFormPage.tsx:63-88` : voir H4.
  - `AdminLayout.tsx:30-32` : aucune annulation, une réponse plus ancienne peut écraser le compteur.
  - `MenuBottleEditPage` : voir H5.
  - `ImportBottlesWizard.tsx:66-69` et `ImportStepResolve.tsx:23-29` : pas de garde contre le démontage.
- **Re-rendus** : peu de problèmes réels à cette échelle. `useSort` et `usePagination` renvoient des fonctions non mémoïsées (`toggleSort`, `setPage`), ce qui est sans effet tant qu'elles ne sont pas passées à des composants `memo`. `IngredientsPage.tsx:138` recalcule les compteurs à chaque rendu, mais c'est négligeable. Il est inutile de mémoïser davantage : la priorité est la gestion de l'état serveur.
- **`useSort` sur `category.name`** (`BottlesPage.tsx:344`) trie sur le nom brut, pas sur le nom localisé. Le tri affiché ne suit donc pas l'ordre visible en anglais.

---

## 6. Formulaires

- **Pas de bibliothèque de formulaire.** L'état est un objet géré à la main (`setForm({ ...form, x })`, environ 40 occurrences) ou une série de `useState` (CocktailFormPage : 13 `useState` de formulaire).
- **Validation** : uniquement l'attribut HTML `required`, contourné dans H6. Aucune validation métier :
  - ingrédient sans source ;
  - `quantity` à 0 ;
  - `capacityMl` à 0 (`BottlesPage.tsx:439` fait `parseInt(...) || 0` alors que le champ a `min=1`) ;
  - slug vide après normalisation ;
  - `conversionFactorToMl` négatif.
- **Pas d'état `isSubmitting`** sur aucun formulaire CRUD : le double envoi est possible partout.
- **Proposition (effort M)** : react-hook-form + `@hookform/resolvers/zod`, avec les mêmes schémas zod que ceux proposés en 3.3. `useFieldArray` convient parfaitement aux ingrédients et instructions de `CocktailFormPage` : clés stables au lieu de `key={idx}`, ajout et suppression gérés. On commencerait par `CocktailFormPage` puis `BottleFormModal`.

---

## 7. i18n : chaînes en dur et cohérence

**Les fichiers de traduction sont cohérents** : 307 clés en anglais, 307 en français, aucune clé manquante d'un côté ou de l'autre, aucune clé utilisée qui n'existe pas.

**Mais environ 55 chaînes sont écrites en dur, presque toutes en français**, ce qui contredit la règle « All text via i18n keys » de `frontend/AGENTS.md`. Un admin en anglais voit donc une interface mélangée.

| Fichier | Lignes | Exemples |
|---|---|---|
| `MenuBottleEditPage.tsx` | 185, 235, 242, 257, 300, 303, 308, 341, 347, 353-354, 360, 366, 407, 411, 417 | « Gérer la carte des apéritifs », « Synchroniser », « Sans section », « Créer une section », « % vol. » |
| `MenuEditPage.tsx` | 105, 208, 211, 216, 263, 281, 322, 374, 378, 384 | `confirm('Supprimer cette section ?…')`, « Sans section », « Créer » |
| `UnitsPage.tsx` | 86, 99, 157, 163, 166 | « Facteur de conversion (ml) », « Non convertible », « Ex: 1 cl = 10 ml… » |
| `BottlesPage.tsx` | 199, 214, 347, 455, 456, 463, 466, 470 | « Alcool », « Alcool % (vol.) », « Utilisation », « Utilisable comme apéritif », « ml », « € » |
| `CocktailsPage.tsx` | 119, 129, 141, 149, 154 | « Indisponible », « dose/doses » (pluriel fait à la main), « Stock faible », « Manquant », « autre(s) » |
| `MenusPage.tsx` | 61, 64, 86, 94-95, 108-109 | « Type », « Contenu », « (par défaut) », « Apéritifs », « bouteille(s) » |
| `IngredientsPage.tsx` | 257 | « Icône (optionnel) » |
| `CategoriesPage.tsx` | 335 | `placeholder="GARNISH, MIXER..."` |
| `Categories/Ingredients/UnitsPage` | ×4 | libellés « Français » / « English » (acceptables comme noms de langue, mais à centraliser) |
| `App.tsx` | 24 | « Loading... » |

**Autres incohérences** :
- Libellés de type de catégorie forcés en `fr` dans les wizards (voir 4.4).
- 19 clés ont une valeur identique en anglais et en français (« Cocktails », « Description », « Notes », « Tags », « Actions »). C'est normal pour ces mots, il n'y a rien à faire.
- 14 clés de succès (`*.created`, `*.updated`, `*.deleted`) et quelques autres (`bottles.empty`, `bottles.filterByType`, `bottles.all`, `cocktails.step`, `cocktails.unit`, `common.confirm`, `common.success`, `cocktails.importWizard.invalidVersion`…) ne sont jamais utilisées. Soit on les branche (toasts), soit on les supprime.
- Le pluriel est fait à la main (`dose/doses`, `bouteille(s)`) au lieu d'utiliser `count` avec les suffixes `_one` / `_other` d'i18next, déjà employés ailleurs (`dashboard.shortageAlert`).
- Langue des erreurs backend : voir 3.2 (`Accept-Language`).

**Garde-fou proposé (effort S)** : `eslint-plugin-i18next` avec la règle `i18next/no-literal-string` en mode `jsx-text-only` dans `eslint.config.js`, plus `i18next-parser` en CI pour détecter les clés mortes.

---

## 8. Configuration (ESLint, tsconfig)

- `eslint.config.js` : configuration minimale correcte. Pistes :
  - activer `exhaustive-deps` explicitement et ajouter `--max-warnings=0` ;
  - `@typescript-eslint/no-floating-promises` (nécessite le lint typé, `tseslint.configs.recommendedTypeChecked`). Cette règle aurait signalé **tous** les cas de H2 ;
  - `@typescript-eslint/no-non-null-assertion` en `warn` (`MenuBottleEditPage:24`, `CocktailFormPage:65, 158`) ;
  - le plugin i18next de la section 7.
- `tsconfig.app.json` : ajouter `noUncheckedIndexedAccess: true`. Cela forcerait à traiter `rows[index]`, `resolutions.bottles[idx]`, `groups.get(key)!` et `recipes[nextIndex]`. `ecmaVersion: 2020` dans ESLint est en décalage avec `target: ES2022` : passer à `'latest'`.

---

## 9. Plan de refactorisation priorisé

| # | Action | Priorité | Effort | Gain |
|---|---|---|---|---|
| 1 | **Corriger C1** : `menuSectionId` dans `MenuInput` et dans `menus.ts`, plus des tests front et back pour `MenuEditPage` | P0 | S | Arrête une perte de données |
| 2 | **H1** : `ApiError` qui conserve le message, 401 → `logout` + redirection via `AuthContext`, ne plus purger le token sur les 401 métier, `Accept-Language` | P0 | S | Session fiable, messages traduits |
| 3 | **H3, H6, H7, M1** : chargement de `ShortagesPage`, validation de « Dupliquer », sélection filtrée, `key` du fragment | P0 | S | Bugs visibles, correctifs locaux |
| 4 | **R1 : adopter TanStack Query** (`@tanstack/react-query` v5). Un `queries.ts` par ressource (`useBottles`, `useCreateBottle`…) avec invalidation (`['shortages']` invalidé après chaque mutation de bouteille, ce qui corrige le badge), état loading/error unifié, annulation automatique, retry et déduplication (Dashboard, AdminLayout, CocktailForm, ImportStepResolve). Migrer page par page en commençant par `ShortagesPage` et `DashboardPage` | P1 | M (infrastructure S, migration M) | Corrige H2, H3, H4 et 3.1 d'un coup |
| 5 | **Retour utilisateur** : `ToastProvider` et `<ConfirmDialog>`, brancher les clés `*.created`, `*.updated`, `*.deleted` | P1 | S | Visibilité des erreurs et des succès |
| 6 | **Primitives UI** : `Modal`, `IconButton`, `ToggleSwitch`, `TranslationFields`, `DataTable`, `TagList` | P1 | M | Environ −600 lignes, cohérence, base pour l'accessibilité |
| 7 | **Menus** : `useMenuSections`, `MenuSectionsManager`, `MenuInfoForm`, `ReorderButtons`, un seul modèle de persistance, endpoint de réordonnancement en lot (H5) | P1 | M | Environ −250 lignes, plus de mises à jour perdues |
| 8 | **i18n** : extraire les environ 55 chaînes, pluriels i18next, `no-literal-string` en lint | P1 | S-M | UI anglaise utilisable |
| 9 | **Contrats partagés** : `shared/` avec zod (validation backend et types frontend), unions `SourceType` et `MenuType` déclarées une fois, DTO d'entrée | P2 | M-L | Fin de la dérive front/back (classe de bugs de C1) |
| 10 | **Formulaires** : react-hook-form + zod, `useFieldArray` dans `CocktailFormPage`, `isSubmitting` partout | P2 | M | Validation, pas de double envoi, clés stables |
| 11 | **Wizards** : `WizardModal`, `FileDropzone`, `utils/importResolutions.ts`, `ImportBottlesWizard` découpé en étapes, `useReducer`, correction des bugs batch (4.4) | P2 | M | Environ −200 lignes, logique testable |
| 12 | **Hygiène** : supprimer l'API morte, `noUncheckedIndexedAccess`, `no-floating-promises`, `exhaustive-deps` explicite, helper `downloadBlob` | P3 | S | Prévention |

**Ordre conseillé** : 1 → 2 → 3 (une PR courte chacune), puis 4 et 5 ensemble, puisqu'ils redéfinissent le modèle d'une page. Ensuite 6 et 7 avant 8, pour ne pas extraire les chaînes deux fois. 9 à 12 en continu.

**Tests à ajouter en parallèle** (la règle des 80 % de couverture sur le delta s'applique) : `MenuEditPage` et `MenuBottleEditPage` n'ont **aucun** fichier de test. Il faut en priorité un test de non-régression pour C1 (sauvegarde en conservant `menuSectionId`) et un pour H5 (deux bascules rapides).
