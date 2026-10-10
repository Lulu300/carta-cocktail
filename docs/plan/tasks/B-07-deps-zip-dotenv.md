---
id: B-07
title: "Dépendances lot 2 : adm-zip 0.6, archiver 8, dotenv 18 (+ premiers tests du backup)"
phase: B
lane: deps
criticite: haute
effort: S
status: done
owner: agent
depends_on: [A-07]
touches: [backend/package.json, backend/package-lock.json, backend/src/routes/backup.ts, backend/src/routes/backup.test.ts, backend/src/utils/bottlesImport.ts]
sources: ["08-dependencies.md §3.7", "08-dependencies.md §3.8", "08-dependencies.md §3.9", "03-security.md §9", "04-tests.md §6"]
branch: chore/B-07-deps-zip-dotenv
pr: "#58"
---

## Contexte

`adm-zip` 0.5.16 a une CVE haute (allocation non bornée sur archive forgée, CVE-2026-39244) qui ne se corrige qu'en 0.6. `archiver` 8 change son API et devient ESM-only : il casse `backup.ts` sans test pour le voir, car `backup.ts` est couvert à 5 %. Cette tâche monte les trois paquets et pose les premiers tests d'intégration du backup, qui servent de filet à C-05.

## Problème constaté

- `backend/src/routes/backup.ts` : `import archiver from 'archiver'` et `archiver('zip', { zlib: { level: 6 } })`. En archiver 8, la factory par défaut n'existe plus : on utilise `new ZipArchive(...)`.
- `backend/src/routes/backup.ts` et `backend/src/utils/bottlesImport.ts` n'utilisent d'adm-zip que `new AdmZip(buffer)`, `getEntries()`, `getEntry()`, `entry.getData()`, `entryName`, `isDirectory` : API identique en 0.6.1.
- adm-zip 0.6.1 embarque ses types : `@types/adm-zip` devient inutile. Il rejette aussi les archives avec des noms d'entrée en double (comportement souhaitable).
- `backend/src/config.ts` : `dotenv.config({ path })`, inchangé en dotenv 18.
- Aucun fichier `backup.test.ts`.

## Ce qu'il faut faire

1. Écrire d'abord `backend/src/routes/backup.test.ts` **avec les versions actuelles**, pour avoir un point de comparaison :
   - `GET /api/backup/export` sans token → 401 ;
   - export authentifié → 200, `Content-Type` zip, archive lisible contenant `metadata.json` et `database.db` ;
   - `POST /api/backup/import` avec un fichier qui n'est pas un zip → 400 ;
   - import d'un zip sans `metadata.json` → 400.
   (Les scénarios d'import complet et de restauration atomique sont dans C-05.)
2. Monter les paquets :
   ```bash
   npm install adm-zip@^0.6.1 archiver@^8 dotenv@^18
   npm install -D @types/archiver@^8
   npm uninstall @types/adm-zip
   ```
3. Adapter `backup.ts` :
   ```ts
   import { ZipArchive } from 'archiver';
   const archive = new ZipArchive({ zlib: { level: 6 } });
   ```
4. Vérifier que `tsc` émet bien un `require('archiver')` qui fonctionne (Node 24 sait faire `require()` d'un module ESM) : `npm run build && node dist/index.js` puis un export réel.
5. Relancer les tests, `npm audit --omit=dev`.

## Critères d'acceptation

- [x] `npm audit --omit=dev` backend à 0 vulnérabilité.
- [x] `backup.test.ts` présent, vert avant et après la montée.
- [x] Export de backup testé manuellement sur le build compilé (`node dist/index.js`), pas seulement via tsx.
- [x] `@types/adm-zip` supprimé.

## Tests à ajouter ou adapter

Voir étape 1. Le test d'export doit décompresser l'archive (avec adm-zip) et vérifier la présence des deux entrées.

## Points d'attention

- Le chemin de base de données calculé par `getDatabasePath()` est faux en dev (relatif au cwd au lieu du dossier `prisma/`) ; en test, s'assurer que `DATABASE_URL` pointe vers un fichier qui existe. Ne pas corriger `getDatabasePath()` ici : c'est dans C-05.
- Valider aussi dans l'image Docker (ESM-only + CommonJS) si B-01 est déjà mergé.

## Journal

- 2026-10-08 : tâche créée à partir du rapport de dépendances.
- 2026-10-09 : C-02 (PR #42) crée `backend/src/routes/backup.test.ts` (tests de régression WAL) et modifie `backup.ts` : compléter ce fichier à l'étape 1 au lieu de le créer, rebaser si B-07 est déjà en cours.
- 2026-10-10 : fait dans la PR #58. Tests ajoutés à `backup.test.ts` avant la montée (adm-zip 0.5 / archiver 7) puis gardés verts après : 401 sans token sur l'export et l'import ; export → 200, `application/zip`, archive relue avec adm-zip contenant `metadata.json`, `database.db` (en-tête SQLite) et les fichiers d'`uploads/` ; import d'un fichier qui n'est pas un zip et d'un zip sans `metadata.json` → 400, données intactes. Écart : un fichier qui n'est pas un zip répondait 500 (adm-zip lève une `Error` simple) ; `backup.ts` le transforme en 400 `errors.invalidBackup` (clé existante en/fr), dans un commit `fix:` séparé. `bottlesImport.ts` inchangé (API adm-zip identique). Lockfile régénéré par npm 11.9 : seules montées adm-zip 0.6.1, archiver 8.0.0, @types/archiver 8.0.0, dotenv 18.0.7, plus le sous-arbre d'archiver 8 ; @types/adm-zip retiré ; npm 11 retire l'entrée imbriquée `@prisma/config/node_modules/magicast` 0.3.5 (contrainte npm 10 levée par B-01). `npm audit --omit=dev` : 0. Couverture globale : 91,62 % instructions, 77,72 % branches, 98,5 % fonctions, 93,18 % lignes ; `backup.ts` 84 % des lignes ; delta (commande de la CI) 100 % (5/5). Build compilé (`node dist/index.js`) et image Docker Node 24.21 (projet `carta-b07`, port 13071, nettoyé) : export réel puis import de cet export avec un token de login, OK. `getDatabasePath()` laissé à C-05. Aucune nouvelle tâche : la ligne `injected env` de dotenv relève de D-16, le reste du backup de C-05, `backend/coverage/` non ignoré de B-08. Aucune action utilisateur, pas de note de version.
