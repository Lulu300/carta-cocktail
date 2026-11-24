---
id: E-53
title: "Sauvegarde : désactiver la restauration pendant un export du même onglet, et l'inverse"
phase: E
lane: frontend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [E-49]
touches: [frontend/src/pages/admin/SettingsPage.tsx, frontend/src/pages/admin/SettingsPage.test.tsx, frontend/src/test/msw/utils.ts]
sources: []
branch: fix/E-53-backup-buttons-exclusive
pr: "#186"
---

## Contexte

Relevé par la relecture de la PR #185 (E-51), « User-visible effects not described » et dernier nit. E-49 (#184) refuse une seconde restauration (409). E-51 refuse aussi un export pendant une restauration (409 `errors.restoreInProgress`) et une restauration pendant un export (409 `errors.exportInProgress`). Dans Settings > Backup & Restore, le bouton « Restore Backup » reste actif pendant un export lancé depuis le même onglet. multer reçoit tout le fichier avant `restoreBackup()` : un clic envoie l'archive entière (jusqu'à 200 Mo), puis reçoit le 409.

Décision de l'humain : « Code fix before the rc » — « Small frontend task (author + reviewer): disable 'Restore Backup' while an export of the same tab runs (and vice versa), with tests. »

## Problème constaté

Vérifié sur `develop` (`frontend/src/pages/admin/SettingsPage.tsx`) :

- **État suivi par l'écran** : `backupExporting` (vrai du clic jusqu'à la fin de `backup.exportBackup()`) et `backupImporting` (vrai de la confirmation jusqu'à la réponse de la restauration ou son erreur). Les deux reviennent à `false` dans un `finally`, après un succès comme après un échec.
- **Fin de l'export côté client** : `backup.exportBackup()` (`services/api.ts`) attend `send()` (en-têtes reçus), puis `res.blob()` (archive lue en entier), puis déclenche le téléchargement du blob. `backupExporting` ne repasse donc à `false` qu'une fois toute l'archive reçue. Côté serveur, E-51 libère le verrou à la fermeture de la réponse, au plus tard à ce moment.
- **Boutons** : « Export Backup » n'était désactivé que par `backupExporting`, « Restore Backup » (et « Select ZIP file ») que par `backupImporting`. Aucun ne tenait compte de l'autre action.

## Ce qu'il faut faire

1. Désactiver « Restore Backup » pendant un export et « Export Backup » pendant une restauration, avec l'état existant (pas de nouvel état).
2. Garder les messages d'E-47/E-50 et l'affichage des 409 du backend tels quels.

## Critères d'acceptation

- [x] Pendant un export, « Restore Backup » est désactivé jusqu'à ce que l'archive soit lue en entier, puis réactivé après le succès comme après un échec (téléchargement coupé, 409).
- [x] Pendant une restauration, « Export Backup » est désactivé, puis réactivé après le succès comme après un échec.
- [x] Le bouton de l'action en cours garde son libellé de chargement existant (`settings.backup.exporting`, `settings.backup.importing`) ; l'autre garde son libellé.
- [x] Pas de nouvel état, pas de modification de `services/api.ts`, du backend ni de nginx.

## Tests à ajouter ou adapter

- `pages/admin/SettingsPage.test.tsx` : export dont l'archive arrive en flux et reste ouverte (« Restore Backup » désactivé, rien téléchargé, puis réactivé à la fin) ; export coupé en cours de téléchargement et export refusé (409) : réactivé ; restauration retenue puis réussie ou refusée (400) : « Export Backup » désactivé, un clic n'envoie rien, puis réactivé. `selectBackupFile()` est extrait de `selectBackupFileAndClickImport()`.
- `test/msw/utils.ts` : `holdApiResponse` accepte un statut (200 par défaut), comme `mockApiResponse`.

## Points d'attention

- **Raison du blocage** : l'écran n'a pas de modèle de bouton désactivé avec sa raison (le seul `aria-describedby` est l'aide du choix d'icône). Selon la consigne, les boutons sont simplement `disabled`, et le bouton de l'action en cours affiche son libellé de chargement existant (« Exporting... », « Restoring... »), juste au-dessus ou au-dessous. Pas de nouveau texte i18n.
- **« Select ZIP file »** reste actif pendant un export : choisir un fichier n'envoie rien.
- **Autre onglet, autre appareil** : rien ne change. Le 409 du backend reste le garde-fou et son message s'affiche comme avant.
- **Restauration sans réponse (E-50)** : le bouton d'export se réactive alors que la restauration tourne peut-être encore. Un export est alors refusé par le 409 d'E-51, dont le message s'affiche ; le message d'E-50 demande déjà d'attendre.

## Journal

- 2026-11-13 : tâche créée et faite (PR #186, branche `fix/E-53-backup-buttons-exclusive`). Les deux boutons dépendent de `backupBusy = backupExporting || backupImporting`. Sondes de sabotage, chacune annulée : « Restore Backup » sans le blocage par l'export (3 échecs), « Export Backup » sans le blocage par la restauration (2), export terminé dès les en-têtes dans `exportBackup` (2), `backupExporting` non remis à `false` après un échec (2), `backupImporting` non remis à `false` après un échec (1).
- Notes de version : pendant un export de sauvegarde, le bouton « Restore Backup » est désactivé jusqu'à la fin du téléchargement, et le bouton d'export l'est pendant une restauration, au lieu d'envoyer toute l'archive pour se la voir refuser.
- 2026-11-13 : hors périmètre, relevé à la relecture de la PR #186 (non bloquant). Dans l'`it.each` de la restauration, `expect(exports.count()).toBe(0)` est vérifié juste après le clic, de façon synchrone : MSW n'aurait pas encore vu la requête même si le bouton était actif, donc cette assertion ne prouve rien seule (`toBeDisabled()` porte le test). À corriger (attendre une microtâche, ou retirer l'assertion) la prochaine fois que ce fichier est touché.
