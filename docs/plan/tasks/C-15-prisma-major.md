---
id: C-15
title: "Dépendances lot 7 : Prisma 7 (client sans moteur Rust, adapter SQLite)"
phase: C
lane: deps
criticite: moyenne
effort: L
status: done
owner: agent
depends_on: [B-01, B-04, B-07, C-01, C-02]
touches: [backend/package.json, backend/package-lock.json, backend/prisma/, backend/prisma.config.ts, backend/src/lib/prisma.ts, backend/src/lib/databasePath.ts, backend/src/test/, backend/Dockerfile, backend/.dockerignore, backend/.gitignore, backend/docker-entrypoint.sh, backend/eslint.config.js, backend/vitest.config.ts, backend/src/index.ts, backend/src/services/, backend/src/routes/, backend/src/middleware/errorHandler.ts, backend/src/bootstrap/ensureAdmin.ts, backend/AGENTS.md, AGENTS.md, README.md]
sources: ["08-dependencies.md §3.1", "08-dependencies.md §4", "08-dependencies.md §5"]
branch: chore/C-15-prisma-major
pr: https://github.com/Lulu300/carta-cocktail/pull/103
---

## Contexte

Prisma 7 change en profondeur la façon dont le client est généré et se connecte : nouveau générateur `prisma-client`, configuration dans `prisma.config.ts`, driver adapter obligatoire (better-sqlite3 pour SQLite). Pas d'urgence de sécurité (6.19.x reste maintenue), mais rester en 6 devient une dette : Prisma 8 est déjà en RC et retirera probablement `prisma-client-js`. Grâce à C-02 (client unique dans `src/lib/prisma.ts`), la migration ne touche plus qu'un point d'entrée au lieu de 15.

## Problème constaté

- `backend/prisma/schema.prisma` : `provider = "prisma-client-js"`, `url = env("DATABASE_URL")` dans le bloc `datasource`.
- Le seed (`prisma/seed.ts`) et les helpers de test (`src/test/helpers.ts`) créent leur propre `PrismaClient`.
- `src/test/helpers.ts` lance `npx prisma db push --skip-generate --force-reset` : l'option `--skip-generate` n'existe plus en 7.
- `backend/Dockerfile` copie `prisma/` et lance `prisma generate` avant `COPY . .`.
- **Piège du dist-tag** : `prisma@latest` = 8.0.0-rc.22 alors que `@prisma/client@latest` = 7.10.0.
- Chemins SQLite relatifs : Prisma 6 résout `file:./x.db` par rapport au dossier du schéma ; avec l'adapter better-sqlite3 c'est probablement par rapport au `cwd` (non confirmé par la doc).

## Ce qu'il faut faire

