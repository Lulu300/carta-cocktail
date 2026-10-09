# Revue qualité : backend, couche routes et application

Périmètre : `backend/src/routes/*.ts` (hors tests, 15 fichiers, ~2 900 lignes), `backend/src/app.ts`, `index.ts`, `config.ts`, `middleware/auth.ts`, `i18n/index.ts`.
Revue en lecture seule. Les fichiers ont été lus en entier. Quelques vérifications ciblées hors périmètre (schéma Prisma, `i18n/*.json`, appels frontend) ont servi à confirmer des bugs.

## Synthèse

| Axe | Verdict |
|---|---|
| Global | **NEEDS WORK** |
| Logique | fail : 3 bugs CRITICAL dont 1 actif en production via l'UI |
| Gestion d'erreurs | warn : pas de middleware d'erreur, 404/409 renvoyés en 500, NaN non géré |
| Design | warn : routes « fat », aucune couche service sauf pour la disponibilité |
| Maintenabilité | warn : duplication forte (export copié-collé, sync menus, try/catch x71) |

Chiffres mesurés sur les 15 fichiers de routes :
- 71 blocs `try/catch`, 69 `console.error`, 60 occurrences de `errors.serverError`
- 39 `parseInt(String(req.params...))` sans contrôle de NaN
- 12 `JSON.stringify(nameTranslations)` recopiés
- 14 instances de `new PrismaClient()` (une par fichier, plus le service)
- 4 endroits qui créent un `CategoryType` à la volée (3 copies de la même logique « ensure »)

---

## 1. Ce qui va bien

- **Structure prévisible.** Chaque fichier suit le même gabarit (Router, handlers async, `req.t()`), donc on lit vite un fichier qu'on ne connaît pas.
- **Convention Express 5 respectée.** `parseInt(String(req.params.id))` est appliqué partout, comme demandé dans AGENTS.md.
- **Ordre des routes correct.** `bottles.ts:286` (`/export`) est déclaré avant `/:id` (`bottles.ts:326`), et `/import/*` passe avant `/:id` dans `cocktails.ts`. Pas de route masquée.
- **Les imports sont transactionnels.** `cocktails.ts:280` et `bottles.ts:173` utilisent `prisma.$transaction(async tx => ...)`. Le commentaire `bottles.ts:268` montre que le lancement de la sync après commit est un choix réfléchi.
- **L'import de bouteilles est défensif.** Quantité bornée entre 1 et 50 (`bottles.ts:239`), clé de doublon nom|capacité|catégorie (`bottles.ts:211-216`), compteurs `skippedNoCategory` et `duplicatesCreated` renvoyés au client.
- **La logique bouteilles a déjà été en partie extraite.** `utils/bottlesExport.ts` et `utils/bottlesImport.ts` donnent le bon modèle à suivre pour les cocktails.
- **Les menus système sont protégés à la suppression** (`menus.ts:168`) avec un 403 explicite.
- **P2002 est mappé en 409** dans `menus.ts`, `menuBottles.ts`, `ingredients.ts` et dans l'import de cocktails. `ingredients.ts:92,110` est le seul fichier qui mappe aussi P2025 en 404 : c'est la bonne pratique, à généraliser.
- **La disponibilité passe déjà par un service** (`availability.ts` fait 37 lignes et délègue tout à `availabilityService`). C'est la forme à viser pour les autres routes.
- **Les traductions sont parsées par un helper unique** en sortie (`utils/translations.ts`), appliqué de façon assez systématique.
- **Les mutations sont limitées en entrée** : multer impose une taille max et un filtre ext+mime sur les images (`cocktails.ts:32-41`).

---

## 2. Ce qui ne va pas

Sévérités : CRITICAL = provoque un bug ou une perte de données, HIGH = problème probable, MEDIUM = maintenabilité ou incohérence, LOW = petit défaut.

### 2.1 CRITICAL

