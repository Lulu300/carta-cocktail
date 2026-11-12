---
id: E-40
title: "Éditeur de bouteilles d'une carte : une requête par action de groupe, quel que soit le nombre de bouteilles"
phase: E
lane: frontend
criticite: basse
effort: S
status: review
owner: agent
depends_on: [C-47]
touches: [frontend/src/components/admin/menus/useMenuBottles.ts, frontend/src/pages/admin/MenuBottleEditPage.test.tsx, frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/test/msw/handlers.ts, backend/src/routes/menuBottles.ts, backend/src/routes/menuBottles.test.ts, backend/src/validation/menuBottles.ts, backend/src/services/menuSyncService.ts, backend/src/services/menuSyncService.test.ts, backend/src/i18n/en.json, backend/src/i18n/fr.json]
sources: []
branch: fix/E-40-menu-bottle-group-requests
pr:
---

## Contexte

C-47 (#169) limite chaque adresse cliente à `API_RATE_LIMIT` requêtes par minute sur `/api` (600 par défaut). La relecture des notes de v1.13.0 (PR #174, « User-visible gaps », point 2) relève que l'éditeur de bouteilles d'une carte envoie une requête par bouteille pour certaines actions de groupe. L'humain a choisi un correctif dans le code avant la rc : « Code fix before the rc » (option « batch requests in the menu bottle editor »). L'export de cocktails, l'autre moitié du point, est traité par C-50.

## Problème constaté

Vérifié sur `develop` (589e579) :

- Masquer, afficher ou changer de section un groupe de bouteilles identiques envoyait un `PUT /api/menu-bottles/:id` par bouteille (`useMenuBottles.ts`, mutation `update`, via `settleAll`).
- Remettre un groupe de bouteilles retirées d'une carte système envoyait un `DELETE /api/menu-bottles/menu/:menuId/exclusions/:bottleId` par bouteille (mutation `restore`).
- Le déplacement d'un groupe vers le haut ou le bas (`POST …/reorder`) et le retrait d'un groupe (`POST …/exclusions`) partaient déjà en une requête.

Avec beaucoup de bouteilles identiques, une seule action pouvait approcher la limite et échouer à moitié avec « Too many requests » : une partie des bouteilles changées, l'autre non.

Endpoints existants examinés : `PUT /api/menus/:id` avec `bottles` remplace toute la liste, recrée les lignes (nouveaux id) et est refusé sur les cartes système (`errors.systemMenuBottlesManaged`) ; `POST …/reorder` ne change que les positions. Aucun ne couvre ces deux actions.

## Ce qu'il faut faire

1. Backend : `PUT /api/menu-bottles/menu/:menuId/entries` (`{ ids, isHidden?, menuSectionId? }`, schéma `MenuBottleGroupUpdate`) applique le même changement à plusieurs lignes d'une carte, dans une transaction. Mêmes règles que `PUT /:id` : un id qui n'est pas une ligne de cette carte répond 404, une section d'une autre carte 400 (`assertSectionInMenu`). Pas de position (chaque ligne garde la sienne). Cartes système comprises, comme la route unitaire.
2. Backend : `POST /api/menu-bottles/menu/:menuId/exclusions/restore` (`{ bottleIds }`, schéma `MenuBottleIds`, partagé avec le retrait) remet plusieurs bouteilles, dans une transaction, en fin de carte dans l'ordre donné. `restoreBottle` devient `restoreBottles` (une liste) et sert aussi la route unitaire, conservée.
3. Frontend : les mutations `update` et `restore` de `useMenuBottles` appellent ces endpoints (`menuBottles.updateEntries`, `menuBottles.restore` avec une liste). `settleAll` disparaît.

## Critères d'acceptation

- [x] Masquer, afficher ou changer de section un groupe envoie une seule requête, quel que soit le nombre de bouteilles.
- [x] Remettre un groupe de bouteilles retirées envoie une seule requête.
- [x] Les deux endpoints valident avec zod (`validate()`), écrivent dans une transaction (rien d'appliqué en cas de refus) et suivent les règles des routes unitaires (lignes de la carte, section de la carte, exclusions des cartes système).
- [x] À l'écran, le comportement est le même qu'avant (affichage immédiat, retour en arrière avec un toast en cas de refus), sauf qu'un refus laisse tout le groupe inchangé au lieu d'une partie.
- [x] Messages des nouveaux endpoints traduits (en, fr).

## Tests à ajouter ou adapter

- `backend/src/routes/menuBottles.test.ts` : les deux nouveaux endpoints (cas nominal, carte système, français, ligne d'une autre carte, section d'une autre carte, carte inconnue, liste vide, doublon, position ignorée, une bouteille non retirée → rien remis).
- `backend/src/services/menuSyncService.test.ts` : `restoreBottles` (ordre, doublon, tout ou rien dans une transaction).
- `frontend/src/pages/admin/MenuBottleEditPage.test.tsx` : faux backend sur les nouveaux endpoints ; un groupe de 40 bouteilles masqué en une requête ; changement de section et remise en une requête ; refus d'un groupe.
- `frontend/src/services/api.test.ts` : `updateEntries` et `restore`.

## Points d'attention

- Les routes unitaires `PUT /api/menu-bottles/:id` et `DELETE …/exclusions/:bottleId` restent (API publique de l'instance), mais l'éditeur ne s'en sert plus.
- E-37 (`todo`) touche aussi `frontend/src/services/api.ts`, `api.test.ts` et `test/msw/handlers.ts`, dans d'autres blocs : conflit de merge possible mais simple.

## Journal

- 2026-11-12 : tâche créée et traitée à partir de la relecture de la PR #174 (moitié « éditeur de bouteilles » du point 2 des « User-visible gaps »). Faits vérifiés sur `develop` (589e579) : `settleAll` sur `menuBottlesApi.update` et `menuBottlesApi.restore`, aucun endpoint de groupe pour ces deux actions. Ajout de `PUT …/menu/:menuId/entries` et `POST …/exclusions/restore`, transactions comprises. Un refus laisse désormais tout le groupe inchangé (avant : la partie déjà acceptée restait appliquée).
- Notes de version : dans l'éditeur de bouteilles d'une carte, masquer, afficher, changer de section ou remettre un groupe de bouteilles envoie une seule requête, quel que soit le nombre de bouteilles : l'action n'atteint plus la limite `API_RATE_LIMIT`, et un refus laisse tout le groupe inchangé. Aucune action requise.
