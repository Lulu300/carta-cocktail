---
id: B-03
title: "Tests backend : isolation, vitesse et factories"
phase: B
lane: backend
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [A-01]
touches: [backend/src/test/, backend/vitest.config.ts, backend/src/app.ts, backend/src/i18n/index.ts]
sources: ["04-tests.md §5.3", "04-tests.md §5.4", "07-devops-history.md §2.9"]
branch:
pr:
---

## Contexte

Les tests backend sont de vrais tests d'intégration (supertest et SQLite, sans mock de la base) : c'est leur force. Mais chaque fichier recrée la base avec `prisma db push` (16 fois, environ 1 s chacune, 25 s au total), la base de test n'est pas là où le code croit la supprimer, la sortie est noyée de logs et il manque des factories pour les menus et les cocktails complets. Le plan va ajouter beaucoup de tests backend (A-02, A-03, A-05, phase C) : il leur faut un socle rapide et lisible.

## Problème constaté

- `backend/src/test/setup.ts:2` et `backend/src/test/helpers.ts:31` : `DATABASE_URL=file:./prisma/test.db`. Prisma résout un chemin SQLite relatif **depuis le dossier du schéma** (`backend/prisma/`) : la base réelle est `backend/prisma/prisma/test.db`, fichier présent sur le disque. `helpers.ts:10` vise `backend/prisma/test.db` : le nettoyage des l.21-24 et l.47-52 supprime un fichier qui n'existe pas. Ça fonctionne grâce à `--force-reset`. `README.md:77` (« created and destroyed automatically ») est faux.
- `helpers.ts:19-39` : `setupTestDatabase()` lance `npx prisma db push --force-reset` dans le `beforeAll` de **chaque** fichier (ex. `backend/src/routes/units.test.ts:7`), avec `fileParallelism: false` (`backend/vitest.config.ts:9`). Principale source de lenteur.
- `helpers.ts:59-76` : `cleanDatabase()` liste les 15 tables à la main ; une table ajoutée plus tard et oubliée ici fuira entre les tests.
- Factories (`helpers.ts:128-228`) : `seedCategory`, `seedUnit`, `seedBottle`, `seedIngredient` et `seedCocktail` existent. **Précision sur la revue** : `seedCocktail` existe, mais sans ingrédients ni instructions. Il manque `seedMenu`, `seedMenuSection`, l'ajout d'un cocktail ou d'une bouteille à un menu, et un cocktail complet. Les tests de `cocktails`, `availability`, `public` et `menus` les construisent à la main avec `prisma.*.create`.
- Bruit : `backend/src/app.ts:30` active `morgan('dev')` même en test ; i18next 25.8.4 affiche une bannière de support à chaque `init` (`backend/src/i18n/index.ts:6`, option `showSupportNotice` non désactivée).
- Le dossier d'upload des tests est traité par A-01 (dépendance déclarée).
- `.github/workflows/ci.yml:42` définit aussi `DATABASE_URL`, mais `setup.ts` l'écrase : valeur sans effet.

## Ce qu'il faut faire

1. **Chemin de la base** : `DATABASE_URL=file:./test.db` dans `setup.ts` et dans l'`execSync` de `helpers.ts`, ce qui donne bien `backend/prisma/test.db`. Aligner `TEST_DB_PATH`. Supprimer à la main l'ancien dossier `backend/prisma/prisma/` (non versionné).
2. **Base créée une seule fois par run** :
   - `backend/src/test/globalSetup.ts` : supprime les fichiers `test.db*`, lance une fois `npx prisma db push --skip-generate --force-reset` ; sa fonction `teardown` supprime les fichiers en fin de run ;
   - `backend/vitest.config.ts` : `globalSetup: ['./src/test/globalSetup.ts']` ;
   - `setupTestDatabase()` ne fait plus que `prisma.$connect()`, `teardownTestDatabase()` que `prisma.$disconnect()`. Signatures inchangées : **aucun fichier de test à modifier**.