**C1. `menus.ts:99-108` : `menuSectionId` des cocktails perdu à chaque sauvegarde du menu.** *Bug actif.*
- Le frontend envoie `menuSectionId` pour chaque cocktail (`frontend/src/pages/admin/MenuEditPage.tsx:142-147`). Le backend fait `deleteMany` puis `createMany` sans recopier ce champ.
- Impact : après chaque « Enregistrer » dans l'éditeur de menu cocktails, tous les cocktails se retrouvent hors section. Les sections (feature `3c0f9e5`) ne servent donc à rien pour les menus cocktails. Le même trou existe pour `bottles` (`menus.ts:114-121`), même si l'UI des bouteilles passe par `/menu-bottles/:id`.
- Correctif : ajouter `menuSectionId: c.menuSectionId ?? null`, vérifier que la section appartient bien à `menuId`, et ajouter un test d'intégration qui fait un aller-retour PUT puis GET.

**C2. `cocktails.ts:505-556` : un PUT partiel efface ingrédients, instructions et tags, sans transaction.**
- `cocktails.ts:512-513` : `deleteMany` sur les ingrédients et les instructions est **inconditionnel**, alors que la recréation ne se fait que si `ingredients` ou `instructions` est présent (`523`, `539`). Un `PUT {isAvailable:false}` vide donc la recette.
- `cocktails.ts:509,521` : `tags: tags ?? ''` est toujours écrit, donc un PUT sans `tags` efface les tags.
- Les 3 opérations ne sont pas dans une transaction. Si `update` échoue (`unitId` invalide, id inexistant donnant P2025, `text` non string), le cocktail reste **sans ingrédients ni instructions** et l'API renvoie 500.
- Un id inexistant donne 500 au lieu de 404.
- Impact : perte de données sur toute mise à jour partielle (API, futur toggle de disponibilité, script) ou sur toute erreur de validation.
- Correctif : `prisma.$transaction(async tx => { ... })`, ne supprimer que si le tableau correspondant est fourni, n'écrire `tags` que si `tags !== undefined`, et vérifier l'existence d'abord (404).

**C3. `menus.ts:94-153` : PUT non transactionnel et menus système modifiables (slug et type).**
- `deleteMany`, `createMany` et `update` sont 3 écritures séparées. Si le `update` final lève P2002 (slug déjà pris), le client reçoit 409 mais les associations ont déjà été remplacées. Si le menu n'existe pas, `createMany` lève une erreur de FK et l'API renvoie 500 au lieu de 404.
- `menus.ts:129,131` : on peut changer `slug` et `type` de `aperitifs` et `digestifs`. Conséquences :
  - la protection contre la suppression (`menus.ts:168`, basée sur le slug) se contourne en renommant puis en supprimant ;
  - `syncBottleMenus` (`bottles.ts:24-25`, qui cherche par slug) arrête silencieusement de synchroniser ;
  - `/menu-bottles/menu/:id/sync` (`menuBottles.ts:111-118`, qui se base sur `type`) refuse de synchroniser si le type passe à COCKTAILS.
- Correctif : transaction, refus (403) de modifier `slug` et `type` quand le menu est système, et une constante ou un champ `isSystem` partagé au lieu de littéraux `'aperitifs'`/`'digestifs'` répartis dans 2 fichiers.

### 2.2 HIGH

**H1. Pas de gestion d'erreurs centralisée (`app.ts:25-56`) : codes HTTP faux et réponses non JSON.**
- Aucun middleware d'erreur `(err, req, res, next)` et aucun handler 404 JSON pour `/api/*`.
- **NaN** : `parseInt('abc')` donne `NaN`, que Prisma rejette (`PrismaClientValidationError`), d'où un 500 sur les 39 sites concernés. On attend un 400, ou 404.
- **P2025** (enregistrement introuvable sur update/delete) donne 500 partout sauf dans `ingredients.ts` : `units.ts:66,79`, `categories.ts:93,113`, `bottles.ts:387,418`, `menuBottles.ts:63,86`, `menuSections.ts:58,76`, `cocktails.ts:571,598`, `categoryTypes.ts:97`.
- **Contraintes FK** (P2003, ou Restrict sur `CocktailPreferredBottle.bottle` et `CocktailIngredient.unit`) : suppression d'une unité utilisée, d'une bouteille « préférée » ou d'une catégorie dont une bouteille est préférée. On obtient `500 errors.cannotDelete` alors qu'il s'agit d'un conflit métier (409).
- **Multer** : un fichier trop gros (`LIMIT_FILE_SIZE`) sur `cocktails.ts:580`, `bottles.ts:99` ou `backup.ts:75` remonte au handler Express par défaut, qui répond en HTML (avec la stack hors production). Le frontend attend du JSON.
- Correctif : voir R1.

