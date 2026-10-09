# Revue 2 - Backend : modèle de données, performance, import/export/backup, calculs de stock

Périmètre lu en entier : `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`, `backend/src/services/availabilityService.ts`, `backend/src/utils/{translations,bottlesExport,bottlesImport}.ts`, `backend/src/routes/{backup,public}.ts`. Lu en partie pour la perf : `routes/{bottles,cocktails,menus,menuBottles,shortages,categoryTypes,availability,ingredients}.ts`, `backend/Dockerfile`, `docker-compose.yml`.
Rien n'a été modifié ni exécuté. Les durées citées sont des ordres de grandeur estimés, pas des mesures.

Légende : priorité P1 (à faire) / P2 (utile) / P3 (confort). Effort S (< 1/2 j), M (1-2 j), L (> 2 j).

---

## 1. Synthèse

**Ce qui va bien**
- Le schéma est lisible et couvre le domaine. Les cascades sur la plupart des tables de menu (`MenuCocktail`, `MenuBottle`, `MenuSection`) sont cohérentes.
- Les contraintes `@@unique([menuId, cocktailId])`, `@@unique([menuId, bottleId])` et `@@unique([cocktailIngredientId, bottleId])` existent.
- `Menu.slug` et `Ingredient.name` sont uniques.
- L'import de bouteilles (`routes/bottles.ts:173`) tourne dans une transaction. Les doublons sont signalés plutôt que bloqués, et les quantités sont plafonnées à 50.
- L'import de cocktail (`routes/cocktails.ts:280`) est aussi transactionnel, avec un flux preview puis confirm propre.
- Les utilitaires CSV gèrent les guillemets, les sauts de ligne dans les champs et `\r\n`.
- `bottlesExport` agrège les bouteilles identiques en `quantity`, ce qui garantit un aller-retour export/import cohérent.
- `translations.ts` est petit et testé. Son coût (un `JSON.parse` par entité) est négligeable à cette échelle.
- `menuBottles` sync (`menuBottles.ts:95-174`) est correct : calcul en mémoire avec des `Set`, puis `createMany` et `deleteMany`. C'est le bon modèle.
- Le calcul de pénurie (`shortages.ts`) est correct : 2 requêtes, agrégation en JS.

**Ce qui ne va pas (top)**
1. Le seed relancé à chaque démarrage Docker écrase le mot de passe admin (P1, S).
2. Chaque `PUT /cocktails/:id` sans `ingredients` efface les ingrédients et les instructions, et rien n'est transactionnel (P1, S).
3. `availabilityService` fait 1 + N(1+M) requêtes. Il utilise aussi une table d'unités en dur qui diverge de la table `Unit` (P1, M).
4. 14 instances de `PrismaClient`, sans WAL ni `busy_timeout` (P1, S).
5. L'import de backup réécrit le fichier SQLite sous des connexions ouvertes, sans validation ni atomicité (P1, M).
6. `onDelete` implicites dangereux : supprimer une bouteille ou un ingrédient met les FK à NULL en silence (P1, S/M).
7. Aucun index sur les FK (P2, S).

---

## 2. Modèle de données

### 2.1 Traductions en JSON string
OK :
- Un `JSON.parse` par entité est négligeable (quelques µs). Le choix est acceptable pour un projet mono-admin.
- `parseNameTranslations` gère l'échec de parse par `null`.

Pas OK :
- **`schema.prisma:26,59,70,19` et `utils/translations.ts:11-17`.** Rien ne valide le JSON à l'écriture. Les routes `JSON.stringify` ce que le client envoie (`bottles.ts:197`, `cocktails.ts:289,308,342`), sans vérifier que c'est un objet `{lang: string}`. Un parse raté en lecture donne `null` sans log, donc la traduction disparaît en silence. Proposition : un helper `serializeTranslations(obj)` / `parseTranslations(str)` partagé, avec validation (objet, valeurs string, langues connues). Effort S, P2.
- **Incohérence avec AGENTS.md** ("Entity names store translations"). `Cocktail.name`, `Bottle.name`, `Menu.name` et `MenuSection.name` n'ont pas de `nameTranslations`. Seuls `Category`, `CategoryType`, `Ingredient` et `Unit` en ont. À documenter, ou à étendre si c'est voulu (P3).
- **Valeur par défaut dupliquée.** `name` et `nameTranslations.en` coexistent sans règle de synchronisation. Les imports apparient par `name` (voir 2.4).
- **Alternative.** Prisma 6.2+ sait, de mémoire, stocker du `Json` sur SQLite. Cela retirerait le `JSON.parse` manuel et la récursion de `parseNameTranslations` (qui doit connaître la liste de clés relationnelles, `translations.ts:19-22` ; une relation oubliée reste en string). À vérifier avant migration. Effort M, P3.
- **`parseNameTranslations` muta l'objet en place.** C'est sûr tant que les objets viennent de Prisma (copies fraîches). Cela casserait avec un cache en mémoire (voir 3.5).

