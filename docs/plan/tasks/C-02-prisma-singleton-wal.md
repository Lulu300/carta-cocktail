---
id: C-02
title: "Client Prisma unique, mode WAL et arrêt propre"
phase: C
lane: backend
criticite: haute
effort: S
status: done
owner: agent
depends_on: []
touches: [backend/src/lib/prisma.ts, backend/src/routes/, backend/src/routes/backup.ts, backend/src/routes/backup.test.ts, backend/src/services/, backend/src/index.ts, backend/src/test/, backend/AGENTS.md]
sources: ["02-backend-data-perf.md §3.4", "01-backend-routes.md §M6"]
branch: fix/C-02-prisma-singleton-wal
pr: 42
---

## Contexte

Chaque fichier de routes crée son propre `PrismaClient`, donc son propre pool de connexions sur le même fichier SQLite. SQLite n'accepte qu'un écrivain à la fois : plusieurs pools multiplient les `database is locked` pendant un import ou une synchro de menus. Un client unique est aussi un prérequis pour C-05 (déconnecter avant de remplacer la base) et pour un arrêt propre du serveur.

## Problème constaté

- 14 instances dans `src/` : `routes/{auth,bottles,categories,categoryTypes,cocktails,ingredients,menuBottles,menuSections,menus,public,settings,shortages,units}.ts` (lignes 6 à 16 selon le fichier) et `services/availabilityService.ts:3`. Une 15e dans `src/test/helpers.ts:12`. `prisma/seed.ts:4` tourne dans un process séparé : à laisser.
- Aucun `PRAGMA journal_mode=WAL` ni `busy_timeout` : la base de dev est en mode `delete` (vérifié avec `sqlite3 backend/prisma/carta_cocktail.db "PRAGMA journal_mode;"`).
- `src/index.ts:4` : `app.listen(...)` sans garder le serveur, sans gestion de `SIGTERM`/`SIGINT`, sans `$disconnect()`, sans handler `unhandledRejection`.

## Ce qu'il faut faire

1. Créer `src/lib/prisma.ts` :
   ```ts
   import { PrismaClient } from '@prisma/client';

   export const prisma = new PrismaClient();

   /** WAL est persistant dans le fichier ; busy_timeout vaut pour la connexion qui l'exécute. */
   export async function configureSqlite(client: PrismaClient = prisma): Promise<void> {
     if (process.env.SQLITE_WAL === 'false') return;
     await client.$queryRawUnsafe('PRAGMA journal_mode = WAL;'); // renvoie une ligne : $queryRaw, pas $executeRaw
     await client.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
   }
   ```
   `busy_timeout` n'agit que sur une connexion du pool. Vérifier dans la doc Prisma 6 si le paramètre d'URL SQLite `socket_timeout` le règle pour tout le pool. Sinon, passer `connection_limit=1` via l'option `datasourceUrl` du constructeur (sans toucher aux compose). Noter le choix dans la PR.
2. Dans les 14 fichiers, remplacer `const prisma = new PrismaClient()` par `import { prisma } from '../lib/prisma'`. Garder l'import de `Prisma` (types) là où il sert.
3. `src/test/helpers.ts` : supprimer `new PrismaClient()` et réexporter le singleton (`export { prisma } from '../lib/prisma'`). Tests et routes partagent alors le même client.
4. `src/index.ts` :
   ```ts
   async function main() {
     await configureSqlite();
     const server = app.listen(config.port, () => console.log(`🍸 Carta Cocktail API running on port ${config.port}`));
     const shutdown = (signal: string) => {
       console.log(`${signal} reçu, arrêt en cours`);
       server.close(async () => { await prisma.$disconnect(); process.exit(0); });
       setTimeout(() => process.exit(1), 10_000).unref();
     };
     process.on('SIGTERM', () => shutdown('SIGTERM'));
     process.on('SIGINT', () => shutdown('SIGINT'));
     process.on('unhandledRejection', (err) => console.error('unhandledRejection', err));
   }
   main().catch((err) => { console.error(err); process.exit(1); });
   ```
5. Rien d'autre : pas de refactor des handlers (C-03).

## Critères d'acceptation

- [x] `grep -rn "new PrismaClient" backend/src` ne renvoie que `src/lib/prisma.ts` et son test.
- [x] Au démarrage, `PRAGMA journal_mode` renvoie `wal` sur une base locale (voir partage réseau plus bas).
- [x] `SQLITE_WAL=false` laisse le mode `delete`.
- [x] Ctrl+C sur `npm run dev` ou `npm start` : message d'arrêt, sortie en code 0.
- [x] Tous les tests backend passent sans changer leurs assertions.

## Tests à ajouter ou adapter

- `src/lib/prisma.test.ts` :
  - un `PrismaClient` jetable sur `file:${os.tmpdir()}/wal-<uuid>.db` (option `datasourceUrl`) ; `configureSqlite(client)` ; `PRAGMA journal_mode` renvoie `wal` ; fichiers supprimés à la fin ;
  - avec `SQLITE_WAL=false`, le mode reste `delete`.
- Les tests de routes existants valident le reste : ils passent par le singleton via `helpers.ts`.
- `src/index.ts` est exclu de la couverture (`vitest.config.ts:26`) : pas de test de `main()`.

## Points d'attention

