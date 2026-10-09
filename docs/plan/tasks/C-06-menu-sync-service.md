---
id: C-06
title: "Synchronisation des menus apéritifs/digestifs : une seule implémentation"
phase: C
lane: backend
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [C-03, C-01]
touches: [backend/src/services/menuSyncService.ts, backend/src/routes/bottles.ts, backend/src/routes/menuBottles.ts, backend/src/routes/menus.ts, backend/src/i18n/, backend/prisma/schema.prisma, backend/prisma/migrations/]
sources: ["01-backend-routes.md §H3", "02-backend-data-perf.md §3.5"]
branch:
pr:
---

## Décisions validées (2026-10-09)

- **Cartes de bouteilles.** Les cases `isApero` / `isDigestif` d'une bouteille veulent dire « disponible pour les cartes de ce type ». Les deux cartes système « Apéritifs » et « Digestifs » restent non supprimables (renommables et dépubliables) et contiennent automatiquement toutes les bouteilles cochées pour leur type, sauf celles que l'admin en a retirées. L'utilisateur peut créer ses propres cartes `APEROS` ou `DIGESTIFS` (ex. « Apéro d'été ») : supprimables, composées à la main parmi les bouteilles cochées pour ce type. Décocher une bouteille la retire de toutes les cartes de ce type, système et personnelles. Les types `APEROS` et `DIGESTIFS` restent séparés.
- **Retrait d'une carte système : liste d'exclusions.** Retirer une bouteille d'une carte système l'exclut de cette carte seulement. Elle reste cochée, donc présente dans l'autre carte système si elle est cochée pour ce type, et disponible pour les cartes personnelles. La synchro ne la remet jamais, même si on la décoche puis la recoche. L'éditeur admin liste les bouteilles exclues et permet de les remettre. Supprimer la bouteille ou la carte supprime l'exclusion.
- **Type figé.** Le type d'une carte non système ne change plus après sa création.
- **Bouteilles vides.** Une bouteille cochée qui devient vide reste dans ses cartes, à sa place, avec sa section et son état masqué. Elle n'est pas affichée sur la carte publique. Si elle ne revient jamais en stock, l'admin la retire à la main (exclusion pour une carte système, retrait simple pour une carte personnelle).
- L'écran de création des cartes personnelles est hors périmètre : voir F-08. La section « bouteilles retirées » de l'éditeur est dans E-07.

## Contexte

Les menus « Apéritifs » et « Digestifs » reflètent les bouteilles marquées `isApero`/`isDigestif`. Trois morceaux de code tiennent ce lien avec des règles différentes : le résultat dépend du chemin (création, édition, import, bouton « Synchroniser »). Une bouteille vide peut réapparaître, une bouteille rechargée perd sa place et sa section. L'application sert aussi de carte de boissons servies telles quelles : l'utilisateur doit pouvoir composer d'autres cartes de bouteilles que les deux cartes système, et retirer d'une carte système une bouteille qu'il ne veut pas y voir.

## Problème constaté