### 2.2 Relation polymorphe `CocktailIngredient`
`schema.prisma:93-110`.
- `sourceType` est une `String` libre, avec 3 FK nullables. Rien n'impose "exactement une FK, celle de `sourceType`". Les routes `POST/PUT /cocktails` (`cocktails.ts:466-486, 515-540`) ne valident rien : `sourceType: 'BOTTLE'` avec `bottleId: null` ou un `unitId` inexistant est accepté. Elles font aussi confiance à `ing.sourceType` du client.
- Conséquence concrète : une ligne `sourceType=BOTTLE, bottleId=NULL` devient "Invalid ingredient configuration" dans `availabilityService.ts:186`, donc indisponible en permanence.
- Cette ligne se produit **réellement** de deux façons :
  - Suppression de bouteille, d'ingrédient ou de catégorie : voir 2.3.
  - Import de cocktail avec bouteille ignorée et catégorie introuvable : `cocktails.ts:364` bascule en `sourceType='INGREDIENT'` avec `ingredientId=null`, donc une ligne invalide qui est quand même écrite.
- Propositions :
  - (a) Une fonction `validateIngredientInput()` partagée par POST, PUT et import, qui vérifie la cohérence `sourceType` / FK et l'existence des cibles. Effort S, P1.
  - (b) Un `CHECK` SQL n'est pas faisable proprement avec `db push`.
  - (c) Un enum Prisma (supporté sur SQLite à partir de Prisma 6.2, à vérifier) ou au minimum une constante TS partagée. Effort S, P3.
- Le modèle polymorphe reste défendable pour 3 types. Une table séparée par source serait sur-dimensionnée.
- **`unitId: unitId || 0`** (`cocktails.ts:379`) : si l'unité n'est pas résolue, l'insertion échoue sur une violation de FK (id 0). La transaction est annulée, ce qui est atomique mais produit un 500 opaque. Il faut valider avant et renvoyer un 400 explicite. Effort S, P2.

### 2.3 `onDelete` et intégrité référentielle
Le défaut de Prisma est `SetNull` pour une relation optionnelle et `Restrict` pour une relation obligatoire. Ici les relations suivantes sont nullables et sans `onDelete` explicite :
- `CocktailIngredient.bottle`, `.category`, `.ingredient` (`schema.prisma:102,104,106`) : supprimer une bouteille, une catégorie ou un ingrédient **met `bottleId`, `categoryId` ou `ingredientId` à NULL en silence** dans toutes les recettes. Les cocktails concernés deviennent "Invalid ingredient configuration", sans avertissement ni blocage. Proposition : vérifier l'usage avant suppression (409 avec la liste des cocktails), ou `onDelete: Restrict` explicite. Effort S/M, P1.
- `Bottle.category` en `onDelete: Cascade` (`schema.prisma:40`) : **supprimer une catégorie supprime toutes ses bouteilles** (et leurs `MenuBottle` en cascade). `routes/categories.ts:113` ne fait aucun contrôle visible. C'est probablement non voulu pour un inventaire. Proposition : `Restrict` plus message "catégorie non vide". Effort S, P1.
- `CocktailPreferredBottle.bottle` est obligatoire, donc `Restrict` implicite : supprimer une bouteille préférée échoue (P2003) alors que supprimer la même bouteille utilisée en ingrédient direct réussit avec SetNull. `bottles.ts:422` renvoie dans les deux cas "cannotDelete". Comportement incohérent. À décider : `Cascade` sur `CocktailPreferredBottle.bottle` (une préférence n'a pas de sens sans la bouteille). Effort S, P2.
- `Category.type` est un `String` sans FK vers `CategoryType.name` (`schema.prisma:27`). L'intégrité est maintenue à la main (`categories.ts:21-23`, seed `:36-46`, imports). Proposition : vraie relation avec `onDelete: Restrict`, ce qui supprime le code de synchronisation. Effort M, P2.

### 2.4 Contraintes d'unicité manquantes
- `Cocktail.name` : pas unique. Le handler P2002 de `cocktails.ts:416` est **du code mort** (jamais déclenché), et l'import peut créer des doublons. La prévisualisation (`cocktails.ts:155`) compare avec `equals`, sensible à la casse en SQLite, donc "Mojito" et "mojito" ne se détectent pas.
- `Unit.abbreviation` : pas unique, alors que l'import (`cocktails.ts:167,350`), le seed (`seed.ts:88` en `findFirst`) et `availabilityService` s'en servent comme clé. Deux unités "cl" rendent l'appariement ambigu. Proposition : `@unique`. Effort S, P2.
- `Category.name` : pas unique, alors que l'import apparie en minuscules (`bottles.ts:178`, `cocktails.ts:238`). Un doublon fait choisir une catégorie au hasard (la dernière écrase dans la `Map`). `@unique` plus comparaison insensible à la casse. Effort S, P2.
- `Ingredient.name @unique` est sensible à la casse en SQLite ("Menthe" et "menthe" coexistent), alors que les imports comparent en minuscules. Ajouter une colonne normalisée ou un `COLLATE NOCASE`. Effort S, P3.
- `CocktailInstruction(cocktailId, stepNumber)` et `CocktailIngredient(cocktailId, position)` : pas de `@@unique`. À ajouter si l'ordre doit rester sans trou. P3.
- Les appariements par nom d'une bouteille (`bottleRefs`, `cocktails.ts:173`) sont fragiles : plusieurs bouteilles physiques peuvent avoir le même nom (le modèle l'autorise).

