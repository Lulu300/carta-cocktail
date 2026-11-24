---
id: E-59
title: "Envois de fichiers : le backend refuse un fichier qui pèse exactement la limite"
phase: E
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: []
touches: [backend/src/routes/bottles.ts, backend/src/services/cocktail/cocktailImage.ts, backend/src/services/backupService.ts, backend/src/utils/bottlesImport.ts, backend/src/routes/backupUploadLimit.test.ts, backend/src/routes/bottles.test.ts, backend/src/routes/cocktails.test.ts, backend/src/app.test.ts, backend/src/uploadLimits.test.ts, backend/AGENTS.md, docs/operations.md, frontend/nginx.conf.template, frontend/src/pages/admin/SettingsPage.tsx, frontend/src/pages/admin/SettingsPage.test.tsx]
sources: []
branch: fix/E-59-upload-exact-limit
pr: https://github.com/Lulu300/carta-cocktail/pull/214
---

## Contexte

Relevé pendant E-58. Les envois de fichiers passent par multer, qui transmet `limits.fileSize` à busboy : sauvegarde (`MAX_BACKUP_UPLOAD_BYTES`, 200 Mo, `backend/src/routes/backup.ts`), photo de cocktail (`MAX_IMAGE_BYTES`, 5 Mo, `backend/src/services/cocktail/cocktailImage.ts`), import de bouteilles (10 Mo, `backend/src/routes/bottles.ts`).

## Problème constaté

busboy 1.x signale la limite dès que la taille lue **atteint** `fileSize` (`if (fileSize === fileSizeLimit)` dans `lib/types/multipart.js`), pas quand elle la dépasse. Vérifié le 2026-11-24 avec busboy et `fileSize: 10` : un fichier de 9 octets passe, un fichier de 10 octets est tronqué et déclenche `limit`, donc `LIMIT_FILE_SIZE` et un 413. Le plus gros fichier accepté pèse donc la limite moins un octet, alors que le commentaire de `MAX_BACKUP_UPLOAD_BYTES` dit « Largest backup archive the import accepts ».

Effet : négligeable en pratique (un octet), mais le frontend d'E-58 laisse partir une archive d'exactement 200 Mo, que le backend refuse ensuite avec un 413 (message `requestTooLarge`, le bon, puisque nginx accepte ce corps).

## Ce qu'il faut faire

1. Choisir le sens de la limite : soit passer `fileSize: MAX + 1` à multer pour que `MAX` soit vraiment le plus gros fichier accepté, soit garder le comportement et corriger les commentaires (et le test d'E-58 côté frontend, qui envoie une archive d'exactement la limite).
2. Appliquer le même choix aux trois envois.

## Critères d'acceptation

- [x] Pour chaque envoi, un fichier de `MAX` octets et un fichier de `MAX + 1` octets ont le comportement choisi, vérifié par un test.
- [x] Commentaires et frontend (`frontend/src/pages/admin/SettingsPage.tsx`) cohérents avec ce choix.

## Tests à ajouter ou adapter

- Tests d'intégration des trois routes avec une petite limite injectée, ou test de l'option passée à multer.

## Points d'attention

- Ne pas créer de fichier de 200 Mo dans les tests.

## Journal

- 2026-11-24 : tâche créée pendant E-58 (vérification de busboy avec une limite de 10 octets).
- 2026-11-24 : fait (PR #214). Le constat ne vaut que pour busboy appelé directement. multer 2.5.0 (la version installée depuis v1.12.0) passe `fileSize + 1` à busboy (`lib/make-middleware.js`, commentaire « Multer treats all three as "max allowed" ») : avec multer et `fileSize: 10`, 9 et 10 octets passent, 11 donnent `LIMIT_FILE_SIZE`. La limite documentée est donc déjà la vraie, limite incluse, pour les trois envois (seuls `multer(` du code) : aucun changement de comportement, choix « garder et corriger ». Fait : une constante exportée par limite (`MAX_IMAGE_BYTES`, nouvelle `MAX_BOTTLE_IMPORT_BYTES` à la place du `10 * 1024 * 1024` en ligne, `MAX_BACKUP_UPLOAD_BYTES`), commentaires « this size included », section « File Uploads » dans `backend/AGENTS.md`, commentaires de nginx et du test frontend d'E-58 corrigés. Tests à limite - 1, limite, limite + 1 : photo (5 Mio réels, fichier entier sur disque, 413 sans fichier laissé), import de bouteilles (10 Mio réels, JSON complété d'espaces), sauvegarde (limite remplacée par 64 Kio avec `vi.mock`, nouveau fichier `backupUploadLimit.test.ts`), frontend (limite - 1 et limite envoyées). Sondes : `fileSize` à limite - 1 ou + 1 pour chaque route, limite de sauvegarde écrite en dur, `>=` ou `> limite + 1` dans `SettingsPage.tsx` : chacune fait échouer au moins un test. nginx vérifié sur la stack Docker (projet `carta-e-59`) : photo 5 Mio, import 10 Mio et sauvegarde 200 Mio exactement atteignent le backend et passent (archive non valide : 400), un octet de plus donne le 413 JSON du backend, 210 Mio le 413 HTML de nginx. Les limites des corps JSON (`express.json`, raw-body refuse `length > limit`) sont déjà incluses. Sans effet visible pour l'utilisateur. E-60 créée (photo et import de bouteilles : pas de vérification de taille dans le navigateur).
- 2026-11-24 : relecture de la PR #214 (approuvée), trois remarques appliquées. `docs/operations.md` : les 200 Mo sont la limite du backend, celle de nginx 210 Mo. `backend/src/routes/backup.ts`, inchangé, retiré de `touches`. Nouveau `backend/src/uploadLimits.test.ts` : il lit `client_max_body_size` par `location` dans `frontend/nginx.conf.template` (location exacte, sinon plus long préfixe, sinon le serveur) et vérifie qu'un fichier d'exactement la limite du backend, avec l'enveloppe multipart mesurée par `FormData` (nom de fichier de 255 caractères), tient sous la limite nginx de sa route. Sondes : photo à 25 Mio, import à 20 Mio, sauvegarde à 210 Mio, nginx à 200m pour la restauration ou 10m pour `/api/` : chacune fait échouer ce test.
