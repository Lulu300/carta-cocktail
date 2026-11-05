---
id: C-45
title: "Import de bouteilles : synchroniser seulement les bouteilles créées"
phase: C
lane: backend
criticite: haute
effort: S
status: done
owner: agent
depends_on: [C-06, C-10]
touches: [backend/src/services/menuSyncService.ts, backend/src/services/menuSyncService.test.ts, backend/src/routes/bottles.ts, backend/src/routes/bottles.test.ts, docs/plan/tasks/C-06-menu-sync-service.md]
sources: []
branch: fix/C-45-import-sync-scope
pr: "#156"
---

## Décision modifiée (2026-11-05)

- **Avant (C-06, étape 3)** : l'import de bouteilles lance `syncAllBottleMenus`, c'est-à-dire une synchro complète des deux cartes système, puis le retrait des bouteilles non cochées des cartes personnelles.
- **Décision de l'humain** (option retenue, telle quelle) : « Code fix before rc — New task: the bottle import only syncs the menus of the bottles it creates or changes, and no longer removes hand-added bottles (changes the C-06 rule). »
- **Après** : l'import ajoute les bouteilles qu'il crée aux cartes système dont elles relèvent (en fin de liste, visibles, hors section). Il ne touche à aucune autre bouteille des cartes, système ou personnelles.
- **Hors décision, inchangé** : le bouton « Synchroniser » (`POST /menu-bottles/menu/:menuId/sync`) fait toujours la synchro complète de sa carte système. Il ajoute les bouteilles cochées absentes et non exclues, et retire les non cochées. Le changement ne l'impose pas : `syncMenu` sans liste se comporte comme avant. La création et la modification d'une bouteille (`syncBottle`) ne changent pas non plus.

## Contexte