- `routes/bottles.ts:18-78` `syncBottleMenus` : menus trouvés **par slug** (`:24-25`), bouteilles vides **exclues** (`:21`, `:33`, `:59`), deux blocs copiés-collés (apéro `:28-51`, digestif `:54-77`), max+1 lu puis `create` hors transaction.
- `routes/menuBottles.ts:95-174` (`POST /menu/:menuId/sync`) : menus trouvés **par type** (`:111-114`), vides **non exclues** (`:121`) : le bouton « Synchroniser » réinsère les bouteilles vides retirées par l'auto-sync.
- `routes/bottles.ts:405` : la synchro ne part que si `isApero` ou `isDigestif` est dans le body. `PUT { remainingPercent: 0 }` seul laisse la bouteille dans le menu. L'UI envoie toujours les flags : défaut latent.
- `routes/bottles.ts:47-49` : une bouteille vidée est **supprimée** du menu ; rechargée, elle revient en fin de liste, sans section ni `isHidden`.
- `routes/bottles.ts:269-273` (import) : synchro après la transaction, bouteille par bouteille (jusqu'à 7 requêtes chacune), non atomique.
- `routes/bottles.ts:365-377` : POST et synchro hors transaction.
- `routes/menus.ts:112-121` : `PUT /menus/:id` peut remplacer les bouteilles d'un menu système.
- `routes/menus.ts` (après A-02) : `POST /menus` accepte `type: 'APEROS'`/`'DIGESTIFS'`, et `PUT /menus/:id` peut donner ce type à un menu ordinaire. A-02 ne verrouille le type que des menus système, reconnus par leur slug (`SYSTEM_MENU_SLUGS`, `isSystemMenu`), comme la protection contre la suppression.
- `routes/menuBottles.ts:28-58` (`POST /menu-bottles`) : accepte n'importe quelle bouteille dans n'importe quel menu, sans regarder le type du menu ni les cases de la bouteille.
- `routes/menuBottles.ts:84-93` (`DELETE /menu-bottles/:id`) : sur une carte système, la ligne supprimée revient à la synchro suivante. Rien ne mémorise un retrait voulu.
- Utile : `routes/public.ts:53-56` filtre déjà `bottle.remainingPercent > 0` à l'affichage public.

## Ce qu'il faut faire

1. **Règle d'appartenance.**
   - Une bouteille est *disponible* pour le type `APEROS` (resp. `DIGESTIFS`) si et seulement si `isApero` (resp. `isDigestif`) est vrai, **vide ou non** (décision « bouteilles vides »). Les vides sont masquées à l'affichage public (déjà fait par `public.ts:55`). Position, section et `isHidden` survivent donc à un vidage puis un rechargement.
   - Une bouteille appartient à une **carte système** si elle est disponible pour son type **et** n'est pas exclue de cette carte.
   - Une **carte personnelle** ne contient que des bouteilles disponibles pour son type, ajoutées à la main.
2. **Schéma** (migration Prisma, après C-01) : table d'exclusions.
   ```prisma
   model MenuBottleExclusion {
     menuId    Int
     bottleId  Int
     createdAt DateTime @default(now())
     menu      Menu     @relation(fields: [menuId], references: [id], onDelete: Cascade)
     bottle    Bottle   @relation(fields: [bottleId], references: [id], onDelete: Cascade)
     @@id([menuId, bottleId])
   }

   // relations inverses exigées par Prisma
   model Menu   { /* … */ bottleExclusions MenuBottleExclusion[] }
   model Bottle { /* … */ menuExclusions   MenuBottleExclusion[] }
   ```
   Pourquoi une table plutôt qu'un champ `isExcluded` sur `MenuBottle` : la synchro lit directement l'ensemble des exclusions d'une carte ; `MenuBottle` ne contient que des bouteilles affichées dans la carte, donc la carte publique, l'éditeur, les comptages et C-13 (`reorder`) n'ont aucun filtre à ajouter ; une exclusion survit au décochage (la ligne `MenuBottle` est supprimée, l'exclusion reste) ; `onDelete: Cascade` supprime l'exclusion avec la bouteille ou la carte. Migration générée par `npm run db:migrate -- --name menu_bottle_exclusion`.
