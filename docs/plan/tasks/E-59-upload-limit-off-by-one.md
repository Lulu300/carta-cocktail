---
id: E-59
title: "Envois de fichiers : le backend refuse un fichier qui pèse exactement la limite"
phase: E
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: []
touches: [backend/src/routes/backup.ts, backend/src/routes/bottles.ts, backend/src/services/cocktail/cocktailImage.ts, backend/src/services/backupService.ts, frontend/src/pages/admin/SettingsPage.tsx, frontend/src/pages/admin/SettingsPage.test.tsx]
sources: []
branch:
pr:
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

- [ ] Pour chaque envoi, un fichier de `MAX` octets et un fichier de `MAX + 1` octets ont le comportement choisi, vérifié par un test.
- [ ] Commentaires et frontend (`frontend/src/pages/admin/SettingsPage.tsx`) cohérents avec ce choix.

## Tests à ajouter ou adapter

- Tests d'intégration des trois routes avec une petite limite injectée, ou test de l'option passée à multer.

## Points d'attention

- Ne pas créer de fichier de 200 Mo dans les tests.

## Journal

- 2026-11-24 : tâche créée pendant E-58 (vérification de busboy avec une limite de 10 octets).
