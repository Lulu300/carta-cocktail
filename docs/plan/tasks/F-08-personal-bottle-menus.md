---
id: F-08
title: "Cartes personnelles de bouteilles (apéritifs, digestifs)"
phase: F
lane: frontend
criticite: moyenne
effort: M
status: done
owner: agent
depends_on: [C-06, E-07]
touches: [frontend/src/pages/admin/MenusPage.tsx, frontend/src/pages/admin/MenuBottleEditPage.tsx, frontend/src/components/admin/menus/, frontend/src/services/api.ts, frontend/src/i18n/locales/, frontend/src/pages/admin/MenusPage.test.tsx, frontend/src/pages/admin/MenuBottleEditPage.test.tsx, frontend/src/services/api.test.ts, frontend/src/test/msw/handlers.ts, frontend/src/queries/crud.ts, frontend/src/utils/cocktailSearch.ts, frontend/src/pages/public/useMenuFilter.ts, frontend/src/pages/public/MenuPublicPage.test.tsx, frontend/AGENTS.md, backend/src/routes/menuBottles.ts, backend/src/routes/menuBottles.test.ts, backend/src/validation/menuBottles.ts, backend/src/services/menuSyncService.ts, backend/src/i18n/en.json, backend/src/i18n/fr.json, frontend/src/utils/menuType.ts, frontend/src/utils/menuType.test.ts, frontend/src/pages/public/HomePage.tsx, frontend/src/pages/public/MenuPublicPage.tsx]
sources: ["01-backend-routes.md §H3"]
branch: feature/F-08-personal-bottle-menus
pr: "#227"
---

## Décisions validées (2026-10-09)

