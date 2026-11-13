---
id: E-50
title: "Restauration de sauvegarde sans réponse HTTP : dire qu'elle continue peut-être"
phase: E
lane: frontend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [E-47]
touches: [frontend/src/pages/admin/SettingsPage.tsx, frontend/src/pages/admin/SettingsPage.test.tsx, frontend/src/i18n/locales/admin/]
sources: []
branch: fix/E-50-restore-network-error-message
pr: "#183"
---

## Contexte

Relevé par la relecture de la PR #182 (E-47), point 2 des « User-visible effects not described ». E-47 affiche `settings.backup.restoreTimeout` sur un 504 de la restauration : elle continue peut-être, ne pas la relancer, attendre puis recharger. Le même dépassement peut arriver sans réponse HTTP : Firefox abandonne une requête après 300 s (`network.http.response.timeout`), le même délai que le `proxy_read_timeout` de nginx sur `location = /api/backup/import`, et un proxy placé devant peut couper la connexion au lieu de répondre 504.

Décision de l'humain : « Code fix before the rc » — « Small frontend task: when the restore request fails without an HTTP answer, show the same 'may still be running, do not start it again' message; tests; reviewer re-checks. »

## Problème constaté

Vérifié sur `develop` :

- **Propagation dans `send()`** (`frontend/src/services/api.ts`) : `await fetch(...)` n'est pas dans un `try`. Sans réponse HTTP, `fetch` rejette avec une `TypeError` (spécification Fetch), que `send()` puis `request()` transmettent telle quelle. Son message est le texte brut du navigateur : « NetworkError when attempting to fetch resource. » (Firefox), « Failed to fetch » (Chrome, Edge), « Load failed » (Safari). Pas d'`AbortError` possible : `backup.importBackup` et `backup.exportBackup` ne passent pas de `signal`, et `SettingsPage` les appelle directement, sans React Query.
- **Écran actuel** (Settings > Backup & Restore) : `showBackupError` affiche `err.message` pour tout ce qui n'est pas une `ApiError` 504. L'admin lit « Failed to fetch » sans savoir que la restauration tourne peut-être encore ; le fichier reste sélectionné et le bouton actif.
- **Export** : pas le même problème. Il ne modifie rien, réessayer est sans risque. Il garde son comportement.

## Ce qu'il faut faire

1. Dans `SettingsPage` seulement, quand la restauration échoue avec une `TypeError` (pas de réponse HTTP) : un message traduit qui dit qu'elle continue peut-être et qu'il ne faut pas la relancer. Ne pas modifier `services/api.ts`.
2. Le 504, les erreurs JSON du backend (dont le 409 du verrou d'E-49) et l'erreur qui n'est pas une `Error` gardent leur message.

## Critères d'acceptation

- [x] Une restauration sans réponse HTTP affiche `settings.backup.restoreNoAnswer` suivi de `settings.backup.restoreMayStillRun` (en, fr, bundle admin), ni le texte du navigateur ni un succès.
- [x] Seule la requête décide « pas de réponse » : une erreur dans le traitement d'une réponse reçue n'affiche pas `restoreNoAnswer`.
- [x] Le 504 garde `settings.backup.restoreTimeout` (suivi du même conseil `restoreMayStillRun`) ; un 400 ou un 409 JSON garde le message du backend ; une erreur qui n'est pas une `Error` garde `common.error`.
- [x] L'export sans réponse HTTP garde son comportement (message du navigateur).
- [x] Pas de modification de `services/api.ts`, du backend ni de nginx.

## Tests à ajouter ou adapter

- `pages/admin/SettingsPage.test.tsx` : erreur réseau sur la restauration (nouveau message, ni `restoreTimeout` ni texte du navigateur ni succès) ; erreur réseau sur l'export (inchangé) ; 409 JSON sur la restauration (message du backend) ; réponse 200 dont le traitement échoue (corps `null`, pas `restoreNoAnswer`). Le test du 504 vérifie en plus l'absence du nouveau message. Les tests existants (400, 502, 504, erreur qui n'est pas une `Error`) passent sans changement.
- Sondes de sabotage sur `SettingsPage.tsx` : voir le Journal.

## Points d'attention

- **Texte voisin plutôt que `restoreTimeout`** : sa première phrase, « The server did not answer in time », est fausse quand la requête échoue vite (réseau perdu, connexion coupée pendant l'envoi). La nouvelle clé dit que la connexion a été coupée avant la réponse (le navigateur ou un proxy a cessé d'attendre, ou le réseau a été perdu) et demande de vérifier la connexion réseau. Pour ne pas dupliquer le texte, chaque clé ne garde que sa cause, et le conseil commun est dans `restoreMayStillRun`, affiché après. Ce conseil nomme la restauration (« Do not start the restore again: … », « Ne relancez pas la restauration : … ») au lieu d'un pronom : la clé se lit seule, et dans le message sans réponse le pronom aurait renvoyé à « la connexion réseau ».
- Le test porte sur `TypeError`, pas sur « tout ce qui n'est pas une `ApiError` » : une erreur qui n'est pas une `Error` ne vient pas d'une requête sans réponse, et garde `common.error`.

## Journal

- 2026-11-13 : tâche créée et faite (PR #183, branche `fix/E-50-restore-network-error-message`). Message `settings.backup.restoreNoAnswer` dans `SettingsPage` pour une restauration qui échoue sans réponse HTTP. Sondes de sabotage : branche réseau supprimée (1 échec), toute erreur de restauration traitée comme sans réponse (6), tout ce qui n'est pas une `ApiError` traité comme sans réponse (1), clé `restoreTimeout` réutilisée (1), même branche appliquée à l'export (1), clé fr absente (1), clé en absente (2).
- 2026-11-13 : suites de la relecture de la PR #183 (approuvée, deux nits). `requestRestore` limite la détection « pas de réponse » à la requête elle-même, avec un test (réponse 200 de corps `null`). Les clés `restoreTimeout` et `restoreNoAnswer` ne gardent que leur cause, et le conseil commun passe dans `restoreMayStillRun`. Sondes de sabotage : détection `TypeError` supprimée (1 échec), erreurs du traitement du succès comptées comme sans réponse (1), tout ce qui n'est pas une `ApiError` (1), conseil commun retiré (2), cause du 504 utilisée sans réponse (1), même branche sur l'export (2), clé commune absente en fr (1) et en en (2).
- 2026-11-13 : suite de la seconde relecture de la PR #183 (bloquant de formulation). Dans le message sans réponse, « Do not start it again » / « Ne la relancez pas » suivait « Check your network connection » / « Vérifiez la connexion réseau » : le pronom renvoyait à la connexion. `restoreMayStillRun` commence maintenant par « Do not start the restore again: » / « Ne relancez pas la restauration : ». Les deux messages complets (504 et sans réponse, en et fr) relus tels qu'affichés ; celui du 504 ne change que de ces mots.
- Notes de version : quand une restauration de sauvegarde échoue sans réponse du serveur (le navigateur ou un proxy coupe la connexion après une longue attente), l'écran de sauvegarde dit qu'elle continue peut-être et qu'il ne faut pas la relancer, au lieu du texte brut du navigateur (« Failed to fetch »).
