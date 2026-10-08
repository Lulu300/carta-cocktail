---
id: A-02
title: "Ne plus perdre les sections à la sauvegarde d'un menu (+ transaction, menus système verrouillés)"
phase: A
lane: backend
criticite: critique
effort: S
status: done
owner: agent
depends_on: []
touches: [backend/src/routes/menus.ts, backend/src/routes/menus.test.ts, backend/src/i18n/en.json, backend/src/i18n/fr.json, frontend/src/types/index.ts]
sources: ["01-backend-routes.md §C1", "01-backend-routes.md §C3", "05-frontend-archi.md §C1", "02-backend-data-perf.md §4.3"]
branch: fix/A-02-menu-sections-save
pr: 27
---

## Contexte

L'éditeur de menu cocktails permet de ranger les cocktails en sections. Chaque clic sur « Enregistrer » les remet tous « sans section » : perte de données silencieuse, à chaque sauvegarde. Le même `PUT /api/menus/:id` n'est pas transactionnel et laisse modifier le slug et le type des menus système (apéritifs, digestifs), ce qui contourne leur protection contre la suppression et casse leur synchronisation automatique.

## Problème constaté

- `frontend/src/pages/admin/MenuEditPage.tsx:136-151` (`handleSave`) envoie `cocktails[].menuSectionId` (l.147).
- `backend/src/routes/menus.ts:99-109` fait `deleteMany` puis `createMany` avec seulement `menuId`, `cocktailId`, `position` et `isHidden` : `menuSectionId` est perdu. Même trou pour `bottles` (l.112-122), que l'UI n'utilise pas aujourd'hui (l'éditeur de bouteilles passe par `/menu-bottles/:id`).
- `frontend/src/types/index.ts:189-198` : `MenuInput.cocktails` et `MenuInput.bottles` ne déclarent pas `menuSectionId`. TypeScript ne signale rien car le tableau est produit par un `.map()`.
- Pas de transaction : `deleteMany` (l.100), `createMany` (l.101) et `update` (l.124) sont trois écritures séparées. Un slug déjà pris fait échouer l'`update` (P2002, donc 409, l.146-148) alors que les associations ont déjà été remplacées. Menu inexistant : `createMany` échoue sur la clé étrangère et l'API répond 500 au lieu de 404.
- Menus système modifiables : `slug` (l.129) et `type` (l.131) acceptés sans contrôle. Conséquences :
  - renommer `aperitifs` puis le supprimer contourne la protection du DELETE (l.168) ;
  - `syncBottleMenus` cherche les menus par slug (`backend/src/routes/bottles.ts:24-25`) et s'arrête en silence ;
  - `/menu-bottles/menu/:id/sync` se base sur `type` (`backend/src/routes/menuBottles.ts:111-113`).
- `errors.cannotDeleteDefaultMenu` (l.169) n'existe ni dans `backend/src/i18n/en.json` ni dans `fr.json` : le client reçoit la clé brute.
- `backend/src/routes/menus.test.ts:75-98` ne teste ni `menuSectionId`, ni l'atomicité, ni les menus système en PUT.

## Ce qu'il faut faire

1. Dans `menus.ts`, déclarer `const SYSTEM_MENU_SLUGS = ['aperitifs', 'digestifs']` et une fonction `isSystemMenu(menu)`. L'utiliser aussi dans le DELETE (l.168). La centralisation entre fichiers relève de C-06.
2. Réécrire `PUT /:id` :
   1. Parser l'id et charger le menu. Absent : 404 `errors.notFound`.
   2. Menu système : refuser (403 `errors.cannotModifySystemMenu`) un `slug` dont la valeur normalisée diffère du slug actuel, ou un `type` différent du type actuel. Renvoyer la valeur actuelle reste accepté.
   3. Rassembler les `menuSectionId` non nuls de `cocktails` et `bottles`. Vérifier qu'ils appartiennent tous à ce menu, sinon 400 `errors.validationError` :
      ```ts
      const ids = [...new Set(sectionIds)];
      const owned = await tx.menuSection.count({ where: { id: { in: ids }, menuId } });
      if (owned !== ids.length) throw new ValidationFailure();
      ```
   4. Tout faire dans `prisma.$transaction(async (tx) => { ... })` : `deleteMany` puis `createMany` avec `menuSectionId: c.menuSectionId ?? null` (cocktails et bouteilles), puis `update` du menu. Une erreur annule l'ensemble.
   5. Garder le mapping P2002 vers 409.
