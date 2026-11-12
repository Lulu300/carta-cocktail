---
id: E-47
title: "Message propre à l'écran de sauvegarde quand le proxy coupe un export ou une restauration (504)"
phase: E
lane: frontend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [E-45]
touches: [frontend/src/pages/admin/SettingsPage.tsx, frontend/src/pages/admin/SettingsPage.test.tsx, frontend/src/i18n/locales/admin/, frontend/src/test/msw/utils.ts, frontend/src/test/msw/utils.test.ts, docs/plan/tasks/E-49-concurrent-backup-restore.md]
sources: []
branch: fix/E-47-backup-timeout-message
pr: "#182"
---

## Contexte

Relevé par la relecture de la PR #180 (E-45), point 1 des « User-visible effects not described ». Depuis E-45, tout 5xx non JSON, dont le 504 de nginx, affiche « The server is not responding, try again in a moment. ». nginx répond 504 quand une restauration dépasse `proxy_read_timeout` (300 s, `location = /api/backup/import`) ou qu'un export dépasse 60 s (`location /api/`, `frontend/nginx.conf.template`).

Décision de l'humain : « Code fix before the rc » — « Before the merge or as a new task: a specific message on the backup screens for a 504 (e.g. 'the restore may still be running: wait, then reload'), with tests; reviewer re-checks. »

## Problème constaté

Vérifié sur `develop` :

- **Restauration** : la route `POST /api/backup/import` (`backend/src/routes/backup.ts`) ne surveille pas la fermeture de la connexion. Après le 504, `restoreBackup()` va jusqu'au bout, qu'elle valide la restauration ou qu'elle revienne en arrière, puis son `res.json()` part dans le vide. Une restauration terminée relève la version des jetons (C-30), ce qui ferme la session de l'admin : au rechargement, il arrive sur la page de connexion. Après une sauvegarde plus ancienne, l'admin ne voit pas le rapport « Restart the backend » ; pour une sauvegarde d'avant la v1.11.0 (sans colonne `tokenVersion`), la vérification de session et la connexion échouent avec une erreur serveur jusqu'au redémarrage. Le bouton « Restore Backup » reste actif, le fichier toujours sélectionné, et rien ne bloque une deuxième restauration côté serveur. « try again in a moment » pousse donc à lancer une deuxième restauration pendant la première.
- **Export** : les en-têtes partent dès que le `VACUUM INTO` est fini. L'archive est ensuite envoyée en continu, et les 60 s de nginx ne comptent qu'entre deux lectures. Un 504 veut donc dire que la copie de la base (ou `buildMetadata`) a pris plus de 60 s, ou qu'un proxy plus strict est placé devant. Le dossier des photos ne retarde pas les en-têtes. Un blocage au milieu du flux couperait le téléchargement : le navigateur le signale comme une erreur réseau, pas comme un 504. L'export ne modifie rien : réessayer est sans risque, mais retombera sans doute sur la même limite.
- **Écran actuel** (Settings > Backup & Restore, `SettingsPage`) : il affiche `err.message`, soit « The server is not responding, try again in a moment. » pour les deux actions.

## Ce qu'il faut faire

1. Dans `SettingsPage` seulement, sur une `ApiError` de statut 504 : un message traduit (en, fr, bundle admin) pour l'export (`settings.backup.exportTimeout`) et un pour la restauration (`settings.backup.restoreTimeout`). Lire `ApiError.status` sans modifier `services/api.ts` (E-46 y travaille).
2. Les autres erreurs gardent leur message.

## Critères d'acceptation

- [x] Un 504 sur la restauration dit qu'elle continue peut-être, de ne pas la relancer, d'attendre puis de recharger, et ce qui suit (déconnexion, redémarrage pour une sauvegarde plus ancienne, journaux si rien ne change).
- [x] Un 504 sur l'export dit que la préparation a dépassé le délai du proxy, qu'un nouvel essai immédiat échouera sans doute, et quoi vérifier.
- [x] Un 502 de nginx et les erreurs du backend gardent leur message.
- [x] Pas de modification de `services/api.ts`, du backend ni de nginx.

## Tests à ajouter ou adapter

- `pages/admin/SettingsPage.test.tsx` : 504 HTML de nginx sur l'export et sur la restauration (message propre, ni « server is not responding » ni succès) ; 502 HTML sur les deux (message d'E-45 gardé). Les tests existants (400, 500 JSON, erreur qui n'est pas une `Error`) passent sans changement.
- `test/msw/utils.test.ts` : nouvel utilitaire `mockProxyError` (page HTML de nginx avec un statut).
- Sondes de sabotage : branche 504 supprimée (2 échecs), tout 5xx traité comme un 504 (4), clés export et restauration inversées (1 et 1), clé fr absente (1), clé en absente (1).

## Points d'attention

- Le backend n'empêche pas deux restaurations simultanées : tâche E-49.
- Hors périmètre : le `requestTimeout` de Node pendant l'envoi d'une grosse sauvegarde (E-48, créée par E-46).

## Journal

- 2026-11-13 : tâche créée et faite (PR #182, branche `fix/E-47-backup-timeout-message`). Message propre au 504 sur l'export et la restauration dans `SettingsPage`, utilitaire de test `mockProxyError`. Tâche E-49 créée pour le verrou de restauration côté backend.
- Notes de version : quand un export ou une restauration de sauvegarde dépasse le délai du proxy (504), l'écran de sauvegarde explique ce qui se passe au lieu de « try again in a moment ». Pour une restauration, elle continue peut-être : ne pas la relancer, attendre puis recharger la page.