3. `src/services/menuSyncService.ts` :
   ```ts
   type Db = Prisma.TransactionClient | PrismaClient;
   export const BOTTLE_MENU_FLAG = { APEROS: 'isApero', DIGESTIFS: 'isDigestif' } as const;
   export type BottleMenuType = keyof typeof BOTTLE_MENU_FLAG;
   export const SYSTEM_MENU_SLUGS: Record<BottleMenuType, string> = { APEROS: 'aperitifs', DIGESTIFS: 'digestifs' };

   export function isSystemMenu(menu: { slug: string }): boolean;                    // seul critère d'identification
   export function isAvailableFor(bottle: { isApero: boolean; isDigestif: boolean }, type: BottleMenuType): boolean;
   export function isEligible(bottle: { id: number; isApero: boolean; isDigestif: boolean }, type: BottleMenuType, excludedIds: ReadonlySet<number>): boolean;
   export async function assertBottlesAllowed(db: Db, menu: { type: string }, bottleIds: number[]): Promise<void>;
   export async function syncMenu(db: Db, menuId: number): Promise<{ added: number; removed: number }>;
   export async function syncBottle(db: Db, bottleId: number): Promise<void>;
   export async function syncAllBottleMenus(db: Db): Promise<void>;                // pour l'import
   export async function excludeBottles(db: Db, menuId: number, bottleIds: number[]): Promise<void>;
   export async function restoreBottle(db: Db, menuId: number, bottleId: number): Promise<void>;
   ```
   - **Un seul helper identifie les cartes système** : `isSystemMenu`, par slug (A-02 empêche de changer le slug et le type des menus système). Déplacer ici `SYSTEM_MENU_SLUGS` et `isSystemMenu` de `routes/menus.ts` ; `menus.ts` les importe. Le type seul ne suffit plus, puisque des cartes personnelles partagent ce type.
   - `isAvailableFor` porte la règle des cases (étape 1, premier point) ; elle ne regarde plus `remainingPercent`. `isEligible` (cartes système) = `isAvailableFor` **et** bouteille absente de `excludedIds`. Ce sont les deux seuls endroits qui portent la règle.
   - `assertBottlesAllowed` lève `BadRequestError('errors.bottleNotAllowedInMenu')` si le menu n'est pas de type bouteille ou si une bouteille n'est pas disponible pour ce type.
   - `syncMenu` (carte système uniquement) lit les exclusions de la carte, puis reprend l'algorithme ensembliste de `menuBottles.ts:121-163` (`Set`, `createMany`, `deleteMany`) avec `isEligible` : ajoute en fin de liste les bouteilles éligibles absentes, retire les autres. Une bouteille exclue n'est jamais ajoutée.
   - `syncBottle` : pour chaque type bouteille, si la bouteille est disponible, l'ajoute en position max+1 à la carte système du type quand elle n'y est pas et n'en est pas exclue (les cartes personnelles ne sont jamais remplies automatiquement) ; sinon, la retire de **toutes** les cartes du type, système et personnelles. Les exclusions ne sont jamais supprimées ici : décochée puis recochée, une bouteille exclue reste exclue.
   - `syncAllBottleMenus` : `syncMenu` sur les deux cartes système, puis retrait des bouteilles non disponibles des cartes personnelles.
   - `excludeBottles` (carte système) : pour chaque bouteille, supprime la ligne `MenuBottle` et crée l'exclusion `(menuId, bottleId)`. L'appelant l'exécute dans une transaction : tout le lot passe ou rien.
   - `restoreBottle` : supprime l'exclusion ; si la bouteille est disponible pour le type, l'ajoute en fin de liste (position max+1, sans section, visible).
4. `routes/bottles.ts` :
   - supprimer `syncBottleMenus` ;
   - POST : `prisma.$transaction(async (tx) => { …create…; await syncBottle(tx, id); })`. La boucle `quantity` reste, mais dans la transaction (C-10 la passe en lot) ;
   - PUT : même transaction, `syncBottle` **toujours** appelé ;
   - import confirm : remplacer la boucle `:269-273` par `await syncAllBottleMenus(tx)` **dans** la transaction.
