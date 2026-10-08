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

## Contexte

Les menus « Apéritifs » et « Digestifs » reflètent les bouteilles marquées `isApero`/`isDigestif`. Trois morceaux de code tiennent ce lien avec des règles différentes : le résultat dépend du chemin (création, édition, import, bouton « Synchroniser »). Une bouteille vide peut réapparaître, une bouteille rechargée perd sa place et sa section.

## Problème constaté

- `routes/bottles.ts:18-78` `syncBottleMenus` : menus trouvés **par slug** (`:24-25`), bouteilles vides **exclues** (`:21`, `:33`, `:59`), deux blocs copiés-collés (apéro `:28-51`, digestif `:54-77`), max+1 lu puis `create` hors transaction.
- `routes/menuBottles.ts:95-174` (`POST /menu/:menuId/sync`) : menus trouvés **par type** (`:111-114`), vides **non exclues** (`:121`) : le bouton « Synchroniser » réinsère les bouteilles vides retirées par l'auto-sync.
- `routes/bottles.ts:405` : la synchro ne part que si `isApero` ou `isDigestif` est dans le body. `PUT { remainingPercent: 0 }` seul laisse la bouteille dans le menu. L'UI envoie toujours les flags : défaut latent.
- `routes/bottles.ts:47-49` : une bouteille vidée est **supprimée** du menu ; rechargée, elle revient en fin de liste, sans section ni `isHidden`.
- `routes/bottles.ts:269-273` (import) : synchro après la transaction, bouteille par bouteille (jusqu'à 7 requêtes chacune), non atomique.
- `routes/bottles.ts:365-377` : POST et synchro hors transaction.
- `routes/menus.ts:112-121` : `PUT /menus/:id` peut remplacer les bouteilles d'un menu système.
- Utile : `routes/public.ts:53-56` filtre déjà `bottle.remainingPercent > 0` à l'affichage public.

## Ce qu'il faut faire

1. **Règle d'appartenance** (à confirmer, voir Points d'attention). Proposition par défaut : une bouteille appartient au menu si son flag est vrai, **vide ou non**. Les vides sont masquées à l'affichage (déjà fait par `public.ts:55`). Position, section et `isHidden` survivent alors à un vidage puis un rechargement.
2. `src/services/menuSyncService.ts` :
   ```ts
   type Db = Prisma.TransactionClient | PrismaClient;
   export const BOTTLE_MENU_FLAG = { APEROS: 'isApero', DIGESTIFS: 'isDigestif' } as const;
   export type BottleMenuType = keyof typeof BOTTLE_MENU_FLAG;

   export function isEligible(bottle: { isApero: boolean; isDigestif: boolean; remainingPercent: number }, type: BottleMenuType): boolean;
   export async function syncMenu(db: Db, menuId: number): Promise<{ added: number; removed: number }>;
   export async function syncBottle(db: Db, bottleId: number): Promise<void>;      // tous les menus APEROS/DIGESTIFS
   export async function syncAllBottleMenus(db: Db): Promise<void>;                // pour l'import
   ```
   - Un seul critère d'identification : `menu.type`. A-02 empêche de changer le type des menus système.
   - `syncMenu` reprend l'algorithme ensembliste de `menuBottles.ts:121-163` (`Set`, `createMany`, `deleteMany`) avec `isEligible`.
   - `syncBottle` ajoute la bouteille en position max+1 ou la retire, pour chaque menu de type bouteille.
   - `isEligible` est le seul endroit qui porte la règle de l'étape 1.
3. `routes/bottles.ts` :
   - supprimer `syncBottleMenus` ;
   - POST : `prisma.$transaction(async (tx) => { …create…; await syncBottle(tx, id); })`. La boucle `quantity` reste, mais dans la transaction (C-10 la passe en lot) ;
   - PUT : même transaction, `syncBottle` **toujours** appelé ;
   - import confirm : remplacer la boucle `:269-273` par `await syncAllBottleMenus(tx)` **dans** la transaction.
4. `routes/menuBottles.ts` `/menu/:menuId/sync` : `NotFoundError` si le menu n'existe pas ; `BadRequestError('errors.cannotSyncCocktailMenu')` si `type === 'COCKTAILS'` (remplace le texte en dur `:116`) ; sinon `syncMenu` en transaction. Réponse inchangée `{ message, added, removed }`.
5. `routes/menus.ts` PUT : refuser `bottles` sur un menu `APEROS`/`DIGESTIFS` (`BadRequestError('errors.systemMenuBottlesManaged')`). Vérifier que le frontend ne l'envoie pas (`MenuBottleEditPage` passe par `/menu-bottles`).
6. Ajouter les clés i18n utilisées dans `en.json` et `fr.json`.

## Critères d'acceptation

- [ ] `syncBottleMenus` n'existe plus ; toute synchro passe par `menuSyncService`.
- [ ] POST, PUT, import et `/sync` donnent le même résultat pour une même bouteille.
- [ ] `PUT /bottles/:id { remainingPercent: 0 }` sans flags applique la règle.
- [ ] Avec la règle par défaut, une bouteille vidée puis rechargée garde position, section et `isHidden`.
- [ ] Une erreur pendant la synchro annule aussi la création ou la modification de la bouteille.
- [ ] Le menu public n'affiche jamais une bouteille vide.

## Tests à ajouter ou adapter

- `src/services/menuSyncService.test.ts` :
  - `isEligible` : table de vérité flag × vide × type ;
  - `syncMenu` : ajoute les éligibles en fin de liste, retire les autres, idempotent (2e appel `{ added: 0, removed: 0 }`) ;
  - `syncBottle` dans une transaction qui lève ensuite une erreur → aucune ligne `MenuBottle` créée.
- `bottles.test.ts` :
  - `PUT { remainingPercent: 0 }` seul → conforme à la règle ;
  - bouteille rangée dans une section avec `isHidden: true`, vidée puis rechargée → section et `isHidden` conservés ;
  - import de 3 bouteilles `isApero` → 3 lignes dans le menu apéritifs ;
  - les tests existants `:94-118`, `:150`, `:174-204`, `:698` restent verts.
- `menuBottles.test.ts` : `/sync` avec une bouteille vide flaggée → conforme à la règle ; adapter `:99` si besoin.
- `menus.test.ts` : PUT avec `bottles` sur le menu apéritifs → 400.
- `public.test.ts` : une bouteille vide flaggée n'apparaît pas dans `/api/public/menus/aperitifs`.

## Points d'attention

- **Décision produit** : garder les bouteilles vides dans le menu (masquées à l'affichage) ou les retirer comme aujourd'hui. Le défaut proposé aligne les trois chemins et supprime la perte de position/section. Effet visible : l'éditeur admin `MenuBottleEditPage` listera les vides ; un badge « vide » côté frontend serait utile (E-07). À valider en revue de PR ; si refus, il suffit d'inverser `isEligible`.
- Un menu créé par l'utilisateur avec le type `APEROS`/`DIGESTIFS` (possible via `POST /menus`) sera aussi synchronisé automatiquement. Cohérent avec le bouton « Synchroniser », à signaler.
- A-05 doit garder le filtre `remainingPercent > 0` de `public.ts` en réécrivant les `select`.
- `menuBottles.ts` est aussi modifié par C-13 : enchaîner ; si C-13 passe avant, utiliser son `nextPosition`. C-10 réutilise `syncAllBottleMenus` et ne doit pas réécrire la synchro.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