Relevé par la relecture des notes de v1.12.0 (PR #152, écart G1). Depuis C-06 (#99), chaque import de bouteilles synchronise toutes les cartes de bouteilles. La v1.11 permettait de mettre à la main dans « Apéritifs » une bouteille sans `isApero`. C-06 l'interdit désormais (`POST /menu-bottles` refuse les cartes système), mais ces lignes existent encore dans les instances mises à jour.

## Problème constaté

- `menuSyncService.ts` (`syncAllBottleMenus`, appelé par `routes/bottles.ts` à la confirmation de l'import) : `syncMenu` sur les deux cartes système retire toute bouteille non cochée pour le type. Une bouteille mise à la main sans la case cochée quitte la carte publique au premier import, quel que soit son contenu.
- `removeUnavailableBottles` la retire aussi des cartes personnelles du même type.
- Le même appel ajoute en fin de liste, hors section, toutes les bouteilles cochées absentes, et pas seulement celles du fichier importé.

## Ce qu'il faut faire

1. Sens de « crée ou modifie » pour l'import : l'import ne modifie jamais une bouteille existante. Une ligne identique à une bouteille existante crée une nouvelle bouteille (`duplicatesCreated`), et les résolutions ne connaissent que `import` et `skip`. La synchro porte donc sur les bouteilles créées.
2. `syncMenu(db, menuId, onlyBottleIds?)` : un ensemble facultatif borne les ajouts et les retraits. Le filtre se fait en mémoire, pas dans la requête : une liste de 2 000 ids pourrait dépasser la limite de paramètres de SQLite. Sans ensemble, le comportement ne change pas (bouton « Synchroniser »).
3. `syncNewBottles(db, bottleIds)` remplace `syncAllBottleMenus` et `removeUnavailableBottles`, que l'import était seul à appeler. La fonction lance `syncMenu` borné sur les deux cartes système. Les cartes personnelles n'ont rien à retirer : une bouteille créée n'est encore dans aucune carte.
4. `POST /bottles/import/confirm` : lots créés par `createManyAndReturn` (ids seulement), ids transmis à `syncNewBottles`, toujours dans la transaction.

## Critères d'acceptation

- [x] Après un import, les lignes `MenuBottle` existantes sont inchangées (place, section, état masqué) dans les cartes système et personnelles, bouteilles non cochées comprises.
- [x] Les bouteilles importées cochées rejoignent la carte système de leur type, en fin de liste, visibles, hors section, par catégorie puis nom. Elles ne vont jamais dans une carte personnelle.
- [x] Une bouteille cochée déjà présente en base mais absente d'une carte système n'est pas ajoutée par l'import.
- [x] Les exclusions (C-06, E-07) tiennent : une bouteille exclue n'est jamais ajoutée et reste exclue.
- [x] Le bouton « Synchroniser » garde son comportement.
- [x] Un échec de la synchro annule toujours tout l'import ; 2 000 bouteilles s'importent toujours en moins de 5 s.

## Tests à ajouter ou adapter

- `menuSyncService.test.ts`, `syncNewBottles` (remplace les tests de `syncAllBottleMenus`) :
  - nouvelles bouteilles en fin de liste des deux cartes système, visibles, sans section, par catégorie puis nom ;
  - bouteille non cochée mise à la main conservée avec sa section et son état masqué, dans la carte système et dans une carte personnelle ;
  - bouteille cochée absente non ajoutée ;
  - bouteille exclue jamais ajoutée ;
  - carte système manquante ignorée.
- `bottles.test.ts` : import avec une bouteille non cochée dans « Apéritifs » (section, masquée), « Digestifs » et une carte personnelle, plus une exclusion. Toutes les lignes existantes et l'exclusion sont intactes, et une seule ligne est ajoutée : la bouteille importée, position 1, sans section, visible.
- Tests existants verts : import de 3 bouteilles, 1 000 et 2 000 bouteilles, « mêmes cartes quelle que soit la route », échec de synchro.

## Points d'attention

- Une bouteille non cochée mise à la main en v1.11 reste dans sa carte jusqu'au premier « Synchroniser » de cette carte, ou jusqu'à sa propre modification. `PUT /bottles/:id` lance `syncBottle`, qui la retire des cartes du type où elle n'est pas cochée (règle C-06 inchangée). Ce n'est pas dans la décision ; les notes de version doivent le dire.
- Note de C-06 sur le premier déploiement : seul le bouton « Synchroniser » ajoute désormais les bouteilles cochées absentes (vides comprises). L'import ne le fait plus.
- C-43 et C-44 modifient `utils/bottlesImport.ts`. Cette tâche ne touche que la fin de `/import/confirm` dans `routes/bottles.ts`.

## Journal

- 2026-11-05 : tâche créée après la décision de l'humain sur l'écart G1 de la relecture des notes de v1.12.0 (#152).
- 2026-11-05 : fait (PR #156). `syncMenu` prend un ensemble facultatif d'ids, et `syncNewBottles` remplace `syncAllBottleMenus` et `removeUnavailableBottles`. L'import crée ses lots avec `createManyAndReturn` et ne synchronise que les bouteilles créées. L'import ne modifie aucune bouteille existante : « crée ou modifie » se réduit à « crée ». Le bouton « Synchroniser » et `syncBottle` ne changent pas. Ligne ajoutée au Journal de C-06 (règle changée) ; `touches` : `C-06-menu-sync-service.md`.
- 2026-11-05 : revue de la PR #156 (approuvée). Commentaire de `POST /bottles` corrigé (il nommait `syncAllBottleMenus`) ; renvoi vers C-45 dans le point d'attention « premier déploiement » de C-06. Rebasé sur `develop` (C-44, #155).
- Notes de version : pas d'action, `breaking: false`. Remplace la ligne G1 prévue pour v1.12.0. Un import de bouteilles ajoute les bouteilles qu'il crée aux cartes « Apéritifs » et « Digestifs » (en fin de liste, hors section) et ne retire plus rien : une bouteille mise à la main dans une carte y reste, cochée ou non. Seul le bouton « Synchroniser » d'une carte système retire les bouteilles non cochées pour son type et ajoute les bouteilles cochées absentes, vides comprises. Modifier une bouteille non cochée la retire aussi des cartes de ce type.