**H2. `backup.ts:75-149` : la restauration est non atomique et écrase la base sous des connexions ouvertes.**
- `backup.ts:116` : `writeFileSync(dbPath, ...)` remplace le fichier SQLite pendant que **14 PrismaClient** gardent des connexions ouvertes. Résultat : lectures obsolètes, `SQLITE_CORRUPT` ou `database is locked` possibles, jusqu'au redémarrage du process. Il faut `$disconnect()` sur un client unique avant l'écriture, puis se reconnecter.
- Écriture non atomique (pas de fichier temporaire suivi d'un `rename`), pas de copie de sauvegarde de la base courante, et aucune vérification que `database.db` est un fichier SQLite (en-tête `SQLite format 3\0`).
- `backup.ts:125-129` : `unlinkSync` sur chaque entrée de `uploads/` lève une erreur si l'entrée est un sous-dossier. Comme la base a **déjà** été remplacée à ce moment-là, on obtient un état à moitié restauré et un 500.
- `backup.ts:17-21` : `getDatabasePath()` résout `file:./carta_cocktail.db` par rapport au cwd, alors que Prisma le résout par rapport à `prisma/schema.prisma`. En dev local (`.env.example`), l'export répond « Database file not found » et l'import écrit un fichier au mauvais endroit. Docker fonctionne parce qu'il utilise un chemin absolu.
- Le recouvrement avec la revue sécurité (zip-slip, taille 500 Mo) est laissé à l'agent sécurité.

**H3. Synchronisation des menus système : logique dupliquée, incohérente et non atomique.**
- `bottles.ts:18-78` : `syncBottleMenus` contient deux blocs quasi identiques (apéro et digestif, 25 lignes chacun). On peut les factoriser en `syncOne(slug, flag)`.
- Trois implémentations divergent :
  - `syncBottleMenus` identifie les menus **par slug** et **exclut les bouteilles vides** (`bottles.ts:21,33,47`) ;
  - `menuBottles.ts:95-174` identifie **par type** et **n'exclut pas** les bouteilles vides (`menuBottles.ts:121`), donc un « sync » manuel réinsère des bouteilles vides que l'auto-sync avait retirées ;
  - `menus.ts:112-121` permet de remplacer arbitrairement les bouteilles d'un menu système.
- `bottles.ts:405` : la sync n'est déclenchée que si `isApero` ou `isDigestif` figure dans le body. Passer `remainingPercent` à 0 sans les flags laisse la bouteille dans le menu. L'UI actuelle envoie toujours les flags (`BottlesPage.tsx:163-164`), donc le défaut est latent mais le contrat est fragile. Il faut aussi re-synchroniser quand `remainingPercent` change.
- Quand une bouteille vidée puis rechargée est retirée puis recréée, elle perd sa position, sa section et `isHidden`.
- Aucune des écritures (`findFirst` max position puis `create`, `delete`) n'est transactionnelle, et `bottles.ts:371-375` crée N bouteilles en boucle hors transaction (création partielle si la 3e échoue).
- Correctif : un seul `menuSyncService.syncBottle(tx, bottleId)` et `menuSyncService.syncMenu(tx, menuId)` avec la même règle (flag ET non vide), appelé par bottles (POST, PUT, import) et par l'endpoint `/sync`.

**H4. `cocktails.ts:269-422` : l'import confirm échoue entièrement ou crée des lignes orphelines.**
- `cocktails.ts:379` : `unitId: unitId || 0`. Si une unité n'est pas résolue, l'id 0 fait échouer la FK, d'où un 500 générique et un rollback complet, sans indiquer quelle unité pose problème.
- `cocktails.ts:362-364` : une bouteille ignorée sans catégorie résolue devient `sourceType: 'INGREDIENT'` avec `ingredientId: null`, c'est-à-dire une ligne d'ingrédient pointant vers rien. Même chose pour CATEGORY et INGREDIENT non résolus (`367`, `369`).
- `cocktails.ts:289,308,327,342` : `r.data` venant du client est passé tel quel (`...rest`) à `tx.*.create`. Un champ inattendu donne une erreur Prisma et un 500. Le frontend envoie aujourd'hui des objets propres (`ImportCocktailWizard.tsx:36-74`), mais le backend n'a aucun contrat.
- `cocktails.ts:324` : `continue` silencieux si la catégorie de la bouteille n'est pas résolue, sans aucun retour au client (à comparer avec `skippedNoCategory` côté bouteilles).
- Preview (`cocktails.ts:167,173,198,207`) : `ing.unit.abbreviation.toLowerCase()` ou `ing.sourceName.toLowerCase()` lève une exception si le champ manque, d'où un 500 au lieu d'un 400 sur un fichier mal formé.
- `cocktails.ts:226-229` : 4 `findMany` sur des tables entières pour le matching. C'est acceptable pour un seul utilisateur, à signaler à l'agent perf.

**H5. `cocktails.ts:559-608` : fichiers image et base désynchronisés.**
- Suppression (`565-571`) : l'image est effacée **avant** `prisma.cocktail.delete`. Si le delete échoue, l'image est perdue. Si le cocktail n'existe pas, on obtient P2025 et un 500 au lieu de 404.
- Upload (`588-601`) : l'ancienne image est effacée avant l'update. Si l'id n'existe pas, le fichier uploadé reste orphelin sur le disque et l'API répond 500.
- `fs.existsSync`/`unlinkSync` sont synchrones dans un handler async.
- Correctif : vérifier l'existence (404 et suppression du fichier uploadé), faire l'update en base, puis supprimer l'ancien fichier en best effort (`fs.promises.unlink().catch(log)`).

**H6. Positions et sections : réordonnancement partiel et cohérence non vérifiée.**
- `menuSections.ts:98-105` : `Promise.all` de N updates sans transaction. Un id invalide ou appartenant à un autre menu lève P2025 et renvoie 500, **alors que les autres positions sont déjà écrites**. Les ids ne sont pas validés (string, doublons).
- `menuBottles.ts:39` : `position ?? 0` par défaut, donc collision avec la première bouteille. `menuSections.ts:34-43` et `syncBottleMenus` calculent bien max+1 : la règle n'est pas la même partout.
- `menuBottles.ts:68` : `menuSectionId` n'est pas contrôlé, une bouteille peut être rattachée à une section d'un **autre** menu. `menuBottles.ts:35` accepte une bouteille dans un menu de type COCKTAILS.
- Le calcul max+1 se fait en lecture puis écriture, hors transaction (risque de course sur deux POST simultanés).
- Correctif : helpers `nextPosition(tx, model, scope)` et `reorder(tx, model, ids, scope)` dans une `$transaction`, avec vérification `count === ids.length`.

### 2.3 MEDIUM

**M1. i18n des erreurs incohérent, avec des clés manquantes.**
- Clés appelées mais **absentes** de `en.json` et `fr.json` : `errors.cannotDeleteDefaultMenu` (`menus.ts:169`), `menuBottles.deleted` (`menuBottles.ts:87`), `menuBottles.synced` (`menuBottles.ts:166`). i18next renvoie alors la clé brute (« menuBottles.synced ») au client.
- Messages en dur en anglais :
  - `categoryTypes.ts` en entier (`30,39,45,58,69,84,94,98,101`) ;
  - `menuSections.ts:79,107` ;
  - `menuBottles.ts:116` ;
  - `backup.ts:30,43,78,144` ;
  - `bottles.ts:110` (`err.message` brut du parser) ;
  - `middleware/auth.ts:12,22`.
- Les réponses de succès varient : `{message}`, `{success, message}`, l'entité, ou `{updated}`.
- Correctif : compléter les JSON et ajouter un test qui extrait (regex) toutes les clés `req.t('...')` de `src/routes` et vérifie leur présence dans `en.json` et `fr.json`.

**M2. Export de cocktail copié-collé.** `public.ts:131-183` reproduit ligne à ligne `buildExportPayload` (`cocktails.ts:58-119`), avec en plus le calcul du slug (`cocktails.ts:133` et `public.ts:185`). `parseNT` est défini deux fois (`cocktails.ts:10-13`, `public.ts:5-8`) et recouvre `utils/translations.ts`. Le commentaire « same logic as admin export » reconnaît la duplication. Correctif : `services/cocktailExport.ts` exportant `buildCocktailExport(cocktail)` et `exportFilename(name)`.

**M3. Autres duplications.**
- Mapping des ingrédients et instructions de cocktail écrit 2 fois dans `cocktails.ts` (`474-491` et `525-544`).
- `ensureCategoryType` en 3 exemplaires (`categories.ts:20-25`, `cocktails.ts:302-306`, `bottles.ts:185-189`).
- Enrichissement par CategoryType en 2 exemplaires (`categories.ts:10-17`, `shortages.ts:18-19,39`).
- Initialisation paresseuse des settings en 2 exemplaires **avec des valeurs par défaut différentes** (`settings.ts:12-15` contre `public.ts:92-97`).
- Les `include` cocktail sont répétés 3 fois avec des variantes (`cocktails.ts:43-55`, `public.ts:110-122` et `210-222`, `menus.ts:32-40`, `public.ts:40-49`). L'include admin charge `preferredBottles.bottle` sans sa catégorie, le public l'inclut.
- `nameTranslations ? JSON.stringify(nameTranslations) : null` apparaît 12 fois.

**M4. Validation d'entrée faible et sémantique « falsy ».**
- `categories.ts:74` : `desiredStock || 1` transforme 0 en 1 au POST, alors que le PUT accepte 0 (`categories.ts:98`).
- `bottles.ts:355,359` : `purchasePrice || null` transforme un prix de 0 en null. Au PUT, `...(capacityMl && ...)` empêche toute correction vers 0, ce qui est voulu mais sans message.
- `remainingPercent` n'est pas borné à 0-100 (POST, PUT, import), et `alcoholPercentage` n'est pas borné non plus.
- `cocktails.ts:490,543` : `text: inst.text || inst`. Si `inst` est un objet avec `text: ''`, l'objet est passé à Prisma, d'où un 500. `sourceType` n'est pas validé (n'importe quelle chaîne est acceptée), et la cohérence `sourceType` / FK renseignée n'est pas vérifiée.
- `settings.ts:26-38`, `units.ts:59-64` : aucun contrôle de type, donc un mauvais type donne 500 au lieu de 400.
- Query params : `bottles.ts:84,296`. `?categoryId=x` donne NaN puis 500.
- Les `any` sont nombreux (`where: any`, `updateData: any`, `error: any`, `ing: any`), donc TypeScript ne protège rien sur les payloads.