- **Cartes de bouteilles.** Les cases `isApero` / `isDigestif` d'une bouteille veulent dire « disponible pour les cartes de ce type ». Les deux cartes système « Apéritifs » et « Digestifs » restent non supprimables (renommables et dépubliables) et contiennent automatiquement toutes les bouteilles cochées, sauf celles que l'admin en a retirées (liste d'exclusions, C-06 et E-07). L'utilisateur peut créer ses propres cartes `APEROS` ou `DIGESTIFS` (ex. « Apéro d'été »), supprimables, composées à la main parmi les bouteilles cochées pour ce type. Décocher une bouteille la retire de toutes les cartes de ce type. Les deux types restent séparés. Le type d'une carte non système ne change plus après sa création.
- **Bouteilles vides.** Une bouteille cochée qui devient vide reste dans les cartes, à sa place, avec sa section et son état masqué ; elle n'est pas affichée sur la carte publique. Si elle ne revient jamais en stock, l'admin la retire à la main.

## Contexte

L'application sert à la fois de carte de cocktails et de carte de boissons servies telles quelles. Après C-06, le backend accepte des cartes personnelles de type `APEROS`/`DIGESTIFS`, jamais remplies automatiquement, et refuse d'y ajouter une bouteille qui n'est pas cochée pour le type. Il manque l'écran : l'admin ne peut aujourd'hui créer que des cartes de cocktails.

## Problème constaté

- `frontend/src/pages/admin/MenusPage.tsx` : la modale de création n'a pas de champ type ; toute nouvelle carte est de type `COCKTAILS`. Les libellés de type sont en dur (`:94-95`).
- `frontend/src/pages/admin/MenuBottleEditPage.tsx` : l'éditeur suppose une carte système. Il n'a ni sélecteur pour ajouter une bouteille, ni bouton pour en retirer une ; il affiche « Synchroniser » sur toutes les cartes de bouteilles (`:344-347`), alors que C-06 refuse `/sync` sur une carte personnelle ; le message de carte vide renvoie à la synchronisation (`:360`).
- `frontend/src/services/api.ts:249-257` : `menuBottles.create` et `menuBottles.delete` existent mais ne sont utilisés par aucune page.

## Ce qu'il faut faire

1. **Création** (`MenusPage`) : ajouter le choix du type dans la modale de création (Cocktails, Apéritifs, Digestifs), `COCKTAILS` par défaut. Le type n'est plus modifiable après création (C-06) : l'afficher en lecture seule ensuite. Libellés des types via i18n.
2. **Redirection** : après création d'une carte `APEROS`/`DIGESTIFS`, ouvrir l'éditeur de bouteilles (`MenuBottleEditPage`) ; pour `COCKTAILS`, l'éditeur actuel.
3. **Composition d'une carte personnelle** (`MenuBottleEditPage`, composants dans `components/admin/menus/`) :
   - sélecteur d'ajout limité aux bouteilles cochées pour le type de la carte (`isApero` pour `APEROS`, `isDigestif` pour `DIGESTIFS`) et absentes de la carte. Les bouteilles vides restent proposées, marquées « vide » ;
   - ajout via `menuBottles.create`, retrait via `menuBottles.delete`, avec le modèle d'enregistrement immédiat d'E-07 (mise à jour optimiste, retour arrière et toast en cas d'erreur) ;
   - une erreur 400 du backend (bouteille non cochée) s'affiche dans un toast traduit.
4. **Cartes système inchangées** (comportement d'E-07) : pas de sélecteur d'ajout, bouton « Retirer » qui crée une exclusion, section « Bouteilles retirées » avec « Remettre », bouton « Synchroniser » conservé, suppression impossible. Utiliser le helper `isSystemMenu()` de `components/admin/menus/` (E-05/E-07). Sur une carte personnelle : pas de bouton « Synchroniser », pas de section « Bouteilles retirées » (le retrait est un retrait simple), suppression de la carte possible depuis `MenusPage` (avec `useConfirm`). Réutiliser le composant du bouton « Retirer » d'E-07 avec un autre handler : sur une carte système, il appelle `menuBottles.exclude(menuId, bottleIds)` (comportement d'E-07) ; sur une carte personnelle, il appelle la suppression simple `menuBottles.delete` pour chaque bouteille du groupe (C-06 refuse `exclude` sur une carte personnelle avec un 400). Le choix du handler passe par `isSystemMenu()`.
5. **Badge « vide »** sur les bouteilles à 0 % dans l'éditeur, si E-07 ne l'a pas déjà fait.
6. **Textes** : clés i18n en `en` et `fr` pour tout le nouveau texte (types, sélecteur, badge, messages d'erreur, carte vide). Le message de carte vide dépend du type de carte (système : cocher des bouteilles ; personnelle : en ajouter avec le sélecteur).

## Critères d'acceptation

- [x] L'admin crée une carte « Apéro d'été » de type Apéritifs ; elle apparaît vide dans la liste.
- [x] Le sélecteur de cette carte ne propose que les bouteilles `isApero`, y compris les vides (marquées « vide »).
- [x] Ajouter puis retirer une bouteille fonctionne sans recharger la page, et survit à un rechargement.
- [x] Une carte personnelle peut être supprimée ; les cartes « Apéritifs » et « Digestifs » ne le peuvent toujours pas.
- [x] Les cartes système gardent le comportement d'E-07 : composition automatique, bouton « Synchroniser », retrait par exclusion et « Remettre », pas d'ajout manuel.
- [x] Une bouteille retirée de la carte système « Apéritifs » reste proposée dans le sélecteur d'une carte personnelle `APEROS`.
- [x] Décocher `isApero` sur une bouteille la fait disparaître de la carte personnelle (vérifié après rechargement).
- [x] Aucun texte en dur ; clés présentes en `en` et `fr`.
- [x] Couverture ≥ 80 % sur les lignes modifiées.

## Tests à ajouter ou adapter

- `MenusPage.test.tsx` : la modale envoie `type: 'APEROS'` quand on le choisit, `COCKTAILS` par défaut ; bouton de suppression absent pour une carte système, présent pour une carte personnelle.
- `MenuBottleEditPage.test.tsx` (créé par E-07) :
  - carte personnelle : le sélecteur ne liste que les bouteilles cochées pour le type et absentes de la carte ; ajout → appel `menuBottles.create` avec `menuId` et `bottleId` ; retrait → `menuBottles.delete` ; échec 400 → retour arrière et toast ;
  - carte personnelle : pas de bouton « Synchroniser », pas de section « Bouteilles retirées » ;
  - carte personnelle : « Retirer » sur un groupe → `menuBottles.delete` pour chaque bouteille, aucun appel à `menuBottles.exclude` ; carte système : « Retirer » → un appel `menuBottles.exclude`, aucun `delete` ;
  - carte système : bouton « Synchroniser » et section « Bouteilles retirées » présents, pas de sélecteur d'ajout ;
  - badge « vide » sur une bouteille à 0 %.
- Test i18n existant (clés `en`/`fr` alignées) vert.

## Points d'attention

- Contrat backend : lire la PR de C-06 (codes d'erreur `errors.bottleNotAllowedInMenu`, `errors.systemMenuBottlesManaged`, `errors.cannotSyncPersonalMenu`, `errors.menuTypeImmutable`).
- `MenusPage.tsx` est aussi modifié par E-05 (pages CRUD) : rebaser après E-05 s'il est mergé, réutiliser son `isSystemMenu()` et ses composants de liste.
- La carte publique d'une carte personnelle passe par la même route que les cartes système (`/menu/:slug`) : vérifier qu'elle affiche bien une carte de bouteilles et masque les vides (E-11).
- Le sélecteur peut devenir long : un filtre texte simple suffit, pas de pagination.

## Journal

- 2026-10-09 : tâche créée à partir des décisions humaines du 2026-10-09 (cartes personnelles de bouteilles). Backend fait par C-06.
- 2026-10-09 : cartes système alignées sur la liste d'exclusions (retrait et « Remettre » faits par E-07) ; type figé repris dans les décisions.
- 2026-10-09 : deuxième revue de la PR #38. Bouton « Retirer » d'E-07 réutilisé avec un handler par type de carte (exclusion sur une carte système, suppression simple sur une carte personnelle) ; test « carte personnelle → aucun appel à `exclude` ».
- 2026-10-12 : revue de la PR #107 (E-07) : « Remettre » une bouteille qui n'est plus cochée pour ce type : `restoreBottle` (`backend/src/services/menuSyncService.ts:194-203`) supprime l'exclusion sans remettre la bouteille ; l'éditeur l'affiche en fin de carte puis elle disparaît des deux listes au rechargement, sans message. Signaler « n'est plus cochée pour ce type » dans la liste des bouteilles retirées, ou l'expliquer dans un toast.
- 2026-11-25 : PR #227 (branche `feature/F-08-personal-bottle-menus`). Faits vérifiés sur `develop` (b36d8f6) : libellés de type déjà traduits (`TYPE_BADGES`), badge « vide » déjà fait par E-07, suppression d'une carte non système déjà offerte par `MenusPage`, carte publique déjà rendue selon `menu.type` (cartes personnelles comprises, bouteilles vides écartées par le serveur). Fait : type au choix dans la modale de création (Cocktails par défaut, aide « non modifiable ensuite ») et ouverture de l'éditeur de la nouvelle carte (`menuEditorPath`, partagé avec les liens « Modifier ») ; sur une carte personnelle, titre, aide et carte vide propres, ni « Synchroniser » ni « Bouteilles retirées », carte « Ajouter des bouteilles » (`BottlesToAdd`) : bouteilles cochées pour le type et absentes de la carte, vides comprises et marquées, regroupées comme dans la carte, filtre texte sur le nom et la catégorie ; « Retirer » sans confirmation ni exclusion. Écart avec l'étape 3 et l'étape 4 : pas un `menuBottles.create` / `delete` par bouteille, mais deux routes de groupe en une transaction, comme celles d'E-40 (une action de groupe = une requête, rien d'appliqué en cas de refus) : `POST /api/menu-bottles/menu/:menuId/entries` (`{ bottleIds }`, carte personnelle seulement) et `POST …/entries/remove` (`{ ids }`, mêmes règles que `DELETE /:id`, exclusion sur une carte système). « Ajouter » ajoute tout le groupe de bouteilles identiques, comme « Retirer » le retire. Point du Journal du 2026-10-12 traité : une bouteille retirée d'une carte système et décochée est signalée dans « Bouteilles retirées », et « Remettre » ne l'affiche plus un instant dans la carte. `getBottleSearchText` déplacé de la carte publique vers `utils/cocktailSearch.ts`, `useCrudMutations` typé par l'entité créée, `BottleGroupActionRow` partagé par les deux listes ; `touches` complété. Rendu réel (build servi par `vite preview`, backend sur une base neuve, Chrome sans interface) : cartes personnelles apéritifs et digestifs côté admin (ajout et retrait conservés après rechargement) et côté public (bouteille vide masquée) ; décocher l'apéritif retire la bouteille de la carte personnelle. Premier chargement public : 135,80 kB (les deux méthodes ajoutées à `services/api.ts`). Sonde : afficher dans la carte une bouteille décochée après « Remettre » fait échouer un test.
- 2026-11-25 : relecture de la PR #227 (approuvée, aucun bloquant), demandes du coordinateur appliquées. Branche mise à jour par un merge d'`origin/develop` (#220 à #226, sans conflit). Ligne « Notes de version » complétée (ouverture de l'éditeur après toute création, note « n'est plus cochée » des cartes système, ajout de tout un groupe). `isBottleMenu` unique dans `utils/menuType.ts` (garde de type), utilisé par la page d'accueil, la carte publique et l'admin ; la copie de `useMenuFilter.ts` disparaît (premier chargement public : 135,85 kB, +0,03 kB pour l'export partagé avec l'admin, mesuré contre le même arbre avec la copie). `MAX_GROUP_BOTTLES` (500, comme `MAX_EXPORT_BATCH`) borne `MenuBottleIds`, `MenuBottleEntryIds` et `MenuBottleGroupUpdate`, comme le prévoyait le Journal d'E-40 : erreur de validation habituelle (400, `details`), test du dépassement sur les cinq routes de groupe. Les tests des cartes de cocktails affirment `errors.bottleNotAllowedInMenu`. L'éditeur de bouteilles d'une carte de cocktails (URL saisie à la main) ouvre l'éditeur de cocktails, sous le même titre ; la clé `menus.bottles.cocktailMenu`, devenue inutile, est retirée. Sondes : sans `.max()` (5 échecs), sans la redirection (1 échec). `touches` complété.
- 2026-11-25 : deuxième relecture de la PR #227 (1 bloquant). Le test de la redirection d'une carte de cocktails affichait l'avertissement « No routes matched location "/admin/menus/5" » : le harnais `renderPage()` a une route factice pour l'éditeur de cocktails, que le test retrouve. `npx vitest run --silent=false` ne montre plus l'avertissement.
- Notes de version : l'admin peut créer ses propres cartes d'apéritifs ou de digestifs (type choisi à la création, non modifiable ensuite) et les composer à la main parmi les bouteilles cochées pour ce type ; « Ajouter » ajoute d'un coup toutes les bouteilles identiques d'un groupe. La création d'une carte, de cocktails comprise, ouvre maintenant son éditeur au lieu de rester sur la liste. Dans « Bouteilles retirées » des cartes système « Apéritifs » et « Digestifs », une bouteille qui n'est plus cochée pour le type est signalée (« Remettre » la retire seulement de la liste), et « Remettre » ne l'affiche plus un instant dans la carte ; ces cartes restent automatiques. Deux routes de groupe s'ajoutent à l'API (`POST /api/menu-bottles/menu/:menuId/entries` et `…/entries/remove`), et les listes des routes de groupe sont bornées à 500 identifiants (400 au-delà). Aucune action requise.