### 2.5 Index manquants
SQLite **ne crée pas d'index automatiquement sur les colonnes FK**. Aucun `@@index` n'existe dans le schéma. Colonnes concernées :
- `CocktailIngredient.cocktailId` : chaque `include: { ingredients }`, chaque `deleteMany` (`cocktails.ts:512`) et chaque cascade de suppression de cocktail. C'est le plus utile.
- `CocktailIngredient.bottleId`, `.categoryId`, `.ingredientId`, `.unitId` : vérifications FK à la suppression d'une bouteille, d'une catégorie ou d'une unité (scan complet à chaque fois).
- `CocktailPreferredBottle.bottleId`, `CocktailInstruction.cocktailId`, `MenuCocktail.cocktailId`, `MenuBottle.bottleId`, `MenuSection.menuId`, `MenuCocktail.menuSectionId`, `MenuBottle.menuSectionId`.
- `Bottle.categoryId` : `include: { bottles }` de catégorie, filtre `categoryId` de `GET /bottles`, calcul de disponibilité par catégorie.
- `Category.type`, `Bottle.isApero` / `isDigestif` (filtres de `menuBottles.ts:111-114`).

Impact : à l'échelle attendue (quelques centaines de cocktails, quelques milliers de lignes), chaque scan coûte moins d'une milliseconde. Le gain réel est faible aujourd'hui, mais le correctif est gratuit (`@@index` plus `db push`) et évite une dégradation au-delà de 10 000 lignes. Effort S, P2.
Le `position` n'a pas besoin d'index : les tris se font sur de petits sous-ensembles déjà filtrés par FK.

### 2.6 Autres remarques de modèle
- `Cocktail.isAvailable` (flag manuel) coexiste avec la disponibilité calculée (`availabilityService`), qui l'ignore. Deux sources de vérité. Décider laquelle fait foi. P3.
- `Cocktail.tags` en string séparée par des virgules (`cocktails.ts:138` côté public) : un tag contenant une virgule se corrompt, et on ne peut pas filtrer par tag en base. Acceptable à cette échelle. P3.
- `Bottle.purchasePrice` et `CocktailIngredient.quantity` en `Float` : pas de calcul monétaire à l'heure actuelle, donc OK. Stocker des centimes si des totaux apparaissent. P3.
- `remainingPercent Int` : la granularité de 1 % équivaut à 7 ml pour 70 cl. Suffisant pour un bar à la maison.
- `Menu.type` en string libre ("COCKTAILS" / "APEROS" / "DIGESTIFS") : voir 2.2 pour un enum.

---

## 3. Performance

### 3.1 `availabilityService.ts` : N+1 massif (P1, M)
- **`:257-279` `calculateAllCocktailsAvailability`** boucle séquentiellement sur chaque cocktail et appelle `calculateCocktailAvailability` (`:196`), qui fait 1 `findUnique` avec ingrédients et unités. Chaque ingrédient fait ensuite 1 requête (`:88`, `:108`, `:144`) : `ingredient.findUnique`, `bottle.findUnique` avec catégorie, ou `category.findUnique` avec ses bouteilles.
- Nombre de requêtes : 1 + N × (1 + M). Pour N = 100 cocktails et M = 5 ingrédients : environ **601 requêtes**. Au coût de 1 à 3 ms par aller-retour via le moteur Prisma, cela donne 0,6 à 2 s. Pour N = 300 : 2 à 6 s. Ces chiffres sont à mesurer, mais l'ordre de grandeur est certain.
- Les mêmes bouteilles et catégories sont relues des dizaines de fois (une catégorie "Rhum" utilisée dans 40 cocktails est chargée 40 fois).
- Proposition :
  1. Charger en bloc : `cocktail.findMany` avec `ingredients` et `unit`, plus `bottle.findMany`, `category.findMany` avec bouteilles non vides, `ingredient.findMany`. Soit 4 ou 5 requêtes au total.
  2. Indexer en `Map<id, ...>`.
  3. Passer la fonction de calcul en **pure** (entrées : données déjà chargées). `calculateCocktailAvailability(id)` charge alors seulement les données nécessaires. Les deux chemins partagent le même calcul, et les tests unitaires deviennent triviaux et sans base.
  - Gain attendu : de 600 requêtes à 5, soit moins de 50 ms pour N = 300.
- `new PrismaClient()` propre au service (`:3`) : voir 3.4.

