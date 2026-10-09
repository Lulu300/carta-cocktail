---
id: F-08
title: "Cartes personnelles de bouteilles (apéritifs, digestifs)"
phase: F
lane: frontend
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [C-06, E-07]
touches: [frontend/src/pages/admin/MenusPage.tsx, frontend/src/pages/admin/MenuBottleEditPage.tsx, frontend/src/components/admin/menus/, frontend/src/services/api.ts, frontend/src/i18n/locales/]
sources: ["01-backend-routes.md §H3"]
branch:
pr:
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
4. **Cartes système inchangées** (comportement d'E-07) : pas de sélecteur d'ajout, bouton « Retirer » qui crée une exclusion, section « Bouteilles retirées » avec « Remettre », bouton « Synchroniser » conservé, suppression impossible. Utiliser le helper `isSystemMenu()` de `components/admin/menus/` (E-05/E-07). Sur une carte personnelle : pas de bouton « Synchroniser », pas de section « Bouteilles retirées » (le retrait est un retrait simple), suppression de la carte possible depuis `MenusPage` (avec `useConfirm`). Réutiliser le bouton « Retirer » d'E-07 : seul l'effet backend diffère.
5. **Badge « vide »** sur les bouteilles à 0 % dans l'éditeur, si E-07 ne l'a pas déjà fait.
6. **Textes** : clés i18n en `en` et `fr` pour tout le nouveau texte (types, sélecteur, badge, messages d'erreur, carte vide). Le message de carte vide dépend du type de carte (système : cocher des bouteilles ; personnelle : en ajouter avec le sélecteur).

## Critères d'acceptation

- [ ] L'admin crée une carte « Apéro d'été » de type Apéritifs ; elle apparaît vide dans la liste.
- [ ] Le sélecteur de cette carte ne propose que les bouteilles `isApero`, y compris les vides (marquées « vide »).
- [ ] Ajouter puis retirer une bouteille fonctionne sans recharger la page, et survit à un rechargement.
- [ ] Une carte personnelle peut être supprimée ; les cartes « Apéritifs » et « Digestifs » ne le peuvent toujours pas.
- [ ] Les cartes système gardent le comportement d'E-07 : composition automatique, bouton « Synchroniser », retrait par exclusion et « Remettre », pas d'ajout manuel.
- [ ] Une bouteille retirée de la carte système « Apéritifs » reste proposée dans le sélecteur d'une carte personnelle `APEROS`.
- [ ] Décocher `isApero` sur une bouteille la fait disparaître de la carte personnelle (vérifié après rechargement).
- [ ] Aucun texte en dur ; clés présentes en `en` et `fr`.
- [ ] Couverture ≥ 80 % sur les lignes modifiées.

## Tests à ajouter ou adapter

- `MenusPage.test.tsx` : la modale envoie `type: 'APEROS'` quand on le choisit, `COCKTAILS` par défaut ; bouton de suppression absent pour une carte système, présent pour une carte personnelle.
- `MenuBottleEditPage.test.tsx` (créé par E-07) :
  - carte personnelle : le sélecteur ne liste que les bouteilles cochées pour le type et absentes de la carte ; ajout → appel `menuBottles.create` avec `menuId` et `bottleId` ; retrait → `menuBottles.delete` ; échec 400 → retour arrière et toast ;
  - carte personnelle : pas de bouton « Synchroniser », pas de section « Bouteilles retirées » ;
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
