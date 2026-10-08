---
id: C-05
title: "Backup et restauration fiables (snapshot cohérent, restauration atomique, validation)"
phase: C
lane: backend
criticite: haute
effort: M
status: todo
owner: agent
depends_on: [B-07, C-02]
touches: [backend/src/routes/backup.ts, backend/src/routes/backup.test.ts, backend/src/services/backupService.ts, backend/src/i18n/]
sources: ["02-backend-data-perf.md §4.1", "01-backend-routes.md §H2", "03-security.md §6", "07-devops-history.md §2.10", "04-tests.md §6"]
branch:
pr:
---

## Contexte

La restauration d'une sauvegarde est l'opération la plus destructrice de l'application, et la moins testée (5,5 % de couverture). Elle écrase le fichier SQLite sous des connexions ouvertes, sans validation ni copie de secours, et peut s'arrêter à mi-chemin. L'export copie un fichier en cours d'écriture : avec le WAL de C-02, il peut manquer les dernières données.

## Problème constaté

`src/routes/backup.ts` :
- `:17-21` `getDatabasePath()` retire `file:` et garde un chemin relatif au cwd. Prisma résout `file:./carta_cocktail.db` par rapport à `prisma/` : en dev, l'export répond « Database file not found » (la base est `backend/prisma/carta_cocktail.db`). Les paramètres d'URL ne sont pas retirés.
- `:12-15` : `memoryStorage` jusqu'à 500 Mo, puis `new AdmZip(buffer)` et `getData()` en mémoire. Aucune limite de taille décompressée.
- `:58` : `archive.file(dbPath)` copie le fichier à chaud.
- `:40-45` : une erreur après `archive.pipe(res)` laisse un zip tronqué que le client croit valide (pas de `res.destroy()`).
- `:53` : `appVersion: '1.0.0'` en dur ; aucune version de schéma.
- `:101` : `JSON.parse` du `metadata.json` sans garde.
- `:116` : `writeFileSync(dbPath, …)` sans contrôle de l'en-tête `SQLite format 3\0`, sans copie de l'ancienne base, sous des connexions Prisma ouvertes.
- `:125-129` : `unlinkSync` sur chaque entrée de `uploads/` ; un sous-dossier lève une exception **après** l'écrasement de la base.
- `:135-141` : aucune liste blanche d'extensions. Un `uploads/x.js` ou `x.html` est servi sur la même origine que l'admin (`app.ts:35`).
- `:30,43,78,144` : messages en anglais en dur.
- Aucun fichier `backup.test.ts` aujourd'hui. B-07 (montée adm-zip/archiver) en crée un premier (export, imports invalides) : le compléter ici plutôt que de le recréer.

## Ce qu'il faut faire

1. `src/services/backupService.ts` :
   - `resolveDatabasePath(url = process.env.DATABASE_URL)` : retire `file:` et la query string ; un chemin relatif est résolu depuis `path.resolve(__dirname, '../../prisma')` (dossier de `schema.prisma`, même résultat depuis `src/` et `dist/`).
   - `createSnapshot(): Promise<string>` : `VACUUM INTO '<tmp>'` via `prisma.$executeRawUnsafe` (doubler les `'` du chemin), fichier dans `os.tmpdir()`.
   - `readSchemaVersion(client)` : dernière migration appliquée (`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`), `null` si la table n'existe pas.
   - `restoreBackup(zipPath)` : étapes 3 à 6.
2. Export : snapshot, puis archive du snapshot, de `uploads/` et de `metadata.json` `{ version: 1, createdAt, appVersion: <package.json>, schemaVersion }`. Sur `archive.on('error')` : log puis `res.destroy(err)`. Supprimer le snapshot sur `res.on('close')`.
3. Import, réception : `multer({ dest: os.tmpdir(), limits: { fileSize: 200 * 1024 * 1024, files: 1 } })`, zip ouvert depuis le fichier. 400 `errors.invalidBackup` si `metadata.json` ou `database.db` manque, si `metadata.json` n'est pas du JSON, si `version !== 1`, si la somme des `entry.header.size` dépasse 500 Mo ou s'il y a plus de 5 000 entrées. Supprimer le fichier reçu dans tous les cas.
4. Import, validation de la base : extraire `database.db` en `${dbPath}.restore-<ts>` (même dossier que la base, pour un `rename` atomique). Vérifier les 16 premiers octets. Ouvrir ce fichier avec un `PrismaClient` jetable (`datasourceUrl`) : `PRAGMA integrity_check` = `ok`, tables `User`, `Cocktail`, `Bottle`, `Menu` présentes, `schemaVersion` pas plus récente que celle de l'application (sinon 400 `errors.backupSchemaTooNew`). Fermer ce client.
5. Import, uploads : extraire `uploads/*` dans un dossier `.restore-<ts>` créé **dans** `config.uploadDir`, avec `path.basename` et la liste blanche `.jpg .jpeg .png .webp`. Compter les fichiers ignorés.
6. Import, bascule (courte, sans attente réseau) :
   1. `PRAGMA wal_checkpoint(TRUNCATE)`, puis `prisma.$disconnect()` ;
   2. copier la base courante en `<dossier de la base>/backups/pre-restore-<ts>.db` ;
   3. supprimer `-wal`, `-shm`, `-journal`, puis `fs.renameSync(tmp, dbPath)` ;
   4. vider `config.uploadDir` avec `fs.rmSync(entrée, { recursive: true, force: true })` (sauf `.restore-<ts>`), y déplacer les fichiers restaurés (`rename`, même volume), supprimer le dossier temporaire ;
   5. `prisma.$disconnect()` une seconde fois (ferme une connexion rouverte par une requête concurrente), puis `prisma.$connect()` et `configureSqlite()` (C-02).
   Échec avant 6.3 : supprimer les temporaires, base intacte. Échec après : remettre la copie `pre-restore` et répondre 500.
