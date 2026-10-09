---
id: C-02
title: "Client Prisma unique, mode WAL et arrêt propre"
phase: C
lane: backend
criticite: haute
effort: S
status: todo
owner: agent
depends_on: []
touches: [backend/src/lib/prisma.ts, backend/src/routes/, backend/src/services/, backend/src/index.ts, backend/src/test/]
sources: ["02-backend-data-perf.md §3.4", "01-backend-routes.md §M6"]
branch:
pr:
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

- [ ] `grep -rn "new PrismaClient" backend/src` ne renvoie que `src/lib/prisma.ts` et son test.
- [ ] Au démarrage, `PRAGMA journal_mode` renvoie `wal` sur une base locale (voir partage réseau plus bas).
- [ ] `SQLITE_WAL=false` laisse le mode `delete`.
- [ ] Ctrl+C sur `npm run dev` ou `npm start` : message d'arrêt, sortie en code 0.
- [ ] Tous les tests backend passent sans changer leurs assertions.

## Tests à ajouter ou adapter

- `src/lib/prisma.test.ts` :
  - un `PrismaClient` jetable sur `file:${os.tmpdir()}/wal-<uuid>.db` (option `datasourceUrl`) ; `configureSqlite(client)` ; `PRAGMA journal_mode` renvoie `wal` ; fichiers supprimés à la fin ;
  - avec `SQLITE_WAL=false`, le mode reste `delete`.
- Les tests de routes existants valident le reste : ils passent par le singleton via `helpers.ts`.
- `src/index.ts` est exclu de la couverture (`vitest.config.ts:26`) : pas de test de `main()`.

## Points d'attention

- C-15 (Prisma 7) s'appuie sur ce singleton : avec un seul point d'instanciation, la montée ne touche plus que `src/lib/prisma.ts`, le seed et les helpers de test. Garder toute la configuration du client dans ce fichier.
- **WAL et partage réseau** : le WAL ne fonctionne pas sur un système de fichiers réseau (SMB/NFS). Le dépôt de dev est sur un NAS (`/Users/lulu/NAS-Lulu/...`), donc `backend/prisma/carta_cocktail.db` aussi. En dev, placer la base hors du partage (`DATABASE_URL=file:/chemin/local.db`) ou mettre `SQLITE_WAL=false`. En Docker, le volume nommé `db-data` est local. C'est aussi pourquoi le test utilise `os.tmpdir()`.
- Le WAL crée `-wal` et `-shm` : l'export actuel (`routes/backup.ts:58`) ne copie que le `.db` et peut rater les dernières écritures. C-05 passe à `VACUUM INTO`. Ne pas livrer C-02 en prod sans C-05, ou livrer les deux dans la même release.
- `*.db-wal`/`*.db-shm` sont ajoutés au `.gitignore` par C-01.
- En Docker, `sh -c` (`Dockerfile:18`) ne transmet pas SIGTERM : l'arrêt propre ne sert qu'avec l'`exec` de C-01/D-01.
- Conflits : touche toutes les routes, comme A-02, A-03, A-05, A-10. Deux lignes par fichier : rebaser si une A-xx passe avant. Rien d'autre sur `routes/` pendant la PR (README du plan). C-05 et C-08 dépendent de cette tâche.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