### 3.2 Exactitude du calcul de stock (P1, S/M)
- **Table `UNIT_TO_ML` en dur (`:6-22`) au lieu de `Unit.conversionFactorToMl`** (`schema.prisma:72`). Les deux divergent :
  - Unités du seed absentes de la table : `g`, `goutte`, `rondelle`, `pincée`, `brin`, `branche`, `écorce`, `tasse`. Elles tombent dans la branche "unité inconnue" (`:52-56`) et sont traitées **comme des ml** (avec `console.warn` à chaque ingrédient, à chaque appel). Exemple : "1 tasse" (250 ml en base) compte 1 ml ; "2 g" de sucre compte 2 ml ; "1 rondelle" compte 1 ml.
  - Conséquence concrète : un ingrédient `BOTTLE` ou `CATEGORY` avec une de ces unités consomme un volume faux. Les `INGREDIENT` ne sont pas touchés (pas de calcul de volume).
  - Toute unité créée par l'utilisateur est ignorée, y compris son facteur configuré.
  - Le champ `conversionFactorToMl = null` (non convertible) n'est jamais lu. À l'inverse, `cc` vaut 5 ml dans le code mais l'ambiguïté "cc = cm³ = 1 ml" existe dans l'usage courant.
  - Proposition : utiliser `unit.conversionFactorToMl` (déjà chargé via `include: { unit: true }`). `null` donne "non mesurable" (disponible si la bouteille ou catégorie a du stock). Supprimer la table en dur. Effort S.