- C-15 (Prisma 7) s'appuie sur ce singleton : avec un seul point d'instanciation, la montée ne touche plus que `src/lib/prisma.ts`, le seed et les helpers de test. Garder toute la configuration du client dans ce fichier.
- **WAL et partage réseau** : le WAL ne fonctionne pas sur un système de fichiers réseau (SMB/NFS). Le dépôt de dev est sur un NAS (`/Users/lulu/NAS-Lulu/...`), donc `backend/prisma/carta_cocktail.db` aussi. En dev, placer la base hors du partage (`DATABASE_URL=file:/chemin/local.db`) ou mettre `SQLITE_WAL=false`. En Docker, le volume nommé `db-data` est local. C'est aussi pourquoi le test utilise `os.tmpdir()`.
- Le WAL crée `-wal` et `-shm` : l'export actuel (`routes/backup.ts:58`) ne copie que le `.db` et peut rater les dernières écritures. C-05 passe à `VACUUM INTO`. Ne pas livrer C-02 en prod sans C-05, ou livrer les deux dans la même release. *Résolu dans la PR #42 par une garde temporaire (checkpoint et déconnexion, voir Journal) : C-02 peut sortir sans C-05.*
- `*.db-wal`/`*.db-shm` sont ajoutés au `.gitignore` par C-01.
- En Docker, `sh -c` (`Dockerfile:18`) ne transmet pas SIGTERM : l'arrêt propre ne sert qu'avec l'`exec` de C-01/D-01.
- Conflits : touche toutes les routes, comme A-02, A-03, A-05, A-10. Deux lignes par fichier : rebaser si une A-xx passe avant. Rien d'autre sur `routes/` pendant la PR (README du plan). C-05 et C-08 dépendent de cette tâche.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-09 : fait dans la PR #42 (`fix/C-02-prisma-singleton-wal`). `src/lib/prisma.ts` (client unique et `configureSqlite`), importé par les 13 routes, `availabilityService.ts` et `test/helpers.ts`. `index.ts` : WAL avant `listen`, arrêt propre sur SIGTERM/SIGINT (`server.close`, `$disconnect`, code 0, sortie forcée en code 1 après 10 s), `unhandledRejection` journalisé. Deux écarts avec le texte : pas de `PRAGMA busy_timeout`, car Prisma 6.19 règle déjà 5 000 ms sur chaque connexion du pool et le pragma ne touche qu'une connexion (vérifié ; `socket_timeout` dans l'URL règle tout le pool) ; `SQLITE_WAL=false` repasse explicitement en `DELETE`, pour qu'une base déjà en WAL revienne au journal classique. `backend/AGENTS.md` ajouté à `touches` : son modèle de route demandait encore un `PrismaClient` par fichier. Vérifié avec un vrai serveur sur base locale (`npm start` et `tsx watch`) : `wal` au démarrage, `delete` avec `SQLITE_WAL=false`, SIGTERM et SIGINT donnent le message d'arrêt et le code 0, `-wal`/`-shm` supprimés à la sortie (fermeture propre). Couverture des lignes modifiées : 100 %. Nouvelle tâche D-13 (documenter `SQLITE_WAL` dans le README et `.env.example`, hors PR à cause du conflit possible avec C-01 sur le README).
- **Notes de version** : changement non cassant (`breaking: false`). La base passe en mode WAL au démarrage. *Before* : si la base SQLite est sur un partage réseau (SMB/NFS, NAS monté en bind mount), mettre `SQLITE_WAL=false` ; le volume nommé `db-data` par défaut n'est pas concerné. À noter : pendant que le serveur tourne, la base a deux fichiers compagnons `-wal` et `-shm` ; une copie à chaud du seul `.db` peut manquer les dernières écritures. L'export et la restauration de l'application restent fiables en WAL (garde ajoutée après revue, voir ligne suivante) ; C-05 les rend atomiques ensuite.
- 2026-10-09 : corrections après revue (PR #42, option (a) retenue par le coordinateur). **B1** : en WAL, l'export perdait les écritures encore dans `-wal` et une restauration était annulée en silence (les connexions ouvertes relisaient l'ancien WAL puis le recopiaient sur le fichier restauré). `backend/src/routes/backup.ts` et `backend/src/routes/backup.test.ts` ajoutés à `touches` : C-05 et B-07 ne tournent pas en parallèle (C-05 dépend de C-02, B-07 est `todo` et n'aura qu'à rebaser). Garde temporaire : `checkpointWal()` dans `lib/prisma.ts` (`PRAGMA wal_checkpoint(TRUNCATE)`, erreur si le checkpoint est bloqué) ; export : checkpoint avant l'archivage ; import : checkpoint, `prisma.$disconnect()`, suppression de `-wal`/`-shm`/`-journal`, écriture du fichier, `configureSqlite()`. Tests de régression dans `backup.test.ts` (base de test passée en WAL, chemin réel lu par `PRAGMA database_list` pour contourner le chemin relatif corrigé par B-03) : un export après une écriture contient la ligne ; une restauration prend effet sur des écritures plus récentes et tient après une nouvelle écriture et une reconnexion (`integrity_check` = `ok`). Les deux tests échouent sur la version de `develop` (`[]` au lieu de `['Lime']`, et `['Lime', 'Mint', 'Sugar']` au lieu de `['Lime']`). Suggestions appliquées : `index.ts` sort en code 1 si `listen` échoue (EADDRINUSE), `configureSqlite` avertit quand SQLite garde un autre mode que celui demandé. Nouveau `src/index.test.ts` : serveur lancé dans un processus fils, SIGTERM donne le code 0 sans fichiers `-wal`/`-shm` restants, port occupé donne le code 1. Ligne ajoutée à C-05 pour remplacer la garde, note ajoutée à B-07 (`backup.test.ts` existe désormais). Rebase sur `origin/develop` (D-10).
