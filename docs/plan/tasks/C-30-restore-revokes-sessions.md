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
touches: [backend/src/services/backupService.ts, backend/src/services/sessionFloor.ts, backend/src/index.ts, backend/src/routes/backup.test.ts, backend/AGENTS.md, .gitignore, docs/plan/tasks/C-25-logout-everywhere-ui.md]
sources: []
branch: fix/C-30-restore-revokes-sessions
pr: "#93"
---

## Contexte

C-11 révoque les tokens par `User.tokenVersion` : le token porte la version (`tv`), un changement de mot de passe ou `POST /api/auth/logout-all` l'incrémente, et `verifyToken` refuse toute version différente. C-05 restaure une sauvegarde en remplaçant le fichier SQLite entier, table `User` comprise. Relevé à la revue de la PR #82 (C-11) et noté dans les Points d'attention de C-25. Prérequis de v1.11.0 (décision humaine), la version qui livre C-11.

## Problème constaté

- La restauration ramène la ligne `User` de la sauvegarde, donc son `tokenVersion`. Un token révoqué après la date de la sauvegarde (changement de mot de passe, « Se déconnecter partout ») porte de nouveau la bonne version et redevient valable jusqu'à son expiration (7 jours par défaut). La révocation promise par C-11 est annulée.
- Une sauvegarde antérieure à v1.11.0 n'a pas la colonne : la migration de C-11 l'ajoute au redémarrage, à 0. La version repart de 0 et remonte à chaque changement de mot de passe ou « Se déconnecter partout », ce qui rend valables un à un les tokens de version 0, 1, 2… émis avant la restauration.
- Le mot de passe de la sauvegarde revient avec elle : c'est la sémantique d'une restauration, pas un défaut.

## Ce qu'il faut faire

