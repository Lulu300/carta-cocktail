---
id: A-01
title: "Persister les photos de cocktails dans le volume Docker"
phase: A
lane: infra
criticite: critique
effort: S
status: todo
owner: mixed
depends_on: []
touches: [backend/src/config.ts, backend/src/config.test.ts, backend/Dockerfile, docker-compose.yml, docker-compose.prod.yml, backend/src/test/setup.ts, backend/src/routes/cocktails.test.ts]
sources: ["07-devops-history.md §2.1", "07-devops-history.md §2.9", "03-security.md §11"]
branch:
pr:
---

## Décisions validées (2026-10-08)

- **Photos de production** : l'humain récupère lui-même les photos existantes avec `docker cp` avant de déployer ce correctif. L'agent rappelle la procédure dans la description de la PR mais ne l'exécute pas.

## Contexte

Les photos de cocktails sont la partie la plus visible de la carte publique. En production Docker, elles sont écrites hors du volume `uploads` et disparaissent à chaque recréation du conteneur, donc à chaque mise à jour (`docker compose pull && up -d`). La base, elle, est persistée : les cocktails gardent un `imagePath` qui pointe vers un fichier absent. En dev, les tests écrivent en plus de faux PNG dans le vrai dossier `uploads/` du dépôt.

## Problème constaté

- `backend/src/config.ts:11` : `uploadDir: path.resolve(__dirname, '../../uploads')`.
  - Dev (`tsx`, `__dirname = backend/src`) : `<repo>/uploads`, correct.
  - Image Docker : le code compilé est dans `/app/dist` (`backend/tsconfig.json:6-7`), donc `/app/dist/../../uploads` donne **`/uploads`**, dans la couche éphémère du conteneur.
- Le volume est monté sur `/app/uploads` (`docker-compose.yml:16`, `docker-compose.prod.yml:14`). Le Dockerfile crée `/app/uploads` (`backend/Dockerfile:14`), mais rien n'y écrit.
- Tous les usages passent par `config.uploadDir` : multer (`backend/src/routes/cocktails.ts:21-24`), le static (`backend/src/app.ts:35`), la suppression et le remplacement d'image (`cocktails.ts:566`, `cocktails.ts:592`), le backup (`backend/src/routes/backup.ts:27`, `backup.ts:108`). Le correctif tient en un seul endroit.
- Tests : `backend/src/routes/cocktails.test.ts:542` uploade `fake-png-data` dans `config.uploadDir`, c'est-à-dire `<repo>/uploads`. 22 fichiers de 13 octets s'y trouvent aujourd'hui. Ils ne sont pas versionnés (`.gitignore:17-18`) mais finissent dans les backups de dev. `backend/src/test/setup.ts` ne redéfinit pas ce dossier.
- Constat de la revue confirmé ; rien n'a changé depuis.

## Ce qu'il faut faire

1. `backend/src/config.ts` : rendre le dossier configurable sans changer le défaut en dev.
   ```ts
   export function resolveUploadDir(env: NodeJS.ProcessEnv = process.env): string {
     return env.UPLOAD_DIR
       ? path.resolve(env.UPLOAD_DIR)
       : path.resolve(__dirname, '../../uploads'); // dev : <repo>/uploads
   }

   export const config = {
     // ...
     uploadDir: resolveUploadDir(),
   };
   ```
2. `backend/Dockerfile` : ajouter `ENV UPLOAD_DIR=/app/uploads` après le `mkdir`. L'image doit être correcte même si l'utilisateur garde sur son serveur une ancienne copie de `docker-compose.prod.yml`.
3. `docker-compose.yml` et `docker-compose.prod.yml` : ajouter `- UPLOAD_DIR=/app/uploads` dans l'`environment` du backend (explicite et documentaire).
4. `backend/src/test/setup.ts` : créer un dossier temporaire unique et l'exporter en `UPLOAD_DIR` avant tout import de l'app.
   ```ts
   import fs from 'fs';
   import os from 'os';
   import path from 'path';
   process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-uploads-'));
   ```
   Le nettoyage du dossier temporaire peut être laissé à l'OS ou fait dans un `afterAll` : préciser le choix dans la PR.
5. `backend/src/routes/cocktails.test.ts` : renforcer les tests d'upload (voir Tests).
6. Supprimer à la main les faux PNG de `<repo>/uploads` en gardant `.gitkeep` (hors git, rien à committer).

Hors périmètre : `.dockerignore`, multi-stage, utilisateur non-root (D-01) ; chemin de `test.db` et accélération des tests (B-03) ; `AGENTS.md`/README (D-09) ; ordre suppression fichier puis base (C-09).

## Critères d'acceptation

- [ ] `config.uploadDir` vaut `UPLOAD_DIR` quand la variable est définie, `<repo>/uploads` sinon.
- [ ] L'image backend définit `UPLOAD_DIR=/app/uploads` (`docker run --rm <image> printenv UPLOAD_DIR`).
- [ ] Les deux fichiers compose définissent `UPLOAD_DIR=/app/uploads`.
- [ ] `docker compose up --build`, upload d'une image, puis `docker compose up -d --force-recreate` : l'image est toujours servie sur `/uploads/<fichier>`.
- [ ] `cd backend && npm test` ne crée plus aucun fichier dans `<repo>/uploads`.
- [ ] La procédure de récupération des images existantes figure dans la description de la PR.

## Tests à ajouter ou adapter

- `backend/src/config.test.ts` (nouveau) :
  - `resolveUploadDir({ UPLOAD_DIR: '/tmp/x' })` renvoie `/tmp/x` ;
  - `resolveUploadDir({ UPLOAD_DIR: 'rel/dir' })` renvoie un chemin absolu ;
  - `resolveUploadDir({})` se termine par `/uploads` et ne contient pas `/dist/`.
- `backend/src/routes/cocktails.test.ts`, test « should upload image and cover existing imagePath replacement branch » (l.530) : après le POST, vérifier `fs.existsSync(path.join(config.uploadDir, res.body.imagePath))` et que `config.uploadDir` commence par `os.tmpdir()`.
- Nouveau test : une image existante, réellement écrite dans le dossier temporaire, est supprimée du disque quand on en uploade une nouvelle.

## Points d'attention

- **Opération manuelle en production, avant de déployer le correctif.** Les photos actuelles sont dans `/uploads`, dans la couche du conteneur. Si le conteneur a été recréé depuis le dernier upload, elles sont déjà perdues.
  ```bash
  docker exec <backend> ls -la /uploads /app/uploads   # constater
  docker cp <backend>:/uploads/. ./uploads-rescue/      # sauvegarder AVANT le pull
  # déployer la nouvelle image, puis :
  docker cp ./uploads-rescue/. <backend>:/app/uploads/
  ```
  Autre source possible : un export de backup fait depuis l'UI contient les fichiers de `/uploads`, puisqu'il lit `config.uploadDir`.
- Ne pas passer le défaut à `process.cwd()` comme le propose la revue : `npm run dev` tourne dans `backend/`, le dossier deviendrait `backend/uploads`. Les images de dev existantes ne seraient plus servies et le `.gitignore` ne couvrirait plus ce dossier.
- A-04 modifie aussi `config.ts` et les deux compose : ne pas lancer les deux tâches en parallèle.
- Ne pas supprimer `uploads/.gitkeep`, qui est versionné.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