5. `routes/menuBottles.ts` :
   - `/menu/:menuId/sync` : `NotFoundError` si le menu n'existe pas ; `BadRequestError('errors.cannotSyncCocktailMenu')` si `type === 'COCKTAILS'` (remplace le texte en dur `:116`) ; `BadRequestError('errors.cannotSyncPersonalMenu')` si le menu n'est pas une carte système ; sinon `syncMenu` en transaction. Réponse inchangée `{ message, added, removed }`.
   - `POST /menu-bottles` : `assertBottlesAllowed` avant la création (400 si la bouteille n'est pas cochée pour le type de la carte, ou si la carte est de type `COCKTAILS`) ; 400 `errors.systemMenuBottlesManaged` sur une carte système (une bouteille exclue revient par « remettre », pas par un ajout).
   - `DELETE /menu-bottles/:id` : sur une carte système, `excludeBottles(menuId, [bottleId])` en transaction ; sur une carte personnelle, suppression simple comme aujourd'hui.
   - `POST /menu-bottles/menu/:menuId/exclusions { bottleIds }` : exclusion en lot (un groupe de bouteilles dans l'éditeur, E-07), `excludeBottles` dans une seule transaction. 400 si la carte n'est pas une carte système ou si `bottleIds` est vide ; une bouteille absente de la carte ou déjà exclue est ignorée.
   - `GET /menu-bottles/menu/:menuId/exclusions` : bouteilles exclues de la carte (avec `bottle` et `category`, comme `GET /menu/:menuId`), triées par nom. Liste vide pour une carte personnelle.
   - `DELETE /menu-bottles/menu/:menuId/exclusions/:bottleId` : `restoreBottle` en transaction ; 404 si l'exclusion n'existe pas.
6. `routes/menus.ts` PUT :
   - `bottles` sur une carte système : `BadRequestError('errors.systemMenuBottlesManaged')`. Vérifier que le frontend ne l'envoie pas (`MenuBottleEditPage` passe par `/menu-bottles`) ;
   - `bottles` sur une carte personnelle : `assertBottlesAllowed` dans la transaction, avant l'écriture.
7. **Cartes `APEROS`/`DIGESTIFS` non système.**
   - La synchronisation automatique ne s'applique qu'aux deux cartes système, reconnues par `isSystemMenu`.
   - `POST /menus` et `PUT /menus/:id` acceptent les types `APEROS` et `DIGESTIFS` pour une carte non système. Ces cartes ne sont jamais remplies automatiquement et restent supprimables.
   - Seules les bouteilles cochées pour le type peuvent y être ajoutées (400 sinon, via `assertBottlesAllowed`).
   - Décocher une bouteille la retire de toutes les cartes du type (`syncBottle`).
   - Type figé (décision validée) : le type d'une carte non système n'est plus modifiable après sa création (400 `errors.menuTypeImmutable` ; renvoyer le type courant reste accepté, comme pour A-02). Passer de `COCKTAILS` à `APEROS` laisserait des cocktails dans une carte de bouteilles, et passer d'`APEROS` à `DIGESTIFS` des bouteilles non cochées pour le nouveau type.
8. Ajouter les clés i18n utilisées dans `en.json` et `fr.json`.

## Critères d'acceptation

- [ ] `syncBottleMenus` n'existe plus ; toute synchro passe par `menuSyncService`.
- [ ] `isSystemMenu` n'est défini qu'à un endroit (`menuSyncService.ts`) et `menus.ts` l'importe.
- [ ] La migration `menu_bottle_exclusion` est versionnée ; `npm run db:check` passe.
- [ ] POST, PUT, import et `/sync` donnent le même résultat pour une même bouteille.
- [ ] `PUT /bottles/:id { remainingPercent: 0 }` sans flags laisse la bouteille dans ses cartes.
- [ ] Une bouteille vidée puis rechargée garde position, section et `isHidden`, dans les cartes système comme personnelles.
- [ ] Une erreur pendant la synchro annule aussi la création ou la modification de la bouteille.
- [ ] Le menu public n'affiche jamais une bouteille vide.
- [ ] Une bouteille retirée de la carte « Apéritifs » n'y revient ni à la synchro, ni après décochage puis recochage ; elle reste dans « Digestifs » si elle y était, et reste disponible pour les cartes personnelles.
- [ ] Remettre une bouteille exclue la replace en fin de liste de la carte système.
- [ ] L'exclusion en lot (`POST .../exclusions`) est atomique : une erreur n'exclut aucune bouteille du lot.
- [ ] Supprimer une bouteille ou une carte supprime ses exclusions.
- [ ] Une carte personnelle `APEROS` peut être créée, n'est jamais remplie automatiquement, accepte une bouteille `isApero`, refuse (400) une bouteille non cochée et peut être supprimée.
- [ ] Décocher `isApero` retire la bouteille de la carte système et de toutes les cartes personnelles `APEROS`, sans toucher aux cartes `DIGESTIFS`.
- [ ] Les cartes système restent non supprimables ; leur composition ne se modifie ni par `PUT /menus/:id`, ni par `POST /menu-bottles` ; `DELETE /menu-bottles/:id` y crée une exclusion.
- [ ] Le type d'une carte non système ne change plus après sa création.

## Tests à ajouter ou adapter

- `src/services/menuSyncService.test.ts` :
  - `isAvailableFor` : table de vérité flag × vide × type (le vide ne change rien) ;
  - `isEligible` : disponible et non exclue → vrai ; exclue → faux ; non disponible → faux ;
  - `isSystemMenu` : `aperitifs`, `digestifs`, un autre slug ;
  - `syncMenu` : ajoute les éligibles en fin de liste, retire les autres, ignore les exclues, idempotent (2e appel `{ added: 0, removed: 0 }`) ;
  - `syncBottle` : bouteille cochée ajoutée à la carte système seulement, pas à une carte personnelle du même type ; bouteille décochée retirée de la carte système et de la carte personnelle ; bouteille exclue non ajoutée ;
  - exclue, décochée puis recochée → toujours exclue, absente de la carte ;
  - `excludeBottles` puis `syncMenu` → toujours absente ; `restoreBottle` → présente en dernière position, exclusion supprimée ;
  - `excludeBottles` sur 3 bouteilles dans une transaction qui lève ensuite une erreur → aucune exclusion créée, les 3 lignes `MenuBottle` intactes ;
  - `syncBottle` dans une transaction qui lève ensuite une erreur → aucune ligne `MenuBottle` créée.
- `bottles.test.ts` :
  - `PUT { remainingPercent: 0 }` seul → la bouteille reste dans ses cartes ;
  - bouteille rangée dans une section avec `isHidden: true`, vidée puis rechargée → section et `isHidden` conservés ;
  - `PUT { isApero: false }` → retirée de la carte système et d'une carte personnelle `APEROS`, toujours présente dans la carte `DIGESTIFS` si `isDigestif` ;
  - suppression d'une bouteille exclue → plus aucune ligne `MenuBottleExclusion` ;
  - import de 3 bouteilles `isApero` → 3 lignes dans le menu apéritifs, aucune dans une carte personnelle `APEROS` ;
  - les tests existants `:94-118`, `:150`, `:174-204`, `:698` restent verts (adapter ceux qui supposent qu'une bouteille vide quitte le menu).
- `menuBottles.test.ts` :
  - `/sync` avec une bouteille vide cochée → présente dans la carte système ; avec une bouteille exclue → absente ; adapter `:99` si besoin ;
  - `/sync` sur une carte personnelle → 400 ; sur une carte `COCKTAILS` → 400 ;
  - `POST` d'une bouteille cochée dans une carte personnelle → 201 ; non cochée → 400 ; dans une carte système → 400 ;
  - `DELETE` dans une carte système → exclusion créée, bouteille toujours présente dans l'autre carte système ; dans une carte personnelle → suppression simple, aucune exclusion ;
  - `POST .../exclusions { bottleIds: [a, b] }` sur une carte système → 2 exclusions, 2 lignes retirées ; sur une carte personnelle → 400 ; `bottleIds` vide → 400 ;
  - `GET .../exclusions` liste la bouteille exclue ; `DELETE .../exclusions/:bottleId` → la bouteille revient en fin de liste ; exclusion inconnue → 404.
- `menus.test.ts` :
  - PUT avec `bottles` sur le menu apéritifs → 400 ;
  - `POST /menus { type: 'APEROS' }` → 201, carte vide, puis `DELETE` → OK ;
  - PUT avec `bottles` sur une carte personnelle : bouteilles cochées → 200, une bouteille non cochée → 400 et composition inchangée ;
  - PUT d'une carte non système avec un autre `type` → 400 ; avec le même `type` → 200.
- `public.test.ts` : une bouteille vide cochée n'apparaît ni dans `/api/public/menus/aperitifs`, ni dans une carte personnelle publique ; une bouteille exclue n'apparaît pas dans la carte système.

## Points d'attention

- Effet visible des décisions : l'éditeur admin `MenuBottleEditPage` listera les bouteilles vides (badge « vide ») et une section « bouteilles retirées » avec l'action « remettre » : E-07.
- Au premier déploiement, les cartes système ne contiennent pas encore les bouteilles vides cochées (l'ancienne synchro les retirait), et aucune exclusion n'existe. La première synchro (`/sync`, ou modification d'une bouteille) ajoute en fin de liste toutes les bouteilles cochées, vides comprises (masquées sur la carte publique). L'admin retire ensuite celles qu'il ne veut pas.
- **Notes de version** (règle de D-11 : la PR ne touche ni `docs/releases/` ni `UPGRADING.md`). Changement non cassant (`breaking: false`). La description de la PR a une section « Required actions » et le Journal une ligne « Notes de version ». Action attendue : *after* — vérifier les cartes « Apéritifs » et « Digestifs », qui contiennent désormais toutes les bouteilles cochées, vides comprises (masquées sur la carte publique), et retirer celles qui ne doivent pas y figurer. Épinglage recommandé : `:<version>` avant D-05, `:<majeure>.<mineure>` ensuite.
- Vérification en production (action humaine) : avant le merge, l'agent s'arrête et demande à l'humain d'exécuter sur une copie de la base de production `SELECT id, slug, name, type FROM Menu WHERE type IN ('APEROS', 'DIGESTIFS') AND slug NOT IN ('aperitifs', 'digestifs');` (l'UI ne permettait pas ces cartes, l'API si). Si une ligne sort, cette carte devient une carte personnelle : ses bouteilles non cochées y restent jusqu'à la prochaine synchro (`syncAllBottleMenus` à l'import, ou modification de la bouteille). Le signaler dans la PR.
- Schéma : une seule tâche de schéma à la fois (README, « Ce qui doit rester séquentiel »). C-07 et C-11 ajoutent aussi des migrations : régénérer celle-ci après rebase.
- A-05 doit garder le filtre `remainingPercent > 0` de `public.ts` en réécrivant les `select`.
- `menuBottles.ts` est aussi modifié par C-13 : enchaîner ; si C-13 passe avant, utiliser son `nextPosition` dans `syncBottle` et `restoreBottle`. C-10 réutilise `syncAllBottleMenus` et ne doit pas réécrire la synchro.
- Le frontend (`MenusPage`, `MenuBottleEditPage`) ne crée pas encore de carte personnelle et affiche le bouton « Synchroniser » sur toutes les cartes de bouteilles : F-08 s'en charge.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : suivi des revues de la phase A. Constat ajouté (type `APEROS`/`DIGESTIFS` encore attribuable à un menu ordinaire après A-02), étape 6 et décision à prendre dans les Points d'attention : réserver ces types aux menus système ou l'accepter explicitement. `owner: mixed` : la décision humaine précède le code.
- 2026-10-09 : décisions validées par l'humain (cartes de bouteilles personnelles, bouteilles vides conservées). Étapes 1, 2, 4, 5 et 6 réécrites, critères et tests adaptés. Ajouts : `assertBottlesAllowed` sur `POST /menu-bottles` et `PUT /menus/:id`, `DELETE /menu-bottles/:id` refusé sur une carte système, type d'une carte non système figé après création. L'écran des cartes personnelles part dans F-08. `owner: agent`.
- 2026-10-09 : réponses de l'humain. Le retrait d'une carte système passe par une liste d'exclusions (table `MenuBottleExclusion`, migration) au lieu d'un refus : `excludeBottle`, `restoreBottle`, routes `GET`/`DELETE .../exclusions`, `isAvailableFor` + `isEligible` avec exclusions. Type figé validé. `depends_on` : C-01 ajoutée (première migration) ; `touches` : `schema.prisma` et `migrations/`.
- 2026-10-09 : revue de la PR #38. Relations inverses Prisma ajoutées ; route d'exclusion en lot `POST /menu-bottles/menu/:menuId/exclusions` (`excludeBottles`, en transaction) utilisée par E-07 ; vérification en production formulée comme une requête SQL à faire exécuter par l'humain ; point d'attention « Notes de version » (règle de D-11).
