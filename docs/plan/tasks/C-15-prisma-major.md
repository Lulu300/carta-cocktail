---
id: C-15
title: "Dépendances lot 7 : Prisma 7 (client sans moteur Rust, adapter SQLite)"
phase: C
lane: deps
criticite: moyenne
effort: L
status: todo
owner: agent
depends_on: [B-01, B-04, B-07, C-01, C-02]
touches: [backend/package.json, backend/package-lock.json, backend/prisma/, backend/prisma.config.ts, backend/src/lib/prisma.ts, backend/src/test/, backend/Dockerfile, backend/docker-entrypoint.sh, backend/AGENTS.md, AGENTS.md]
sources: ["08-dependencies.md §3.1", "08-dependencies.md §4", "08-dependencies.md §5"]
branch:
pr:
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

- [ ] `prisma` et `@prisma/client` en 7.10.x exactement, aucune trace de 8.0 RC.
- [ ] Un seul `new PrismaClient` dans `src/` (plus celui du seed si nécessaire).
- [ ] Tous les tests backend verts, couverture inchangée.
- [ ] `docker compose up --build` : migrations, seed et API fonctionnels ; export puis import de backup réussis.
- [ ] En dev, le backend ouvre bien la base existante (pas une base vide créée ailleurs).

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
