---
id: C-30
title: "Restauration : révoquer toutes les sessions (tokenVersion)"
phase: C
lane: backend
criticite: haute
effort: S
status: done
owner: agent
depends_on: [C-11, C-05]
touches: [backend/src/services/backupService.ts, backend/src/routes/backup.test.ts, backend/AGENTS.md, docs/plan/tasks/C-25-logout-everywhere-ui.md]
sources: []
branch: fix/C-30-restore-revokes-sessions
pr: "#93"
---

## Contexte

C-11 révoque les tokens par `User.tokenVersion` : le token porte la version (`tv`), un changement de mot de passe ou `POST /api/auth/logout-all` l'incrémente, et `verifyToken` refuse toute version différente. C-05 restaure une sauvegarde en remplaçant le fichier SQLite entier, table `User` comprise. Relevé à la revue de la PR #82 (C-11) et noté dans les Points d'attention de C-25. Prérequis de v1.11.0 (décision humaine), la version qui livre C-11.

## Problème constaté

- La restauration ramène la ligne `User` de la sauvegarde, donc son `tokenVersion`. Un token révoqué après la date de la sauvegarde (changement de mot de passe, « Se déconnecter partout ») porte de nouveau la bonne version et redevient valable jusqu'à son expiration (7 jours par défaut). La révocation promise par C-11 est annulée.
- Le mot de passe de la sauvegarde revient avec elle : c'est la sémantique d'une restauration, pas un défaut.

## Ce qu'il faut faire

1. `backend/src/services/backupService.ts`, pendant la bascule de `restoreBackup` : lire la plus haute `tokenVersion` de la base courante juste avant de fermer les connexions, puis poser sur chaque utilisateur de la base restaurée `tokenVersion = MAX(sa version, version courante) + 1`, avant le `rename`. Toutes les sessions sont révoquées, celle qui a lancé la restauration comprise.
2. Sauvegarde sans colonne `tokenVersion` (faite avant v1.11.0) : étudier ce qui peut être fait proprement, sinon décrire le risque restant.

## Critères d'acceptation

- [x] Après la restauration d'une sauvegarde de version plus basse que la base courante, un token émis avant la restauration (ancien ou courant) est refusé (401).
- [x] Même chose pour une sauvegarde de version plus haute que la base courante.
- [x] Une sauvegarde sans colonne `tokenVersion` se restaure toujours (200) ; le risque restant est décrit ci-dessous et dans la PR.
- [x] La mise à jour de la version fait partie de la bascule : un échec avant le `rename` laisse la base courante intacte, un échec après remet la base précédente avec sa propre version.
- [x] Le mot de passe de la sauvegarde n'est pas modifié.

## Tests à ajouter ou adapter

- `backup.test.ts` : version de la sauvegarde plus basse (0, base courante à 3 → 4) ; plus haute (5, base courante à 2 → 6) ; sauvegarde sans colonne (colonne absente après la restauration, puis migration de C-11 rejouée comme au redémarrage).
- Les appels authentifiés faits après une restauration réussie utilisent la version courante de l'admin. Les tests de rollback gardent un token de version 0 : ils vérifient que la base précédente revient avec sa version.

## Points d'attention

- **Sauvegarde antérieure à v1.11.0 (sans colonne)** : la restauration ne peut pas écrire la version. Jusqu'au redémarrage, toute route authentifiée et la connexion répondent 500 (limite connue, C-22). Au redémarrage, la migration de C-11 ajoute la colonne à 0. Les tokens émis par cette instance avec `tv: 0` et pas encore expirés redeviennent valables, y compris ceux révoqués depuis : ce sont ceux émis sous v1.11.0 ou plus avant le premier changement de mot de passe ou « Se déconnecter partout » (les tokens d'avant v1.11.0 n'ont pas de `tv` et restent refusés). Les tokens de version 1 ou plus sont refusés. Parade pour l'admin : après le redémarrage, changer le mot de passe (ou « Se déconnecter partout » quand C-25 sera livrée), ou changer `JWT_SECRET`. Pistes écartées :
  - ajouter la colonne au fichier restauré : au redémarrage, la migration échoue (« duplicate column name ») et le backend ne démarre pas ;
  - ajouter la colonne et inscrire la migration dans `_prisma_migrations` à la main : refait le travail de `prisma migrate deploy` (checksum, ordre), et une sauvegarde à qui il manque une migration plus ancienne (`schema_integrity`) aurait alors une `schemaVersion` trompeuse : `restartRecommended` passerait à `false` ;
  - changer l'`id` de l'admin restauré pour invalider les tokens par `userId` : astucieux, fait grandir l'`id` à chaque restauration et ne couvre pas les `id` d'états plus anciens ;
  - garder un seuil hors de la base : en mémoire, il disparaît au redémarrage, justement quand il sert ; dans un fichier, c'est un nouvel état persistant lu par `verifyToken`, hors périmètre.
- La version courante est lue après le checkpoint du WAL, juste avant la fermeture des connexions. Une écriture qui arrive pendant la bascule est perdue, comme toute écriture de cet intervalle (limite de C-05) ; un changement de mot de passe à ce moment-là pourrait émettre un token de la même version que l'admin restauré.
- Une base courante sans colonne (sauvegarde ancienne restaurée, backend pas encore redémarré) ne peut pas lancer de restauration : `authMiddleware` répond déjà 500.
- Écran de restauration (C-22, `SettingsPage`) : sans rapport, la page se recharge et l'admin arrive sur la page de connexion ; avec rapport, le bouton « Recharger la page » mène au même endroit. Aucun texte ne promet que la session reste ouverte : l'écran n'est pas trompeur. Le dire explicitement (se reconnecter avec le mot de passe de la sauvegarde) fait l'objet de C-31.

## Journal

- 2026-10-11 : tâche créée (décision humaine, prérequis de v1.11.0), à partir du point d'attention de C-25 relevé à la revue de la PR #82.
- 2026-10-11 : fait (PR #93). `highestLiveTokenVersion()` (agrégat Prisma sur la base courante, lu après `checkpointWal()` et avant `$disconnect()`) et `revokeRestoredSessions()` (client jetable sur le fichier restauré : `PRAGMA table_info("User")`, puis `UPDATE "User" SET "tokenVersion" = MAX("tokenVersion", ?) + 1`), appelée après la copie `pre-restore` et avant le `rename`. Le `$disconnect()` du client jetable reporte le WAL dans le fichier (vérifié). Tests : `backup.test.ts`, 3 cas, `currentSessionHeader()` pour les appels après restauration ; helper `withDatabaseFile()` partagé par les helpers qui ouvrent une base temporaire. `backend/AGENTS.md` (règles d'auth) ajouté à `touches`. Point d'attention de C-25 retiré, renvoi vers C-30. Nouvelle tâche : C-31 (dire à l'admin qu'il doit se reconnecter après une restauration).
- Notes de version : après une restauration, toutes les sessions sont fermées, celle qui a restauré comprise ; l'admin se reconnecte avec le mot de passe de la sauvegarde. Après la restauration d'une sauvegarde antérieure à v1.11.0 et le redémarrage, changer le mot de passe admin pour révoquer les tokens émis avant la restauration.