1. Installer en épinglant : `npm install @prisma/client@7.10.0 @prisma/adapter-better-sqlite3@7.10.0 better-sqlite3` et `npm install -D prisma@7.10.0`. `@prisma/client`, l'adapter et `better-sqlite3` vont dans `dependencies` (runtime).
2. `schema.prisma` :
   ```prisma
   generator client {
     provider     = "prisma-client"
     output       = "../src/generated/prisma"
     moduleFormat = "cjs"
   }
   datasource db {
     provider = "sqlite"
   }
   ```
   Ajouter `src/generated/` au `.gitignore` du backend (l'entrée obsolète `/src/generated/prisma` devient enfin utile).
3. Créer `backend/prisma.config.ts` : `import 'dotenv/config'`, `defineConfig({ schema, migrations: { path, seed }, datasource: { url: env('DATABASE_URL') } })`.
4. `src/lib/prisma.ts` : instancier avec l'adapter. Mettre aussi à jour `seed.ts` et `test/helpers.ts` pour qu'ils importent ce client ou passent l'adapter.
   ```ts
   import { PrismaClient } from '../generated/prisma/client';
   import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
   export const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
   ```
5. **Chemins absolus** : résoudre `DATABASE_URL` en chemin absolu dans un seul helper (réutilisé par `backup.ts`), pour ne plus dépendre du dossier courant.
6. Tests : retirer `--skip-generate`, corriger le chemin réel de la base de test (aujourd'hui `prisma/prisma/test.db`).
7. Dockerfile : copier `prisma.config.ts` avant `generate`, fournir un `DATABASE_URL` factice au build si `generate` l'exige, installer `python3 make g++` dans le stage de build si better-sqlite3 n'a pas de binaire musl.
8. Vérifier que les codes d'erreur `P2002` / `P2025` remontent toujours (les tests d'intégration existants le couvrent).
9. Mettre à jour `backend/AGENTS.md` (pattern du client, version) et le tableau de stack d'`AGENTS.md`.

## Critères d'acceptation

- [x] `prisma` et `@prisma/client` en 7.10.x exactement, aucune trace de 8.0 RC.
- [x] Un seul `new PrismaClient` dans `src/` (plus celui du seed si nécessaire).
- [x] Tous les tests backend verts, couverture inchangée.
- [x] `docker compose up --build` : migrations, seed et API fonctionnels ; export puis import de backup réussis.
- [x] En dev, le backend ouvre bien la base existante (pas une base vide créée ailleurs).

## Tests à ajouter ou adapter

- Test unitaire du helper de résolution de chemin (`file:./x.db`, `file:/abs/x.db`, avec et sans paramètres).
- Le smoke test D-08, s'il existe déjà, doit passer sur l'image.

## Points d'attention

- PR longue : prévoir une fenêtre sans autre tâche backend ouverte sur `prisma/` ou `src/lib/`.
- La restauration de backup réécrit le fichier SQLite : avec better-sqlite3, le handle reste ouvert. C-05 doit déjà faire `$disconnect()` puis reconnecter : revérifier ce scénario.
- Sur NAS ARM : vérifier le binaire better-sqlite3 pour `linux/arm64` musl (lien avec D-05 multi-arch).
- Faire cette tâche avant F-01 (sharp) pour régler une seule fois la question des modules natifs dans l'image.

## Journal

- 2026-10-08 : tâche créée à partir du rapport de dépendances.
- 2026-10-12 : fait (PR #103). Prisma, client et adapter better-sqlite3 épinglés en 7.10.0 (better-sqlite3 ^12.11.1, la 13 sort de la plage de l'adapter). Client `prisma-client` généré dans `src/generated/prisma` par un `postinstall` (comme Prisma 6 au `npm install`), avec `importFileExtension = ""` : sans tsconfig (le `npm ci` de l'image), Prisma émet des imports `.ts` que le code compilé ne charge pas. `resolveDatabasePath` déplacée dans `src/lib/databasePath.ts`, utilisée par l'adapter et par `prisma.config.ts` (chemin absolu, base `prisma/` conservée). `createPrismaClient()` seule fabrique de clients. Découverte : Prisma 6 stockait les `DateTime` en millisecondes Unix (le jeu d'essai n'a que des entiers), l'adapter écrit des chaînes ISO par défaut ; `timestampFormat: 'unixepoch-ms'` garde un seul format par colonne (test qui échoue sans). Entrypoint et `db:check` passés aux options Prisma 7 (`--from-config-datasource`, `--to-migrations`, `--to-schema`) ; sans datasource, `migrate diff --from-migrations` ne signale aucun écart, d'où le `DATABASE_URL` fixé dans `db:check`. `Prisma.dmmf` n'existe plus : `schemaTables()` lit `Prisma.ModelName`. Fichiers ajoutés à `touches` : imports `@prisma/client` (chemin seul), `.dockerignore`, `eslint.config.js`, `vitest.config.ts`, `index.ts`, `README.md` (commandes de vérification de la baseline). 914 tests, couverture des lignes modifiées 100 %. Docker (images `linux/arm64` et `linux/amd64`, `docker build` + `docker run` du backend, pas `docker compose`) sur une copie temporaire du jeu d'essai : baseline `0_init`, 3 migrations, seed, connexion, export puis import de sauvegarde OK ; comptes de lignes identiques avant/après dans toutes les tables ; schéma et données identiques à ceux d'une image `develop` (Prisma 6) ; base vide, redémarrage, refus d'une base sans `Bottle.location` (SHA-256 inchangé), restauration d'une sauvegarde Prisma 6 et retour arrière vers l'image Prisma 6 OK. Banc (remarque de la revue D-17) : `prisma.config.ts` présent dans l'image, `npx prisma migrate status` sans argument fonctionne, lignes de démarrage attendues inchangées, pas de hook 1.12.0 nécessaire ; banc non lancé (à la demande du coordinateur). Pas d'action utilisateur. Pour D-01 : le `postinstall` et l'entrypoint ont besoin du CLI `prisma`. Pour C-26 : la fonction est maintenant dans `src/lib/databasePath.ts`.
