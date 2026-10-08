---
id: C-06
title: "Synchronisation des menus apéritifs/digestifs : une seule implémentation"
phase: C
lane: backend
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [C-03]
touches: [backend/src/services/menuSyncService.ts, backend/src/routes/bottles.ts, backend/src/routes/menuBottles.ts, backend/src/routes/menus.ts, backend/src/i18n/]
sources: ["01-backend-routes.md §H3", "02-backend-data-perf.md §3.5"]
branch:
pr:
---

## Décisions validées (2026-10-09)

- **Cartes de bouteilles.** Les cases `isApero` / `isDigestif` d'une bouteille veulent dire « disponible pour les cartes de ce type ». Les deux cartes système « Apéritifs » et « Digestifs » restent non supprimables (renommables et dépubliables) et contiennent automatiquement toutes les bouteilles cochées pour leur type. L'utilisateur peut créer ses propres cartes `APEROS` ou `DIGESTIFS` (ex. « Apéro d'été ») : supprimables, composées à la main parmi les bouteilles cochées pour ce type. Décocher une bouteille la retire de toutes les cartes de ce type, système et personnelles. Les types `APEROS` et `DIGESTIFS` restent séparés.
- **Bouteilles vides.** Une bouteille cochée qui devient vide reste dans ses cartes, à sa place, avec sa section et son état masqué. Elle n'est pas affichée sur la carte publique. Si elle ne revient jamais en stock, l'admin la retire à la main.
- L'écran de création des cartes personnelles est hors périmètre : voir F-08.

## Contexte

Les menus « Apéritifs » et « Digestifs » reflètent les bouteilles marquées `isApero`/`isDigestif`. Trois morceaux de code tiennent ce lien avec des règles différentes : le résultat dépend du chemin (création, édition, import, bouton « Synchroniser »). Une bouteille vide peut réapparaître, une bouteille rechargée perd sa place et sa section. L'application sert aussi de carte de boissons servies telles quelles : l'utilisateur doit pouvoir composer d'autres cartes de bouteilles que les deux cartes système.

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
- Utile : `routes/public.ts:53-56` filtre déjà `bottle.remainingPercent > 0` à l'affichage public.

## Ce qu'il faut faire

1. **Règle d'appartenance (décision B).** Une bouteille peut figurer dans une carte de type `APEROS` (resp. `DIGESTIFS`) si et seulement si `isApero` (resp. `isDigestif`) est vrai, **vide ou non**. Les vides sont masquées à l'affichage public (déjà fait par `public.ts:55`). Position, section et `isHidden` survivent donc à un vidage puis un rechargement.
2. `src/services/menuSyncService.ts` :
   ```ts
   type Db = Prisma.TransactionClient | PrismaClient;
   export const BOTTLE_MENU_FLAG = { APEROS: 'isApero', DIGESTIFS: 'isDigestif' } as const;
   export type BottleMenuType = keyof typeof BOTTLE_MENU_FLAG;
   export const SYSTEM_MENU_SLUGS: Record<BottleMenuType, string> = { APEROS: 'aperitifs', DIGESTIFS: 'digestifs' };

   export function isSystemMenu(menu: { slug: string }): boolean;                    // seul critère d'identification
   export function isEligible(bottle: { isApero: boolean; isDigestif: boolean }, type: BottleMenuType): boolean;
   export async function assertBottlesAllowed(db: Db, menu: { type: string }, bottleIds: number[]): Promise<void>;
   export async function syncMenu(db: Db, menuId: number): Promise<{ added: number; removed: number }>;
   export async function syncBottle(db: Db, bottleId: number): Promise<void>;
   export async function syncAllBottleMenus(db: Db): Promise<void>;                // pour l'import
   ```
   - **Un seul helper identifie les cartes système** : `isSystemMenu`, par slug (A-02 empêche de changer le slug et le type des menus système). Déplacer ici `SYSTEM_MENU_SLUGS` et `isSystemMenu` de `routes/menus.ts` ; `menus.ts` les importe. Le type seul ne suffit plus, puisque des cartes personnelles partagent ce type.
   - `isEligible` est le seul endroit qui porte la règle de l'étape 1 (elle ne regarde plus `remainingPercent`).
   - `assertBottlesAllowed` lève `BadRequestError('errors.bottleNotAllowedInMenu')` si le menu n'est pas de type bouteille ou si une bouteille n'est pas éligible pour ce type.
   - `syncMenu` (carte système uniquement) reprend l'algorithme ensembliste de `menuBottles.ts:121-163` (`Set`, `createMany`, `deleteMany`) avec `isEligible` : ajoute en fin de liste les bouteilles cochées absentes, retire les autres.
   - `syncBottle` : pour chaque type bouteille, si la bouteille est éligible, l'ajoute en position max+1 à la carte système du type quand elle n'y est pas (les cartes personnelles ne sont jamais remplies automatiquement) ; sinon, la retire de **toutes** les cartes du type, système et personnelles.
   - `syncAllBottleMenus` : `syncMenu` sur les deux cartes système, puis retrait des bouteilles non éligibles des cartes personnelles.
3. `routes/bottles.ts` :
   - supprimer `syncBottleMenus` ;
   - POST : `prisma.$transaction(async (tx) => { …create…; await syncBottle(tx, id); })`. La boucle `quantity` reste, mais dans la transaction (C-10 la passe en lot) ;
   - PUT : même transaction, `syncBottle` **toujours** appelé ;
   - import confirm : remplacer la boucle `:269-273` par `await syncAllBottleMenus(tx)` **dans** la transaction.
4. `routes/menuBottles.ts` :
   - `/menu/:menuId/sync` : `NotFoundError` si le menu n'existe pas ; `BadRequestError('errors.cannotSyncCocktailMenu')` si `type === 'COCKTAILS'` (remplace le texte en dur `:116`) ; `BadRequestError('errors.cannotSyncPersonalMenu')` si le menu n'est pas une carte système ; sinon `syncMenu` en transaction. Réponse inchangée `{ message, added, removed }`.
   - `POST /menu-bottles` : `assertBottlesAllowed` avant la création (400 si la bouteille n'est pas cochée pour le type de la carte, ou si la carte est de type `COCKTAILS`) ; 400 `errors.systemMenuBottlesManaged` sur une carte système, dont la composition est automatique.
   - `DELETE /menu-bottles/:id` sur une carte système : 400 `errors.systemMenuBottlesManaged`. La prochaine synchro remettrait la bouteille : pour la retirer d'une carte système, l'admin décoche la case (ou masque le groupe). Sur une carte personnelle, la suppression reste libre.
5. `routes/menus.ts` PUT :
   - `bottles` sur une carte système : `BadRequestError('errors.systemMenuBottlesManaged')`. Vérifier que le frontend ne l'envoie pas (`MenuBottleEditPage` passe par `/menu-bottles`) ;
   - `bottles` sur une carte personnelle : `assertBottlesAllowed` dans la transaction, avant l'écriture.
6. **Cartes `APEROS`/`DIGESTIFS` non système (décision A).**
   - La synchronisation automatique ne s'applique qu'aux deux cartes système, reconnues par `isSystemMenu`.
   - `POST /menus` et `PUT /menus/:id` acceptent les types `APEROS` et `DIGESTIFS` pour une carte non système. Ces cartes ne sont jamais remplies automatiquement et restent supprimables.
   - Seules les bouteilles cochées pour le type peuvent y être ajoutées (400 sinon, via `assertBottlesAllowed`).
   - Décocher une bouteille la retire de toutes les cartes du type (`syncBottle`).
   - Le type d'une carte non système n'est plus modifiable après sa création (400 `errors.menuTypeImmutable`, renvoyer le type courant reste accepté comme pour A-02) : passer de `COCKTAILS` à `APEROS` laisserait des cocktails dans une carte de bouteilles, et passer d'`APEROS` à `DIGESTIFS` des bouteilles non cochées pour le nouveau type.
7. Ajouter les clés i18n utilisées dans `en.json` et `fr.json`.

## Critères d'acceptation

- [ ] `syncBottleMenus` n'existe plus ; toute synchro passe par `menuSyncService`.
- [ ] `isSystemMenu` n'est défini qu'à un endroit (`menuSyncService.ts`) et `menus.ts` l'importe.
- [ ] POST, PUT, import et `/sync` donnent le même résultat pour une même bouteille.
- [ ] `PUT /bottles/:id { remainingPercent: 0 }` sans flags laisse la bouteille dans ses cartes.
- [ ] Une bouteille vidée puis rechargée garde position, section et `isHidden`, dans les cartes système comme personnelles.
- [ ] Une erreur pendant la synchro annule aussi la création ou la modification de la bouteille.
- [ ] Le menu public n'affiche jamais une bouteille vide.
- [ ] Une carte personnelle `APEROS` peut être créée, n'est jamais remplie automatiquement, accepte une bouteille `isApero`, refuse (400) une bouteille non cochée et peut être supprimée.
- [ ] Décocher `isApero` retire la bouteille de la carte système et de toutes les cartes personnelles `APEROS`, sans toucher aux cartes `DIGESTIFS`.
- [ ] Les cartes système restent non supprimables ; leur composition ne se modifie ni par `PUT /menus/:id`, ni par `POST`/`DELETE /menu-bottles`.

## Tests à ajouter ou adapter

- `src/services/menuSyncService.test.ts` :
  - `isEligible` : table de vérité flag × vide × type (le vide ne change rien) ;
  - `isSystemMenu` : `aperitifs`, `digestifs`, un autre slug ;
  - `syncMenu` : ajoute les éligibles en fin de liste, retire les autres, idempotent (2e appel `{ added: 0, removed: 0 }`) ;
  - `syncBottle` : bouteille cochée ajoutée à la carte système seulement, pas à une carte personnelle du même type ; bouteille décochée retirée de la carte système et de la carte personnelle ;
  - `syncBottle` dans une transaction qui lève ensuite une erreur → aucune ligne `MenuBottle` créée.
- `bottles.test.ts` :
  - `PUT { remainingPercent: 0 }` seul → la bouteille reste dans ses cartes ;
  - bouteille rangée dans une section avec `isHidden: true`, vidée puis rechargée → section et `isHidden` conservés ;
  - `PUT { isApero: false }` → retirée de la carte système et d'une carte personnelle `APEROS`, présente toujours dans la carte `DIGESTIFS` si `isDigestif` ;
  - import de 3 bouteilles `isApero` → 3 lignes dans le menu apéritifs, aucune dans une carte personnelle `APEROS` ;
  - les tests existants `:94-118`, `:150`, `:174-204`, `:698` restent verts (adapter ceux qui supposent qu'une bouteille vide quitte le menu).
- `menuBottles.test.ts` :
  - `/sync` avec une bouteille vide cochée → présente dans la carte système ; adapter `:99` si besoin ;
  - `/sync` sur une carte personnelle → 400 ; sur une carte `COCKTAILS` → 400 ;
  - `POST` d'une bouteille cochée dans une carte personnelle → 201 ; non cochée → 400 ; dans une carte système → 400 ;
  - `DELETE` dans une carte système → 400 ; dans une carte personnelle → 204 (ou le code actuel).
- `menus.test.ts` :
  - PUT avec `bottles` sur le menu apéritifs → 400 ;
  - `POST /menus { type: 'APEROS' }` → 201, carte vide, puis `DELETE` → OK ;
  - PUT avec `bottles` sur une carte personnelle : bouteilles cochées → 200, une bouteille non cochée → 400 et composition inchangée ;
  - PUT d'une carte non système avec un autre `type` → 400 ; avec le même `type` → 200.
- `public.test.ts` : une bouteille vide cochée n'apparaît ni dans `/api/public/menus/aperitifs`, ni dans une carte personnelle publique.

## Points d'attention

- Effet visible des décisions : l'éditeur admin `MenuBottleEditPage` listera les bouteilles vides. Un badge « vide » côté frontend est prévu dans E-07 ou, à défaut, dans F-08.
- Au premier déploiement, les cartes système ne contiennent pas encore les bouteilles vides cochées (l'ancienne synchro les retirait). La première synchro (`/sync`, ou modification d'une bouteille) les ajoute en fin de liste, masquées sur la carte publique puisque vides. Le mentionner dans les notes de la release (D-11).
- Avant le merge, vérifier en base qu'aucune carte hors `aperitifs`/`digestifs` n'a déjà le type `APEROS`/`DIGESTIFS` (l'UI ne le permettait pas, l'API si). Si c'est le cas, elle devient une carte personnelle : ses bouteilles non cochées y restent jusqu'à la prochaine synchro (`syncAllBottleMenus` à l'import, ou modification de la bouteille). Le signaler dans la PR.
- A-05 doit garder le filtre `remainingPercent > 0` de `public.ts` en réécrivant les `select`.
- `menuBottles.ts` est aussi modifié par C-13 : enchaîner ; si C-13 passe avant, utiliser son `nextPosition`. C-10 réutilise `syncAllBottleMenus` et ne doit pas réécrire la synchro.
- Le frontend (`MenusPage`, `MenuBottleEditPage`) ne crée pas encore de carte personnelle et affiche le bouton « Synchroniser » sur toutes les cartes de bouteilles : F-08 s'en charge.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : suivi des revues de la phase A. Constat ajouté (type `APEROS`/`DIGESTIFS` encore attribuable à un menu ordinaire après A-02), étape 6 et décision à prendre dans les Points d'attention : réserver ces types aux menus système ou l'accepter explicitement. `owner: mixed` : la décision humaine précède le code.
- 2026-10-09 : décisions validées par l'humain (cartes de bouteilles personnelles, bouteilles vides conservées). Étapes 1, 2, 4, 5 et 6 réécrites, critères et tests adaptés. Ajouts : `assertBottlesAllowed` sur `POST /menu-bottles` et `PUT /menus/:id`, `DELETE /menu-bottles/:id` refusé sur une carte système, type d'une carte non système figé après création. L'écran des cartes personnelles part dans F-08. `owner: agent`.