3. **`cleanDatabase()` générique**, à partir du schéma :
   ```ts
   import { Prisma } from '@prisma/client';
   const tables = Prisma.dmmf.datamodel.models.map((m) => m.dbName ?? m.name);
   await prisma.$transaction([
     prisma.$executeRawUnsafe('PRAGMA defer_foreign_keys = ON'),
     ...tables.map((t) => prisma.$executeRawUnsafe(`DELETE FROM "${t}"`)),
   ]);
   ```
   `PRAGMA foreign_keys = OFF` est sans effet dans une transaction SQLite ; `defer_foreign_keys` reporte les contrôles au commit, où toutes les lignes ont disparu.
4. **Factories** dans `helpers.ts` (ou dans `src/test/factories.ts`, réexporté par `helpers.ts`) :
   - `seedMenu(overrides)` (slug unique par défaut) ;
   - `seedMenuSection(menuId, overrides)` ;
   - `addCocktailToMenu(menuId, cocktailId, { position, isHidden, menuSectionId })` et `addBottleToMenu(...)` ;
   - `seedFullCocktail({ ingredients?, instructions?, tags? })` : crée unité, catégorie et bouteille au besoin et renvoie le cocktail avec ses relations.
   Migrer deux ou trois tests existants comme exemple, pas davantage.
5. **Bruit** :
   - `app.ts` : `if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));` ;
   - `backend/src/i18n/index.ts` : `showSupportNotice: false` dans `init` (fichier ajouté à `touches`).
6. Mesurer `time npm test` avant et après ; noter les deux durées dans la PR et le Journal.

Hors périmètre : client Prisma unique (C-02, qui modifiera aussi `src/test/`) ; tests de `backup.ts` (C-05) ; une base par worker pour paralléliser ; nettoyage de `ci.yml:42` (D-04) ; README (D-09).

## Critères d'acceptation

- [ ] Après `npm test`, plus de dossier `backend/prisma/prisma/`, et `backend/prisma/test.db` est supprimé en fin de run.
- [ ] `prisma db push` n'est exécuté qu'une fois par run.
- [ ] Durée de `npm test` réduite d'au moins 30 % (mesures avant/après dans la PR).
- [ ] `cleanDatabase()` vide toutes les tables du schéma sans liste écrite à la main.
- [ ] `seedMenu`, `seedMenuSection`, `addCocktailToMenu`, `addBottleToMenu` et `seedFullCocktail` disponibles et utilisées au moins une fois.
- [ ] Plus de lignes morgan ni de bannière i18next dans la sortie des tests.
- [ ] Tous les tests passent ; couverture inchangée ou meilleure.

## Tests à ajouter ou adapter

- `backend/src/test/helpers.test.ts` (nouveau) :
  - insérer une ligne dans chaque modèle via les factories, appeler `cleanDatabase()`, vérifier `count() === 0` pour chaque modèle ;
  - `seedFullCocktail()` renvoie un cocktail avec au moins un ingrédient et une instruction ;
  - `addCocktailToMenu` avec `menuSectionId` : relation persistée.
- Les 16 fichiers existants restent verts sans toucher à leurs `beforeAll`/`afterAll`.
- `npm test && npm test` : la seconde exécution passe, sans état résiduel.

## Points d'attention

- `src/test/**` est exclu de la couverture (`vitest.config.ts:23`) : les helpers ne pèsent pas dans les seuils, mais `helpers.test.ts` reste utile comme garde-fou.
- Vitest isole chaque fichier (modules réimportés) : les 14 `PrismaClient` des routes se reconnectent à chaque fichier, sans impact tant que le fichier de base existe. C-02 remplacera ces clients par un singleton et modifiera aussi `src/test/` : enchaîner les deux tâches.
- `globalSetup` tourne dans le processus principal ; `setup.ts` (exécuté dans chaque worker) doit continuer à fixer `DATABASE_URL` avant tout import de `@prisma/client`.
- `seedRequiredData()` crée l'admin avec `id: 1` : ne pas réinitialiser `sqlite_sequence` n'a pas d'effet sur les tests actuels.
- `ensureAdmin.test.ts` (A-04) appelle `cleanDatabase()` sans `seedRequiredData()` : à garder compatible.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