**M5. `public.ts:195-202` : `/public/units` renvoie `nameTranslations` en chaîne JSON brute**, alors que `units.ts:12` renvoie l'objet parsé. Le même type `Unit` côté frontend (`UnitConverter.tsx:20`) reçoit deux formes selon l'endpoint.

**M6. 14 `PrismaClient` (un par fichier, `*.ts:6-10`).** Chacun a son pool. Avec SQLite, plusieurs pools augmentent les `SQLITE_BUSY` en écriture concurrente. Impossible aussi de faire un `$disconnect` global (cf. H2), et cela complique le mock en test. Correctif : `src/lib/prisma.ts` qui exporte un singleton (impact perf détaillé par l'agent perf).

**M7. Couplage par message d'erreur.** `availability.ts:18` teste `error.message === 'Cocktail not found'`. Si le service change son texte, le 404 devient 500. Correctif : `class NotFoundError extends HttpError` lancée par le service.

**M8. Fichiers trop gros et handlers trop longs.**
- `cocktails.ts` (610 lignes) mélange CRUD, upload multer, export, preview d'import et confirm d'import.
- Le handler `/import/confirm` fait ~150 lignes (`269-422`) avec 4 boucles de résolution quasi identiques (`283-345`), soit une complexité cyclomatique d'environ 25. `/import/preview` fait ~120 lignes (`143-266`).
- `bottles.ts` (426 lignes) : `/import/confirm` fait ~125 lignes (`158-284`).
- Correctif : voir R4.

### 2.4 LOW

- `public.ts:73-74` : `isAdmin = !!token`. N'importe quel header `Bearer x` donne accès aux menus privés. C'est un problème de logique **et** de sécurité, à remonter à l'agent sécurité ; il faut utiliser `jwt.verify`.
- `public.ts:106-235` : les endpoints publics exposent n'importe quel cocktail par id, y compris s'il n'est dans aucun menu public. Est-ce voulu ?
- `settings.ts:12-15` et `public.ts:92-97` : un GET avec effet de bord (`create`). Deux GET concurrents à la première exécution peuvent donner P2002 puis 500. Un `upsert` règle le problème.
- `cocktails.ts:242` : `{ id, name: match[matchField], ...match }`. Le spread écrase `name`, donc la valeur calculée juste avant n'est jamais utilisée.
- `cocktails.ts:155-157` : `findFirst({ name: { equals } })` est sensible à la casse en SQLite, alors que le reste du matching est en minuscules.
- `settings.ts:47-89` : le changement d'email ne vérifie ni le format ni le mot de passe courant, et `newPassword` n'a pas de longueur minimale (à voir avec l'agent sécurité).
- `categoryTypes.ts:63` : `PUT /:name` ne permet pas de renommer. Si c'est voulu, il faut le documenter.
- `menus.ts` : les routes `GET /menus/:id` et `PUT` ne passent pas par `parseNameTranslations`, alors que `public.ts:82` le fait. Les menus admin renvoient donc des `nameTranslations` en chaîne pour bottle, category et ingredient imbriqués.
- `index.ts` : pas d'arrêt propre (`SIGTERM` puis `server.close()` puis `prisma.$disconnect()`).

---

## 3. Refactorisations proposées

Effort : S (moins d'une demi-journée), M (1 à 2 jours), L (plus de 3 jours).

| # | Proposition | Résout | Effort | Priorité |
|---|---|---|---|---|
| R0 | Correctifs ciblés : `menuSectionId` dans `menus.ts`, `$transaction` et suppression conditionnelle dans `cocktails.ts` PUT, verrouillage slug/type des menus système, clés i18n manquantes. Chacun avec un test de non-régression. | C1, C2, C3, M1 (partiel) | S | **P0** |
| R1 | **Middleware d'erreur async et classes d'erreur.** `asyncHandler(fn)` (ou s'appuyer sur Express 5, qui propage déjà les rejets de promesse : il suffit de supprimer les try/catch), `class HttpError(status, i18nKey)`, puis `NotFoundError`, `ValidationError`, `ConflictError`. Un `errorHandler` final dans `app.ts` qui mappe : `HttpError` vers son statut, `Prisma P2025` vers 404, `P2002` vers 409, `P2003` vers 409 `cannotDelete`, `PrismaClientValidationError` vers 400, `MulterError` vers 400/413, le reste vers 500 avec log. Plus un handler 404 JSON pour `/api`. | H1, M7, ~70 try/catch | M | **P1** |
| R2 | **Validation par schéma (zod).** Middleware `validate({ params, query, body })` avec un `idParam = z.coerce.number().int().positive()` partagé et un schéma par payload (`CocktailInput`, `BottleInput`, `MenuUpdate`, `ImportRecipeV1`, `ImportResolutions`...). Les types inférés remplacent les `any`. Les schémas d'import peuvent être partagés avec le frontend plus tard. | NaN, M4, H4 (contrat d'import), `inst.text \|\| inst` | M | **P1** |
| R3 | **Client Prisma unique** `src/lib/prisma.ts`, et `$disconnect` puis reconnexion autour de la restauration. Restauration via fichier temporaire, contrôle de l'en-tête SQLite, sauvegarde `.bak`, `fs.rmSync(dir, {recursive})` pour les uploads, résolution du chemin DB comme Prisma (relatif à `prisma/`). | M6, H2 | S (client) + M (backup) | **P1** |
| R4 | **Couche service** (pas de repository : Prisma en tient déjà le rôle, une couche de plus serait du bruit). Services proposés : `cocktailService` (create/update transactionnels, mapping des ingrédients unique), `cocktailExportService` (partagé admin/public), `cocktailImportService` (preview/confirm, avec une fonction générique `resolveEntities(tx, kind, resolutions)` qui remplace les 4 boucles), `menuSyncService` (implémentation unique de H3), `categoryTypeService.ensure(tx, name)`, `settingsService.getOrCreate()`. Les services prennent un `tx` optionnel pour être composables dans une transaction. Les routes ne gardent que validation, appel et réponse. Découper `cocktails.ts` en `cocktails.ts` (CRUD), `cocktailImport.ts` et `cocktailImage.ts`. | C2, H3, H4, H5, M2, M3, M8 | M à L | **P2** |
| R5 | **Helpers de position** `nextPosition(tx, delegate, where)` et `reorder(tx, delegate, ids, scope)` (transaction, vérification d'appartenance et de nombre). Les utiliser dans menuSections, menuBottles, menus et la sync. | H6 | S | P2 |
| R6 | **Helpers de traduction** `serializeTranslations(v)` (entrée) et réutilisation de `parseNameTranslations` à la place de `parseNT`. Appliquer aussi sur `/public/units` et sur les menus admin. | M3, M5 | S | P2 |
| R7 | **Test de cohérence i18n** : toutes les clés `req.t()` existent dans `en` et `fr`. Basculer `categoryTypes`, `menuSections`, `backup` et `auth` middleware sur i18n. Uniformiser les réponses de succès (`204 No Content` pour les DELETE, ou `{ message }` partout). | M1 | S | P2 |
| R8 | **Factory CRUD générique** (`crudRouter({ model, schema, translatable })`). Avis : **à ne pas prioriser**. Seuls `units`, `ingredients` et `categories` sont du CRUD pur. `bottles`, `cocktails` et `menus` ont des effets de bord (sync, fichiers, nested writes) qui casseraient l'abstraction. Une fois R1, R2 et R6 en place, ces 3 routes tiennent en ~40 lignes chacune et la factory n'apporterait plus grand-chose. | duplication résiduelle | M | P3 (optionnel) |

Ordre recommandé : R0, puis R1 et R3 (client), puis R2, puis R4 et R5 en traitant d'abord `cocktails.ts` et la sync des menus. R1 seul fait disparaître environ 400 lignes de boilerplate et corrige la majorité des codes HTTP faux.

Squelette cible pour un handler après R1, R2 et R4 :

```ts
router.put('/:id', validate({ params: IdParams, body: CocktailUpdate }), async (req, res) => {
  const cocktail = await cocktailService.update(req.params.id, req.body); // throws NotFoundError
  res.json(parseNameTranslations(cocktail));
});
```

---

## 4. Tests recommandés (pour l'agent tests)

- PUT `/menus/:id` avec des `cocktails[].menuSectionId`, puis GET : la section doit être conservée (C1).
- PUT `/cocktails/:id` avec `{ isAvailable: false }` seulement : ingrédients, instructions et tags doivent être conservés (C2).
- PUT `/cocktails/:id` avec un `unitId` invalide : 400, et la recette doit être intacte.
- PUT `/menus/:aperoId` avec `{ slug: 'x' }` : 403 (C3).
- GET, PUT et DELETE sur `/units/abc` et `/units/99999` : 400 et 404, pas 500 (H1).
- POST `/menu-sections/.../reorder` avec un id étranger : 4xx, et aucune position modifiée (H6).
- POST `/menu-bottles/menu/:id/sync` avec une bouteille vide flaggée apéro : elle ne doit pas être ajoutée (H3).
- Import confirm avec une unité non résolue : 400 explicite (H4).