3. Ajouter dans `backend/src/i18n/en.json` et `fr.json` : `errors.cannotDeleteDefaultMenu` et `errors.cannotModifySystemMenu`.
4. `frontend/src/types/index.ts` : ajouter `menuSectionId?: number | null` à `MenuInput.cocktails[]` et `MenuInput.bottles[]`.

Hors périmètre : remplacement des bouteilles d'un menu système et synchronisation unique (C-06) ; helpers de position et réordonnancement (C-13) ; middleware d'erreurs (C-03) ; refonte des éditeurs de menu et choix d'un seul modèle de sauvegarde (E-07).

## Critères d'acceptation

- [x] PUT avec `cocktails[].menuSectionId`, puis GET `/api/menus/:id` : chaque cocktail garde sa section.
- [x] Même chose avec `bottles[].menuSectionId`.
- [x] `menuSectionId` appartenant à un autre menu : 400, aucune association modifiée.
- [x] Slug en conflit avec `cocktails` dans le body : 409, associations inchangées.
- [x] Menu inexistant : 404, plus de 500.
- [x] Menu système : changer `slug` ou `type` donne 403 ; changer `name`, `description` ou `isPublic` donne 200 ; renvoyer le slug inchangé donne 200.
- [x] DELETE d'un menu système : message traduit, pas la clé brute.
- [x] `tsc` passe dans les deux paquets.

## Tests à ajouter ou adapter

`backend/src/routes/menus.test.ts` :
- « conserve menuSectionId des cocktails » : menu, une section, deux cocktails ; PUT avec la section sur l'un ; GET : `menuSectionId` attendu sur l'un, `null` sur l'autre.
- « conserve menuSectionId des bouteilles » : même scénario avec `bottles`.
- « refuse une section d'un autre menu » : 400 ; les `MenuCocktail` d'avant sont toujours en base.
- « rollback si slug dupliqué » : menu A avec un cocktail, menu B de slug `pris` ; PUT A `{ slug: 'pris', cocktails: [] }` : 409, A a toujours son cocktail.
- « 404 sur menu inexistant » avec `cocktails` dans le body.
- « 403 si on change slug ou type d'aperitifs », « 200 si on change seulement name », « 200 si le slug envoyé est identique ».
- DELETE `aperitifs` : `res.body.error` différent de `'errors.cannotDeleteDefaultMenu'`.

Pas de test frontend obligatoire (changement de type uniquement). Les tests de `MenuEditPage` arrivent avec E-07.

## Points d'attention

- Données déjà perdues : les affectations de section ont été effacées à chaque sauvegarde depuis l'ajout de la fonctionnalité. Rien à migrer ; l'admin devra re-ranger ses cocktails. À mentionner dans les notes de version.
- Le front envoie `menuSectionId: null` pour « sans section » : `null` doit rester valide.
- Supprimer une section met `menuSectionId` à NULL (`onDelete: SetNull`, `backend/prisma/schema.prisma:152`). Une section supprimée ailleurs entre le chargement et la sauvegarde donnera un 400 : comportement attendu.
- Les fichiers `backend/src/i18n/*.json` sont aussi modifiés par A-10 et C-12 : conflits triviaux, mais ne pas lancer ces tâches en parallèle.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : PUT /menus/:id transactionnel, `menuSectionId` conservé (cocktails et bouteilles) et contrôlé, 404 sur menu inexistant, slug et type des menus système verrouillés (403), clés i18n ajoutées, type `MenuInput` complété. 9 tests ajoutés et 1 complété dans `menus.test.ts`, couverture delta 100 %. Branche `fix/A-02-menu-sections-save`, PR #27.
