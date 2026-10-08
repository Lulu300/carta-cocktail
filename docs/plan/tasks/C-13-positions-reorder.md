---
id: C-13
title: "Positions et sections : helpers transactionnels et endpoint de réordonnancement"
phase: C
lane: backend
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [C-03]
touches: [backend/src/services/positions.ts, backend/src/routes/menuSections.ts, backend/src/routes/menuBottles.ts, backend/src/i18n/]
sources: ["01-backend-routes.md §H6", "01-backend-routes.md §R5", "05-frontend-archi.md §H5"]
branch:
pr:
---

## Contexte

Les menus ordonnent cocktails, bouteilles et sections par un champ `position`. Le calcul de la position suivante et le réordonnancement sont écrits différemment selon la route, sans transaction ni contrôle d'appartenance. Le frontend envoie une requête par bouteille pour déplacer un groupe : un échec au milieu laisse des positions incohérentes.

## Problème constaté

- `routes/menuSections.ts:97-105` : `Promise.all` de N `update` hors transaction. Un id d'un autre menu lève P2025 (`where: { id, menuId }`) alors que d'autres positions sont déjà écrites. Ids non validés (type, doublons), liste partielle acceptée.
- `routes/menuBottles.ts:39` : `position ?? 0` par défaut, collision avec la première bouteille. `menuSections.ts:34-43` et `bottles.ts:35-43` calculent max+1 : deux règles.
- `routes/menuBottles.ts:62-69` : `menuSectionId` non contrôlé ; une bouteille peut être rattachée à une section d'un **autre** menu.
- `routes/menuBottles.ts:35` : une bouteille peut être ajoutée à un menu de type `COCKTAILS`.
- Le max+1 est lu puis écrit hors transaction (course entre deux POST simultanés).
- Frontend `MenuBottleEditPage.tsx:124-161` : `moveGroupUp`/`moveGroupDown` (copiés-collés) envoient un `PUT /menu-bottles/:id` par bouteille, en parallèle. `menuSections.reorder` (`frontend/src/services/api.ts:229`) n'est appelé nulle part.

## Ce qu'il faut faire

1. `src/services/positions.ts` :
   ```ts
   type Db = Prisma.TransactionClient | PrismaClient;
   type PositionedModel = 'menuSection' | 'menuBottle' | 'menuCocktail';

   /** aggregate({ where: { menuId }, _max: { position: true } }) → (max ?? -1) + 1 */
   export async function nextPosition(db: Db, model: PositionedModel, menuId: number): Promise<number>;

   /**
    * 1. doublons dans ids → BadRequestError('errors.reorderDuplicateIds')
    * 2. count({ where: { menuId } }) !== ids.length → BadRequestError('errors.reorderIncomplete')
    * 3. count({ where: { menuId, id: { in: ids } } }) !== ids.length → BadRequestError('errors.reorderForeignIds')
    * 4. update({ where: { id }, data: { position: index } }) pour chaque id
    */
   export async function reorder(db: Db, model: PositionedModel, menuId: number, ids: number[]): Promise<void>;
   ```
   Toujours appelé dans un `prisma.$transaction`. Si le typage générique des délégués Prisma bloque, un `switch (model)` explicite est acceptable.
2. `menuSections.ts` :
   - POST : `nextPosition` dans une transaction ;
   - `POST /menu/:menuId/sections/reorder { sectionIds }` : `reorder` en transaction, liste **complète** des sections exigée, réponse `{ message }`.
3. `menuBottles.ts` :
   - POST : `NotFoundError` si le menu n'existe pas ; `BadRequestError('errors.bottleMenuOnly')` si `menu.type === 'COCKTAILS'` ; `position` absente → `nextPosition` ; `menuSectionId` d'un autre menu → `BadRequestError('errors.sectionNotInMenu')` ;
   - PUT `/:id` : même contrôle de `menuSectionId` ;
   - nouveau `POST /menu/:menuId/reorder { ids: number[] }` : liste complète des `MenuBottle` du menu, dans l'ordre voulu ; `reorder` en transaction ; réponse `{ message }`.
4. Pas de modification du frontend : E-07 branchera le déplacement de groupe sur le nouvel endpoint (1 requête au lieu de N). Décrire le contrat de l'endpoint dans la PR.
5. Clés i18n correspondantes dans `en.json`/`fr.json`.

## Critères d'acceptation

- [ ] Reorder avec un id d'un autre menu → 400, et **aucune** position modifiée.
- [ ] Reorder avec doublon ou liste incomplète → 400.
- [ ] `POST /menu-bottles` sans `position` → max + 1.
- [ ] `menuSectionId` d'un autre menu → 400 (POST et PUT).
- [ ] Ajouter une bouteille à un menu `COCKTAILS` → 400.
- [ ] `POST /menu-bottles/menu/:id/reorder` réordonne toutes les bouteilles en une requête.

## Tests à ajouter ou adapter

- `src/services/positions.test.ts` (base de test) : `nextPosition` sur menu vide (0) et non vide ; `reorder` nominal ; doublon, liste incomplète, id étranger → erreur, positions relues en base inchangées.
- `menuSections.test.ts` : adapter `:112` à la liste complète ; id d'un autre menu → 400 et positions inchangées ; ids non numériques → 400.
- `menuBottles.test.ts` : 2e bouteille sans position → 1 ; POST sur un menu `COCKTAILS` → 400 ; section d'un autre menu → 400 ; nouvel endpoint reorder (nominal, id étranger, liste incomplète).

## Points d'attention

- Exiger la liste complète change le contrat de `sections/reorder`. Aucun appel frontend aujourd'hui : pas de régression.
- Le frontend numérote aujourd'hui les positions de `MenuBottle` par section (`pos` repart de 0, `MenuBottleEditPage.tsx:131-138`) : elles ne sont pas uniques dans le menu. Le nouvel endpoint impose 0..n-1 sur tout le menu ; le regroupement par section à l'affichage reste correct.
- Pas de contrainte d'unicité sur `position` : deux positions égales restent possibles via `PUT /menu-bottles/:id`. Acceptable, le tri reste stable.
- `MenuCocktail` : les positions viennent de `PUT /menus/:id` (A-02). Le helper le prévoit, mais ne pas toucher `menus.ts` ici.
- La validation des ids (`z.array(z.number().int().positive())`) vient de C-04 si elle est passée ; sinon contrôle minimal dans `reorder`.
- `menuBottles.ts` est aussi modifié par C-06 : enchaîner ; la tâche qui passe en second réutilise `nextPosition`. E-07 dépend de cette tâche.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