- **Une même bouteille ou catégorie utilisée dans deux lignes** d'un même cocktail (ex. deux fois le rhum blanc) est évaluée indépendamment, donc `maxServings` est surestimé : 100 ml de stock, 2 lignes de 40 ml, l'algorithme annonce 2 portions pour chacune alors que seule 1 portion complète est possible (80 ml consommés pour 1 portion, 2 portions = 160 ml). Il faut agréger la consommation par ressource avant de diviser. Effort M.
- **`preferredBottles` n'est pas pris en compte** pour les ingrédients `CATEGORY` (`:143-184`). Toute bouteille de la catégorie compte, même si l'utilisateur a désigné des bouteilles préférées. À clarifier côté produit : soit c'est volontaire, soit une régression fonctionnelle. Effort S/M.
- **Flottants** (`:130`, `:171-175`) : `Math.floor(availableMl / requiredMl)` avec des flottants peut donner un résultat inférieur de 1 sur un cas limite (ex. 3 × 0,6 = 1,7999999999999998). Ajouter une tolérance, `Math.floor(x + 1e-9)`. Effort S, P3.
- Les bouteilles avec `capacityMl = 0` (l'import CSV applique 0 par défaut, `bottlesImport.ts:146`) donnent 0 portion mais passent la validation.
- Le seuil "stock faible" `<= 3` (`:233`) est en dur et indépendant de `Category.minimumPercent`. P3.
- Les noms d'ingrédient (`name: bottle.name`, `category.name`) sont ceux de la base, jamais traduits. Les `missingIngredients` renvoyés ne sont donc pas localisés. P3.

### 3.3 Cache / mémoïsation de la disponibilité (P3, M)
Une fois le 3.1 fait (5 requêtes), le calcul ne justifie plus de cache : mono-admin, charge faible. Si malgré tout nécessaire, un compteur de version incrémenté par les routes qui modifient bouteilles, ingrédients, unités et cocktails, avec un résultat mémorisé en mémoire, suffit (mono-process, SQLite). Attention : ne pas muter l'objet mis en cache (voir 2.1). Ne pas le faire avant d'avoir mesuré.

### 3.4 Instances multiples de `PrismaClient` (P1, S)
- 14 instances : `new PrismaClient()` dans chaque route (`routes/*.ts` : auth, bottles, categories, categoryTypes, cocktails, ingredients, menuBottles, menuSections, menus, public, settings, shortages, units) et `services/availabilityService.ts:3`.
- Chaque instance ouvre son propre pool (par défaut `num_cpus*2+1` connexions) sur le **même fichier SQLite**. SQLite n'autorise qu'un écrivain à la fois : plusieurs clients concurrents provoquent des `SQLITE_BUSY` ("database is locked") ou des timeouts Prisma sous écriture simultanée (import, sync de menus). De plus, rien n'est déconnecté à l'arrêt.
- Proposition : un module `src/lib/prisma.ts` exportant un singleton, importé partout. Ajouter `?connection_limit=1&socket_timeout=...` (ou au moins `busy_timeout`) et activer `PRAGMA journal_mode=WAL` au démarrage (`$queryRawUnsafe`), ce qui améliore la lecture concurrente pendant les écritures. Attention : WAL ajoute des fichiers `-wal` et `-shm` qu'il faut gérer dans le backup (voir 4.1). Effort S.

### 3.5 Routes : requêtes en boucle et includes
- **`bottles.ts:240-262` (import confirm)** : `tx.bottle.create` un par un dans une double boucle (lignes × quantité). Le nombre de lignes n'est pas plafonné (seulement 10 Mo de fichier, soit 100 000+ lignes CSV, chacune pouvant valoir 50 bouteilles). Une transaction interactive Prisma expire par défaut à **5 s** : un import volumineux échoue en bloc (rollback correct mais 500 opaque). Proposition : plafonner le nombre de lignes (ex. 2 000) et la quantité totale, utiliser `createMany` (supporté sur SQLite depuis Prisma 5.12) par lot, passer `{ timeout }` à `$transaction`. Effort S/M, P2.
- **`bottles.ts:269-273`** : la synchronisation des menus se fait **après** la transaction, bouteille par bouteille (`syncBottleMenus`). Chaque appel fait jusqu'à 7 requêtes (`:20-76`), soit environ 7 × B requêtes. Pas atomique non plus : un échec laisse des bouteilles créées sans entrée de menu. Proposition : après l'import, appeler une synchronisation en bloc (même logique que `menuBottles.ts:95-174`), idéalement dans la transaction. Effort M, P2.
- **`bottles.ts:371-375` (POST avec `quantity` jusqu'à 50)** : 50 `create` plus 50 `syncBottleMenus`, hors transaction (50 × environ 8 requêtes = 400). Un échec au milieu laisse un lot partiel. Un `$transaction` plus une synchro unique suffisent. Effort S, P2.
- **`bottles.ts:130-146` (preview)** : pour chaque ligne importée, `allBottles.filter(...)` avec `toLowerCase()` répété, soit O(P × B). Pour P = B = 10 000, cela représente 10^8 comparaisons et plusieurs secondes. Proposition : index `Map` par clé `nom|capacité|catégorie`, comme déjà fait pour `existingKeys` (`:211-216`). Effort S, P2. Ne pose aucun souci sous 500 lignes.
- **`cocktails.ts:226-229` et `:237`** : `findMany` complets (`unit`, `category`, `bottle`, `ingredient`) suivis de `find` linéaires par référence. Acceptable : les listes sont petites (O(R × N) avec R inférieur à 30 et N inférieur à 1 000). Ne pas optimiser.
- **`GET /cocktails` (`cocktails.ts:427`)** : charge tous les cocktails avec `cocktailIncludes` (ingrédients, unité, bouteille avec catégorie, catégorie, ingrédient, bouteilles préférées avec bouteille) et instructions, sans pagination. Prisma exécute environ 8 requêtes. Pour 200 cocktails × 5 ingrédients = 1 000 lignes jointes, quelques dizaines de ms et un JSON de plusieurs centaines de Ko. Acceptable. À surveiller si l'écran liste n'a besoin que du nom et des tags (`select` allégé). P3.
- **`categoryTypes.ts:16-23`** : charge toutes les catégories pour compter. Remplacer par `groupBy` ou `_count`. Gain négligeable, mais trivial. P3.
- **`shortages.ts:11-15`** : `include: { bottles: true }` charge toutes les colonnes de toutes les bouteilles pour sommer `remainingPercent`. Un `select` restreint ou un `groupBy` suffirait. Négligeable à cette échelle. P3.
- **`menus.ts:99-121` (PUT)** : voir 4.3 (non transactionnel).
- **`public.ts:33-65`** : bon usage d'un `include` imbriqué unique, mais voir 5. Pas de cache alors que c'est l'endpoint public le plus sollicité : un `Cache-Control: public, max-age=30` ou un ETag donne l'essentiel du gain pour zéro risque. Effort S, P3.
- **`public.ts:44, 214-217`** : `include: { bottle: true }` et `category: true` renvoient **toutes** les colonnes, y compris `purchasePrice` et `location` de `Bottle`, à un endpoint sans authentification (voir 5).

### 3.6 Seed (`prisma/seed.ts`)
OK : `upsert` idempotent, exécuté une fois au démarrage, durée négligeable (19 unités en séquence, environ 40 requêtes). Pas de point de perf.

---

## 4. Import / export / backup : robustesse et atomicité

### 4.1 `routes/backup.ts` (P1)
- **`:116-122` Réécriture du fichier SQLite pendant que Prisma est connecté.** `fs.writeFileSync(dbPath, ...)` remplace le contenu sous des connexions ouvertes (14 clients, voir 3.4), puis supprime `-wal` et `-journal`. Les connexions déjà ouvertes gardent des pages en cache et des descripteurs vers l'ancien contenu : lectures incohérentes, risque de corruption si une écriture arrive pendant l'opération. Aucune déconnexion, aucun redémarrage. Proposition : écrire dans un fichier temporaire puis `fs.renameSync` (atomique sur le même volume), déconnecter le client Prisma (singleton, cf. 3.4) avant et reconnecter après, ou demander un redémarrage du process (ce que fait déjà Docker `restart`). Effort M.
- **Aucune validation du contenu de `database.db`.** Seuls `metadata.json` et la présence du fichier sont vérifiés (`:86-105`). Un fichier quelconque nommé `database.db` écrase la base. Minimum : vérifier l'en-tête `SQLite format 3\0` (16 premiers octets), idéalement ouvrir la base copiée et contrôler `PRAGMA integrity_check` et la présence des tables attendues. Effort S/M.
- **Pas de sauvegarde de l'existant avant écrasement.** Un restore raté ou erroné est irréversible. Copier l'ancienne base en `.bak` avant. Effort S.
- **Ordre non atomique** : base écrasée (`:116`), uploads vidés (`:124-132`), uploads extraits (`:134-142`). Un échec à l'étape 3 laisse une base restaurée avec des images manquantes. Le fichier `uploadsDir` est vidé avec `unlinkSync` sur chaque entrée : une **sous-dossier fait lever une exception** (EISDIR/EPERM). Proposition : extraire dans un dossier temporaire, valider, puis basculer par renommage. Effort M.
- **Version de schéma absente.** `metadata.version === 1` ne décrit que le format du zip, pas le schéma Prisma. L'application utilise `prisma db push` (pas de migrations). Une sauvegarde d'un schéma plus ancien ou plus récent est acceptée et provoque ensuite des erreurs d'exécution. Ajouter un identifiant de schéma (hash de `schema.prisma` ou version de migration) dans `metadata.json` et le comparer. `appVersion: '1.0.0'` (`:53`) est codé en dur. Effort S/M.
- **`:12-15` mémoire** : `multer.memoryStorage()` avec 500 Mo, puis `new AdmZip(buffer)` et `getData()` qui décompresse chaque entrée en mémoire. Pic possible de 1 Go et plus pour un upload de 500 Mo, dans un conteneur sans limite mémoire déclarée. Pas de limite sur la taille décompressée (zip bomb). Proposition : `diskStorage`, limiter la taille décompressée par entrée (`entry.header.size`), abaisser la limite de 500 Mo. Effort M, P2.
- **Export `:58` : copie d'un fichier SQLite en cours d'utilisation.** `archive.file(dbPath)` lit le fichier pendant que le serveur peut écrire, donc le snapshot peut être incohérent (surtout avec un mode WAL, où des pages récentes sont encore dans le `-wal`). Proposition : générer un instantané cohérent avec `VACUUM INTO '/tmp/snap.db'` (SQLite 3.27+) ou l'API de backup, puis archiver ce fichier. Effort S/M, P1 si WAL activé (3.4).
- **Export `:35-36` en-têtes envoyés avant la création de l'archive.** Si l'erreur survient en cours de flux, le `res.status(500).json` est ignoré (headersSent), et le client reçoit un zip tronqué qu'il peut croire valide. Il faut détruire la réponse (`res.destroy()`) dans le handler d'erreur de l'archive. Effort S.
- **`getDatabasePath` (`:17-21`) ne résout pas comme Prisma.** Pour un `DATABASE_URL="file:./carta_cocktail.db"` (`.env.example:2`, `backend/.env:1`), Prisma interprète le chemin relatif **par rapport au dossier du `schema.prisma`** (`backend/prisma/`), alors que `getDatabasePath` renvoie `./carta_cocktail.db` relatif au `cwd` (`backend/`). En développement local, l'export répond donc "Database file not found" (ou, pire, lit un autre fichier). Ça marche dans Docker (chemin absolu, `docker-compose.yml:9`). Il faut aussi retirer les paramètres de requête (`?connection_limit=1`). Effort S.
- **Zip slip** : correctement évité (`path.basename`). Mais cela aplatit l'arborescence et deux fichiers de même nom dans des sous-dossiers s'écrasent. Faible risque.
- OK : l'ordre `metadata` puis `database` dans le zip est bon ; le niveau de compression 6 est un bon compromis ; la restauration supprime bien `-wal` et `-journal`.

### 4.2 Import / export de bouteilles (`utils/bottles{Import,Export}.ts`, `routes/bottles.ts`)
OK :
- Parseur CSV correct (guillemets doublés, retours ligne dans les champs, CRLF).
- Aller-retour JSON cohérent, version contrôlée, plafond de `quantity` à 50.
- Détection de doublons non bloquante. Transaction pour la création des catégories et des bouteilles.

Problèmes :
- **BOM UTF-8 non géré** (`bottlesImport.ts:107`, `:209`). Un CSV enregistré depuis Excel commence par `﻿`, donc l'en-tête devient `﻿name` et `idx('name') === -1` produit "CSV missing required column: name". Proposition : `csv.replace(/^﻿/, '')` en entrée, et ajouter le BOM à l'export si destiné à Excel. Effort S, P2.
- **Séparateur `;` non supporté.** Excel en locale française exporte en point-virgule. Détecter le séparateur sur la ligne d'en-tête. Effort S, P3.
- **Validation absente des valeurs** : `capacityMl` vaut 0 par défaut en CSV (`:146`) et n'est pas contrôlé en JSON (`:188`) ; `remainingPercent` n'est pas borné à 0-100 (`:147`, `:189`) ; `desiredStock` et `minimumPercent` peuvent être négatifs ; `openedAt` invalide donne `new Date('abc')` (`bottles.ts:250`), donc une `Invalid Date` fait échouer **toute** la transaction par un 500 (rollback, mais sans message utile). Proposition : valider dans `parse*Bottles` (rejeter la ligne avec un rapport d'erreurs par ligne dans la preview). Effort S/M, P2.
- **Perte d'information CSV** : l'import CSV fixe `desiredStock = 1` et `minimumPercent = 30` pour toute catégorie créée (`:137-138`), et l'export CSV n'écrit pas ces colonnes. Seul le JSON (ou `categories.csv` dans un ZIP) conserve ces paramètres. Documenter, ou ajouter les colonnes. P3.
- **Injection de formule CSV** (`escapeCsvField`, `bottlesExport.ts:124-131`) : un nom ou un lieu commençant par `=`, `+`, `-` ou `@` s'exécute dans Excel. Risque faible (auto-saisie par un admin unique), mais le correctif est une ligne (préfixer par `'`, avec une exception pour les nombres négatifs). P3.
- **`parseZipBottles`** (`:238-268`) : `getData()` sans limite de taille décompressée (zip bomb sur 10 Mo compressés). Limiter. Effort S, P3.
- **Appariement des catégories par nom en minuscules** : voir 2.4.
- **Aucune limite sur le nombre de lignes** : voir 3.5.

### 4.3 Import de cocktail et écritures composées
- **Bug majeur : `PUT /cocktails/:id` (`cocktails.ts:511-513`) supprime ingrédients et instructions inconditionnellement**, avant de savoir si le body contient `ingredients` / `instructions` (`:523`, `:539` utilisent `ingredients ? ... : undefined`). Une requête `PUT {name: "X"}` **vide la recette**. De plus, la suppression et la mise à jour ne sont pas dans une transaction : si `update` échoue (FK invalide, `unitId` inconnu), la recette est **définitivement vidée**. Proposition : une seule `prisma.$transaction`, ou mieux une opération imbriquée (`ingredients: { deleteMany: {}, create: [...] }`) exécutée seulement si le champ est fourni. Effort S, **P1**.
- **`PUT /menus/:id` (`menus.ts:99-121`)** : `deleteMany` suivi de `createMany`, hors transaction. Un échec au milieu laisse le menu vide. Surtout, la recréation **perd `menuSectionId`** : seuls `menuId`, `cocktailId`, `position` et `isHidden` sont réécrits, donc toutes les affectations de section sont remises à NULL à chaque sauvegarde de menu qui envoie la liste. Effort S/M, P1. Même remarque pour `bottles`.
- **Import de cocktail (`cocktails.ts:280-411`)** : bon usage d'une transaction. Défauts :
  - Mass-assignment : `tx.bottle.create({ data: { ...bottleData, categoryId } })` (`:327`), `tx.unit.create({ data: { ...rest } })` (`:289`), `tx.category.create`, `tx.ingredient.create` épandent les champs du client sans liste blanche (champ inconnu : 500 ; champ valide inattendu : accepté). Définir les champs explicitement. P2.
  - Ligne d'ingrédient invalide possible (voir 2.2 : `INGREDIENT` avec `ingredientId = null`, `unitId = 0`).
  - Même comportement pour la `preview` : appariement uniquement par nom (`bottleRefs` clé = nom en minuscules), sans tenir compte de la catégorie.
- **Export public (`public.ts:106-192`)** : le slug du nom de fichier (`:185`) retire les accents ("Piña Colada" donne `pi-a-colada`), et un nom 100 % non latin donne `cocktail-.json`. Faible importance. Les `tags` sont découpés sur la virgule. L'export ne contient pas `imagePath`. Attention : la structure d'export est dupliquée entre la route admin (non lue ici) et `public.ts`. Le commentaire `:130` le reconnaît. À factoriser dans `utils/`. P3.

---

## 5. Points sensibles relevés en passant (hors périmètre, à transmettre aux autres revues)
- **`Dockerfile:18`** : `CMD ... npx prisma db push --accept-data-loss && npm run db:seed && npm start`. Deux problèmes :
  - **`seed.ts:9-15` réécrit le mot de passe admin à chaque démarrage** avec `ADMIN_PASSWORD || 'admin123'`. Tout changement de mot de passe fait par l'UI (`routes/settings.ts:78`) est annulé au prochain redémarrage du conteneur, et le mot de passe retombe sur `admin123` si la variable n'est pas définie. Proposition : ne créer l'admin que s'il n'existe pas (ou seulement si `ADMIN_PASSWORD` est explicitement défini), et refuser le défaut en production. Effort S, **P1**.
  - `db push --accept-data-loss` à chaque démarrage supprime sans demande les colonnes ou tables retirées du schéma, donc une modification de schéma peut détruire des données. Passer à `prisma migrate deploy` avec des migrations versionnées. Effort M, P1/P2.
- **`public.ts:72-74`** : `isAdmin = !!token`. N'importe quelle valeur dans l'en-tête `Authorization` donne accès aux menus non publics. Le JWT n'est pas vérifié. (Sécurité, P1, S.)
- **`public.ts:206-230` et `:106`** : `GET /public/cocktails/:id` et son export sont accessibles pour **n'importe quel** cocktail par id, y compris ceux qui ne sont dans aucun menu public. Les `include` renvoient tous les champs des bouteilles. Les éléments `isHidden` des menus sont aussi renvoyés par `public.ts:39-52` (filtrage supposé côté frontend, à confirmer). (Sécurité et confidentialité, P2.)
- `app.ts:31` : `express.json()` sans limite explicite (défaut 100 Ko), mais les imports JSON passent par le body : `/cocktails/import/confirm` est limité à 100 Ko, ce qui est à vérifier avec de grosses recettes. Info seulement.

---

## 6. Plan d'action priorisé

| # | Action | Fichier:ligne | Prio | Effort |
|---|--------|---------------|------|--------|
| 1 | Seed : ne pas réécrire le mot de passe admin à chaque démarrage | `seed.ts:9-20`, `Dockerfile:18` | P1 | S |
| 2 | `PUT /cocktails/:id` : ne vider ingrédients et instructions que si fournis, dans une transaction | `cocktails.ts:511-549` | P1 | S |
| 3 | `PUT /menus/:id` : transaction, conserver `menuSectionId` | `menus.ts:99-121` | P1 | S/M |
| 4 | Singleton `PrismaClient` plus WAL et `busy_timeout` | 14 fichiers | P1 | S |
| 5 | `availabilityService` : chargement en bloc, calcul pur, utiliser `Unit.conversionFactorToMl`, agréger par ressource | `availabilityService.ts:6-282` | P1 | M |
| 6 | Backup import : validation SQLite, copie `.bak`, renommage atomique, déconnexion Prisma ; export via `VACUUM INTO` | `backup.ts:17-142` | P1 | M |
| 7 | `onDelete` explicites : `Restrict` (avec 409 listant les cocktails) pour `CocktailIngredient.bottle/category/ingredient`, ne plus cascader `Bottle.category` | `schema.prisma:40,102,104,106,117` | P1 | S/M |
| 8 | Validation partagée des lignes d'ingrédient (sourceType et FK cohérents, cibles existantes) | `cocktails.ts:466,515,348-389` | P1 | S |
| 9 | Remplacer `db push --accept-data-loss` par des migrations | `Dockerfile:18` | P1/P2 | M |
| 10 | `@@index` sur les FK et colonnes filtrées | `schema.prisma` | P2 | S |
| 11 | `@unique` sur `Unit.abbreviation`, `Category.name`, `Cocktail.name` (ou retirer le handler P2002 mort) | `schema.prisma`, `cocktails.ts:416` | P2 | S |
| 12 | Import bouteilles : BOM, validation des valeurs, plafond de lignes, `createMany`, timeout de transaction, synchro des menus en bloc | `bottlesImport.ts`, `bottles.ts:173-273` | P2 | M |
| 13 | `POST /bottles` avec `quantity` en transaction | `bottles.ts:371-375` | P2 | S |
| 14 | Preview bouteilles : `Map` à la place de `filter` dans `map` | `bottles.ts:130-146` | P2 | S |
| 15 | Backup : stockage disque, limite de taille décompressée, résolution du chemin relatif comme Prisma | `backup.ts:12-21` | P2 | S/M |
| 16 | Helper de traductions avec validation à l'écriture | `translations.ts`, routes | P2 | S |
| 17 | `Category.type` en vraie FK vers `CategoryType` | `schema.prisma:27` | P2 | M |
| 18 | Cache HTTP court sur `/public/menus/:slug` ; `select` restreint pour ne pas exposer `purchasePrice` / `location` | `public.ts:33-65` | P3 | S |
| 19 | Allègements mineurs (`groupBy` dans categoryTypes, `select` dans shortages) | `categoryTypes.ts:16`, `shortages.ts:11` | P3 | S |

## 7. Plan de mesure (avant d'optimiser au-delà du point 5)
- Banc : base de test avec 300 cocktails × 6 ingrédients, 200 bouteilles. Mesurer `GET /api/availability/cocktails` avant et après le point 5 (cible : moins de 100 ms contre 1 à 6 s estimé).
- Outil : `PRISMA_LOG` / `log: ['query']` pour compter les requêtes, `autocannon` ou `hyperfine` sur l'endpoint, `EXPLAIN QUERY PLAN` sur `SELECT ... FROM CocktailIngredient WHERE cocktailId IN (...)` avant et après les index (point 10).
- Métriques : nombre de requêtes par appel, p95 de latence, `SQLITE_BUSY` / "Timed out" dans les logs pendant un import concurrent à une lecture.
