---
id: D-13
title: "Documenter SQLITE_WAL et le mode WAL (README, .env.example)"
phase: D
lane: docs
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-02, C-01]
touches: [README.md, .env.example]
sources: ["02-backend-data-perf.md §3.4"]
branch: docs/D-13-docs-sqlite-wal
pr: "#81"
---

## Contexte

C-02 passe la base SQLite en mode WAL au démarrage et ajoute la variable `SQLITE_WAL` (`false` garde le journal classique, `delete`). Le WAL ne fonctionne pas sur un système de fichiers réseau (SMB, NFS) : quelqu'un qui place la base sur un NAS monté doit le savoir. C-02 n'a mis à jour que `backend/AGENTS.md` : `README.md` est aussi modifié par C-01, lancé en parallèle, et `.env.example` par B-08.

## Problème constaté

- `README.md`, section « Environment Variables » : `SQLITE_WAL` absente du tableau.
- `.env.example` : aucune mention de `SQLITE_WAL`.
- Rien n'explique que la base est accompagnée de fichiers `-wal` et `-shm` pendant que le serveur tourne (à copier avec le `.db` en cas de copie à chaud, ou serveur arrêté).

## Ce qu'il faut faire

1. `README.md`, tableau « Environment Variables » : ligne `SQLITE_WAL` (« `false` keeps the rollback journal instead of WAL; required when the database is on a network share (SMB/NFS) », défaut `true`).
2. `.env.example` : ligne commentée `# SQLITE_WAL=false` avec la même explication en une ligne.
3. README, section d'exploitation (ou `docs/operations.md` si D-09 l'a créé) : une phrase sur les fichiers `-wal`/`-shm` et la sauvegarde (renvoyer vers l'export de l'application, rendu cohérent par C-05).

## Critères d'acceptation

- [x] `SQLITE_WAL` figure dans le tableau des variables du README et dans `.env.example`.
- [x] La limite « pas de WAL sur un partage réseau » est écrite en clair.

## Tests à ajouter ou adapter

- Aucun (documentation).

## Points d'attention

- Rebaser après C-01 (README) et B-08 (`.env.example`) s'ils sont ouverts en même temps.
- Si D-09 est en cours, la tâche peut être regroupée avec elle.

## Journal

- 2026-10-09 : tâche créée pendant C-02 (documentation utilisateur de `SQLITE_WAL` laissée hors de la PR pour éviter un conflit sur `README.md` avec C-01).
- 2026-10-11 : fait dans la PR #81 (`docs/D-13-docs-sqlite-wal`). README : ligne `SQLITE_WAL` du tableau et nouvelle sous-section « Database files and network shares » dans la partie Docker de production (pas de `docs/operations.md` : D-09 n'est pas faite), hors de « Database migrations » visée par C-18. Vérifié dans le code : seule la valeur exacte `false` donne `delete`, toute autre valeur `wal` ; le mode est stocké dans le fichier ; le log de démarrage affiche le mode, et un avertissement si SQLite ne peut pas changer. Écart : les compose ne transmettent pas `SQLITE_WAL` depuis `.env`, donc le README et `.env.example` indiquent de l'ajouter à la liste `environment` du backend, comme `UPGRADING.md` (v1.6.0). Nouvelle tâche D-23 : transmettre `SQLITE_WAL` depuis `.env` dans les deux compose.