1. `backend/src/services/backupService.ts`, pendant la bascule de `restoreBackup` : lire la plus haute `tokenVersion` de la base courante juste avant de fermer les connexions, puis poser sur chaque utilisateur de la base restaurée `tokenVersion = MAX(sa version, version courante) + 1`, avant la copie `pre-restore` et le `rename`. Toutes les sessions sont révoquées, celle qui a lancé la restauration comprise.
2. Sauvegarde sans colonne (décision humaine, revue de la PR #93) : « plancher de session ». La restauration écrit la version courante dans `<base>.session-floor`, à côté de la base. Au démarrage suivant, `main()` (`backend/src/index.ts`), une fois les migrations passées et avant `listen`, pose `tokenVersion = MAX(tokenVersion, plancher) + 1`, puis supprime le fichier. Le fichier reste en place si la restauration échoue : appliqué sur la base précédente, il coûte une déconnexion de plus.

## Critères d'acceptation

- [x] Après la restauration d'une sauvegarde de version plus basse que la base courante, un token émis avant la restauration (ancien ou courant) est refusé (401).
- [x] Même chose pour une sauvegarde de version plus haute que la base courante.
- [x] Sauvegarde sans colonne : après le redémarrage (migration puis plancher), les tokens de version 0 à la version courante sont refusés, y compris après un nouveau changement de mot de passe.
- [x] Fichier de plancher absent : rien ne change. Fichier resté en place (appliqué deux fois) : une déconnexion de plus, rien d'autre.
- [x] La mise à jour de la version fait partie de la bascule : un échec avant le `rename` laisse la base courante intacte, sans copie `pre-restore` orpheline ; un échec après remet la base précédente avec sa propre version. Un plancher écrit reste en place (une déconnexion de plus au démarrage suivant).
- [x] Le mot de passe de la sauvegarde n'est pas modifié.

## Tests à ajouter ou adapter

- `backup.test.ts` : version de la sauvegarde plus basse (0, base courante à 3 → 4, tokens 0 à 3 refusés) ; plus haute (5, base courante à 2 → 6) ; mot de passe de la sauvegarde ramené (connexion avec l'ancien mot de passe, refus du nouveau) ; base courante sans utilisateur (version 1) ; échec de la mise à jour (trigger qui bloque l'`UPDATE` : 500, données et session gardées, aucun fichier temporaire ni copie `pre-restore`) ; sauvegarde sans colonne (plancher écrit, migration rejouée, plancher appliqué, tokens 0 à 3 refusés, toujours refusés après un changement de mot de passe) ; rollback d'une sauvegarde sans colonne (plancher gardé ; appliqué, il refuse seulement le token de version 0).
- `sessionFloor.test.ts` : fichier absent ; plancher appliqué puis fichier supprimé ; fichier resté en place (une seule incrémentation) ; suppression impossible (révocation gardée, avertissement) ; contenu invalide ou fichier illisible (démarrage refusé, fichier et version inchangés) ; colonne absente (démarrage refusé avec `npm run db:deploy`, fichier gardé).
- Les appels authentifiés faits après une restauration réussie utilisent la version courante de l'admin. Les tests de rollback gardent un token de version 0 : ils vérifient que la base précédente revient avec sa version.

## Points d'attention

- **Plancher illisible** (contenu qui n'est pas un entier positif, erreur de lecture) : le backend refuse de démarrer, avec un message qui nomme le fichier et la marche à suivre (changer `JWT_SECRET`, ce qui révoque tous les tokens, puis supprimer le fichier). Démarrer sans plancher rouvrirait sans bruit les sessions révoquées, et aucune autre valeur n'est sûre. L'écriture passe par un fichier temporaire renommé : un arrêt brutal ne laisse pas de fichier à moitié écrit.
- **Plancher non supprimable** (droits) : la révocation est faite, un avertissement est journalisé ; chaque démarrage suivant déconnecte l'admin une fois de plus.
- Hors Docker, démarrer sans `npm run db:deploy` après la restauration d'une sauvegarde antérieure à v1.11.0 : le backend refuse de démarrer avec un message qui nomme le fichier et demande `npm run db:deploy` d'abord. Le fichier reste en place et s'applique après la migration. L'écran de C-22 demande déjà `npm run db:deploy` avant le redémarrage.
- **Plancher et rollback** : la restauration ne retire jamais le plancher qu'elle a écrit. Le retirer avant le rollback pouvait masquer l'erreur d'origine et empêcher le rollback (échec de `rmSync`), ou laisser en place un fichier restauré sans colonne si le rollback échouait. Gardé, il coûte au pire une déconnexion de plus.
- `*.session-floor*` est dans `.gitignore` : une restauration locale en dev ne laisse pas de fichier à committer par erreur.
- **Restaurations à la main** : la procédure du README pour une sauvegarde d'avant les migrations, la restauration manuelle d'une sauvegarde de plus de 200 Mo (notes de v1.10.0) ou la remise en place d'une copie `pre-migrate-*.db` ou `pre-restore-*.db` ne passent pas par `restoreBackup`. Elles ramènent la `tokenVersion` de la copie, et avec elle les tokens révoqués depuis. Recommandation : changer `JWT_SECRET` après une restauration à la main (ligne « Notes de version » ci-dessous, à reprendre dans `UPGRADING.md` et le README par la PR de notes).
- La version courante est lue après le checkpoint du WAL, juste avant la fermeture des connexions. Une écriture qui arrive pendant la bascule est perdue, comme toute écriture de cet intervalle (limite de C-05) ; un changement de mot de passe à ce moment-là pourrait émettre un token de la même version que l'admin restauré (il faut connaître le mot de passe courant).
- Une base courante sans colonne (sauvegarde ancienne restaurée, backend pas encore redémarré) ne peut pas lancer de restauration : `authMiddleware` répond déjà 500. Le plancher en attente ne peut donc pas être écrasé.
- Écran de restauration (C-22, `SettingsPage`) : sans rapport, la page se recharge et l'admin arrive sur la page de connexion ; avec rapport, le bouton « Recharger la page » mène au même endroit. Aucun texte ne promet que la session reste ouverte : l'écran n'est pas trompeur. Le dire explicitement (se reconnecter avec le mot de passe de la sauvegarde) et mettre à jour le commentaire de `handleBackupImport` font l'objet de C-31.

## Journal

- 2026-10-11 : tâche créée (décision humaine, prérequis de v1.11.0), à partir du point d'attention de C-25 relevé à la revue de la PR #82.
- 2026-10-11 : fait (PR #93). `highestLiveTokenVersion()` (agrégat Prisma sur la base courante, lu après `checkpointWal()` et avant `$disconnect()`) et `raiseRestoredTokenVersion()` (client jetable sur le fichier restauré : `PRAGMA table_info("User")`, puis `UPDATE "User" SET "tokenVersion" = MAX("tokenVersion", ?) + 1`). Le `$disconnect()` du client jetable reporte le WAL dans le fichier (vérifié). Tests dans `backup.test.ts`, `currentSessionHeader()` pour les appels après restauration ; helper `withDatabaseFile()` partagé par les helpers qui ouvrent une base temporaire. `backend/AGENTS.md` (règles d'auth) ajouté à `touches`. Point d'attention de C-25 retiré, renvoi vers C-30. Nouvelle tâche : C-31 (dire à l'admin qu'il doit se reconnecter après une restauration).
- 2026-10-11 : revue de la PR #93 (7 points). (1) Décision humaine : plancher de session pour les sauvegardes sans colonne, `services/sessionFloor.ts` (`writeSessionFloor`, `removeSessionFloor`, `applySessionFloor`), appelé par `main()` avant `listen` ; `backend/src/index.ts` et `sessionFloor.ts` ajoutés à `touches`. La parade « changer le mot de passe » est retirée : elle rouvrait les tokens un par un. (2) Restaurations à la main : point d'attention et recommandation `JWT_SECRET`. (3) Tests ajoutés : échec avant le `rename` (trigger), mot de passe de la sauvegarde. (4) L'`UPDATE` passe avant la copie `pre-restore` : un échec ne laisse plus de copie orpheline. (5) `backend/AGENTS.md` précise les deux cas. (6) C-31 : commentaire de `SettingsPage.tsx` ajouté. (7) Base courante sans utilisateur testée. Branche rebasée sur `develop` (#91, #92).
- 2026-10-12 : deuxième revue de la PR #93 (3 points). (1) La restauration garde le plancher en cas d'échec au lieu de le retirer avant le rollback ; `removeSessionFloor` supprimé ; test du rollback mis à jour (plancher gardé, appliqué : une déconnexion de plus). (2) Colonne absente au démarrage : message qui nomme le fichier et demande `npm run db:deploy` d'abord (test ajouté, vérifié avec `node dist/index.js`) ; `hasTokenVersionColumn()` partagée par la restauration, le démarrage et les tests. (3) `*.session-floor*` dans `.gitignore`, ajouté à `touches`.
- Notes de version : après une restauration, toutes les sessions sont fermées, celle qui a restauré comprise ; l'admin se reconnecte avec le mot de passe de la sauvegarde. Pour une sauvegarde antérieure à v1.11.0, la révocation a lieu au démarrage qui suit la restauration (fichier `<base>.session-floor` à côté de la base, supprimé une fois appliqué) ; si ce fichier est illisible, ou hors Docker si les migrations n'ont pas tourné, le backend refuse de démarrer et indique quoi faire. Recommandé : après une restauration à la main (procédure du README, sauvegarde de plus de 200 Mo, copie `pre-migrate-*.db` ou `pre-restore-*.db` remise en place), changer `JWT_SECRET`.
