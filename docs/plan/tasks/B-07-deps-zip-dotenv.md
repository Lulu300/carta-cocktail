---
id: B-07
title: "Dépendances lot 2 : adm-zip 0.6, archiver 8, dotenv 18 (+ premiers tests du backup)"
phase: B
lane: deps
criticite: haute
effort: S
status: todo
owner: agent
depends_on: [A-07]
touches: [backend/package.json, backend/package-lock.json, backend/src/routes/backup.ts, backend/src/routes/backup.test.ts, backend/src/utils/bottlesImport.ts]
sources: ["08-dependencies.md §3.7", "08-dependencies.md §3.8", "08-dependencies.md §3.9", "03-security.md §9", "04-tests.md §6"]
branch:
pr:
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

- [ ] `npm audit --omit=dev` backend à 0 vulnérabilité.
- [ ] `backup.test.ts` présent, vert avant et après la montée.
- [ ] Export de backup testé manuellement sur le build compilé (`node dist/index.js`), pas seulement via tsx.
- [ ] `@types/adm-zip` supprimé.

## Tests à ajouter ou adapter

Voir étape 1. Le test d'export doit décompresser l'archive (avec adm-zip) et vérifier la présence des deux entrées.

## Points d'attention

- Le chemin de base de données calculé par `getDatabasePath()` est faux en dev (relatif au cwd au lieu du dossier `prisma/`) ; en test, s'assurer que `DATABASE_URL` pointe vers un fichier qui existe. Ne pas corriger `getDatabasePath()` ici : c'est dans C-05.
- Valider aussi dans l'image Docker (ESM-only + CommonJS) si B-01 est déjà mergé.

## Journal

- 2026-10-08 : tâche créée à partir du rapport de dépendances.
- 2026-10-09 : C-02 (PR #42) crée `backend/src/routes/backup.test.ts` (tests de régression WAL) et modifie `backup.ts` : compléter ce fichier à l'étape 1 au lieu de le créer, rebaser si B-07 est déjà en cours.