7. Réponse : `{ message: req.t('backup.restored'), skippedFiles, restartRecommended }`. `restartRecommended` vaut `true` si la sauvegarde a un schéma plus ancien : au redémarrage, l'entrypoint de C-01 applique les migrations manquantes.
8. Traduire tous les messages (clés `backup.*` et `errors.*` dans `en.json`/`fr.json`).

## Critères d'acceptation

- [ ] En dev avec `DATABASE_URL="file:./carta_cocktail.db"`, l'export fonctionne et contient la base de `backend/prisma/`.
- [ ] L'export est un instantané cohérent (`VACUUM INTO`), y compris en mode WAL.
- [ ] Un zip dont `database.db` n'est pas une base SQLite → 400 ; base et uploads inchangés.
- [ ] Une sauvegarde valide est restaurée, une copie `backups/pre-restore-*.db` existe, l'API répond sans redémarrage.
- [ ] Un sous-dossier dans `uploads/` ne fait plus échouer la restauration.
- [ ] Un `uploads/evil.html` présent dans le zip n'est pas écrit.
- [ ] Plus aucun message en dur dans `backup.ts`.
- [ ] Couverture de `backup.ts` et `backupService.ts` ≥ 80 %.

## Tests à ajouter ou adapter

`src/routes/backup.test.ts` (supertest, base de test réelle, `config.uploadDir` dans un dossier temporaire) :
- export sans token → 401 ; avec token → 200, `application/zip`, le zip contient `metadata.json` (avec `schemaVersion`), un `database.db` qui commence par `SQLite format 3\0`, et les fichiers d'`uploads/` ;
- aller-retour : créer un cocktail, exporter, supprimer le cocktail, importer → le cocktail est revenu et `GET /api/cocktails` répond 200 sans redémarrage ;
- zip sans `metadata.json`, `metadata.json` illisible, `version: 2` → 400 ;
- `database.db` en texte brut → 400, et un cocktail créé avant le test existe toujours ;
- zip avec `uploads/sub/a.png`, `uploads/evil.html`, `uploads/ok.webp` → seuls `a.png` et `ok.webp` sont écrits, `skippedFiles === 1` ;
- `uploadDir` contenant un sous-dossier avant l'import → restauration OK ;
- un fichier `pre-restore-*.db` est créé.

`src/services/backupService.test.ts` (unitaire) : `resolveDatabasePath` avec `file:./x.db` (→ `<backend>/prisma/x.db`), `file:/abs/x.db`, `file:./x.db?connection_limit=1`.

## Points d'attention

- **Ne pas lancer ces tests avant A-01.** Sans `UPLOAD_DIR` temporaire en test, `config.uploadDir` est le vrai `<repo>/uploads`, et le test de restauration le **vide**. A-01 doit être mergée avant.
- La base de test est résolue par Prisma en `backend/prisma/prisma/test.db` tant que B-03 n'a pas corrigé `DATABASE_URL` : `resolveDatabasePath` doit donner le même chemin, le test le vérifie.
- `/app/uploads` est un point de montage Docker : impossible de le renommer (EBUSY). D'où le vidage puis le déplacement fichier par fichier dans le même volume.
- Une requête concurrente peut rouvrir une connexion entre `$disconnect` et `rename` ; la double déconnexion limite le risque. Une réponse 503 pendant la restauration demanderait de toucher `app.ts` : hors périmètre.
- Une base restaurée peut contenir des `imagePath` piégés (`../data/carta_cocktail.db`) : le confinement des chemins à la suppression d'image est fait par C-09.
- Une CSP dédiée sur `/uploads` (`default-src 'none'; sandbox`, sécurité §6) touche `app.ts` : non traitée ici.
- La limite de 200 Mo doit rester cohérente avec le `client_max_body_size` de nginx sur `/api/backup/import` (A-06).
- `schemaVersion` suppose C-01 (`_prisma_migrations`). Sans C-01, `readSchemaVersion` renvoie `null` et la comparaison est ignorée.
- B-07 (majeures d'`adm-zip` et `archiver`) touche aussi `backup.ts` : enchaîner. C-12 vérifiera qu'aucun message en dur ne reste.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
