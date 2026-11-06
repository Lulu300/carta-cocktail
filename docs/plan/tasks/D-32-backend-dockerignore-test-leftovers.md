---
id: D-32
title: "Image backend : exclure du contexte de build les restes de tests et de restauration"
phase: D
lane: infra
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [B-12]
touches: [backend/.dockerignore, backend/.gitignore]
sources: []
branch:
pr:
---

## Contexte

Depuis B-12 (PR #136), la base de test du backend vit dans `backend/prisma/test/`, que `globalSetup` supprime en fin de run. Un run interrompu (Ctrl+C, plantage) y laisse ses fichiers : `test.db`, `-wal`, `-shm`, `backups/pre-restore-*.db` et, pendant une restauration, `test.db.restore-<horodatage>`. Le `backend/Dockerfile` fait `COPY prisma ./prisma`.

## Problème constaté

Relevé par la relecture de la PR #136 (point 3, non bloquant, antérieur à B-12) :

- `backend/.dockerignore` n'exclut que `**/*.db` et `**/*.db-journal`. Après un run interrompu, `prisma/test/test.db-wal`, `test.db-shm` et `test.db.restore-*` partent dans le contexte de build, puis dans une image construite en local.
- Même chose pour la base de développement : `prisma/carta_cocktail.db-wal`, `-shm` (mode WAL) et `carta_cocktail.db.restore-*` (restauration interrompue).
- Même chose pour le fichier de plancher de session : `sessionFloorPath()` (`backend/src/services/sessionFloor.ts`) écrit `${dbPath}.session-floor`, en passant par `${dbPath}.session-floor.tmp`. La restauration d'une sauvegarde antérieure à v1.11.0 laisse `prisma/carta_cocktail.db.session-floor` jusqu'au redémarrage suivant. Git l'ignore déjà (`*.session-floor*` dans le `.gitignore` racine, C-30), Docker non.
- `carta_cocktail.db.restore-*` n'est pas ignoré par git non plus : `backend/.gitignore` ignore `/prisma/test/`, et le `.gitignore` racine ignore `*.db`, `*.db-wal` et `*.db-shm`, mais pas `*.db.restore-*`.

## Ce qu'il faut faire

1. `backend/.dockerignore` : exclure `prisma/test`, `**/*.db-wal`, `**/*.db-shm`, `**/*.db.restore-*` et `**/*.session-floor*`, avec un commentaire qui dit pourquoi.
2. `backend/.gitignore` : ignorer `*.db.restore-*`, avec un commentaire (le `.gitignore` racine porte les autres motifs `*.db*`).
3. Vérifier que l'image construite contient toujours `prisma/schema.prisma` et `prisma/migrations/`.

## Critères d'acceptation

- [ ] Avec des fichiers factices `prisma/test/test.db-wal`, `prisma/carta_cocktail.db-shm`, `prisma/carta_cocktail.db.restore-x` et `prisma/carta_cocktail.db.session-floor`, `docker build` puis `docker run --rm --entrypoint ls <image> -R prisma` ne les montre pas.
- [ ] `git status` ne montre pas `prisma/carta_cocktail.db.restore-x`.
- [ ] Check Smoke vert ; l'image contient toujours le schéma et les migrations.

## Tests à ajouter ou adapter

- Aucun test unitaire. Vérification décrite dans la PR.

## Points d'attention

- D-26 et D-31 touchent `backend/Dockerfile`, pas `.dockerignore` : pas de conflit de fichiers, mais une vérification de l'image à refaire si l'une est mergée avant.

## Journal

- 2026-10-13 : tâche créée par la PR docs de suivi du lot E-13/B-12/C-41/D-30, à partir de la relecture de la PR #136 (B-12, point 3).
