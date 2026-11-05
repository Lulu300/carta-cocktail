---
id: D-34
title: "Compose : uid et gid du backend réglables (CARTA_UID, CARTA_GID) pour les partages réseau"
phase: D
lane: infra
criticite: haute
effort: S
status: done
owner: agent
depends_on: [D-01]
touches: [docker-compose.yml, docker-compose.prod.yml, .env.example, backend/docker-entrypoint.sh, README.md, AGENTS.md, scripts/smoke/custom-uid.sh, .github/workflows/smoke.yml]
sources: []
branch: feat/D-34-configurable-uid
pr: "#157"
---

## Décisions validées (2026-11-05)

- Correctif de code avant `v1.12.0-rc.1` : les fichiers compose prennent `user: "${CARTA_UID:-1000}:${CARTA_GID:-1000}"`, variable dans `.env.example` et le README, testée contre le contrôle d'écriture de l'entrypoint, plus les notes.
- La décision de D-01 (`USER node` par défaut, jamais root) ne change pas.

## Contexte

Point bloquant B1 de la relecture des notes de v1.12.0 (PR #152). Depuis D-01 (PR #108), le backend tourne sous l'utilisateur `node` (uid 1000) et chaque installation existante doit faire `chown -R 1000:1000` sur ses données avant la mise à jour. Les utilisateurs visés par l'avertissement `SQLITE_WAL=false` (base sur un partage réseau) sont aussi ceux pour qui ce `chown` ne marche pas.

## Problème constaté

- CIFS/SMB : le propriétaire de chaque fichier vient des options de montage `uid=` et `gid=` ; le `chown` est refusé ou sans effet.
- NFS avec `root_squash` : le root du conteneur alpine est écrasé, `chown -R 1000:1000` échoue (`Operation not permitted`).
- ACL de NAS (Synology…) : elles peuvent refuser l'écriture à uid 1000 même après un `chown` réussi.
- Dans ces cas, l'entrypoint refuse de démarrer (à raison) et donne une commande `chown` qui ne peut pas aider. Les fichiers compose n'offrent aucun moyen de choisir l'uid sans les modifier à la main.

## Ce qu'il faut faire

1. `docker-compose.yml` et `docker-compose.prod.yml` : `user: "${CARTA_UID:-1000}:${CARTA_GID:-1000}"` sur `carta-cocktail-backend`, avec un commentaire.
2. `.env.example` : `CARTA_UID` et `CARTA_GID` commentés, avec leur rôle.
3. `backend/docker-entrypoint.sh` : le message de refus cite `CARTA_UID`/`CARTA_GID` et le cas des partages réseau ; vérifier qu'il affiche l'uid et la commande réels quand `CARTA_UID` est défini, et que rien ne suppose uid 1000 ou `HOME=/home/node` (npm, cache Prisma, `/tmp`).
4. README : variable dans « Data folders and the node user » et dans le tableau des variables, options de montage CIFS, NFS (`root_squash`, `all_squash`) et ACL ; « Running a previous version » (une image ≤ 1.11 démarre en root : retirer `user` en plus du `healthcheck`).
5. Test automatique contre le contrôle d'écriture : refus sous un autre uid sur des volumes de uid 1000, puis démarrage après `chown`, écritures réelles.

## Critères d'acceptation

- [x] Sans `CARTA_UID`/`CARTA_GID`, le backend tourne en `1000:1000` comme avant (`HOME=/home/node`) et le smoke passe.
- [x] Avec `CARTA_UID=CARTA_GID=4321` sur des volumes de uid 1000, le backend refuse de démarrer avec `uid 4321` et `chown -R 4321:4321` dans le message ; après `chown`, il démarre sous 4321:4321 et le smoke repasse (création, photo, recréation du conteneur, export).
- [x] Un uid absent de `/etc/passwd` (`HOME=/`) ne gêne ni `npx prisma` ni le démarrage, sans ligne de plus dans les logs.
- [x] Variable documentée dans `.env.example` et le README, avec les options CIFS et le cas NFS.
- [x] Les gabarits du banc de mise à jour sont laissés tels quels (voir Journal).

## Tests à ajouter ou adapter

- `scripts/smoke/custom-uid.sh`, lancé par `smoke.yml` après `smoke.sh` sur la même pile : refus sous 4321 (message, commande `chown`, pas de ligne `API running`), `chown` des volumes par `docker compose run --user 0:0`, démarrage sous 4321:4321, puis `smoke.sh` de nouveau avec `CARTA_UID` exporté.

## Points d'attention

- Les volumes nommés appartiennent à 1000:1000 (propriétaire du dossier de l'image) : avec un autre uid, le backend refuse jusqu'au `chown` qu'il affiche. Le README conseille de garder la valeur par défaut avec les volumes nommés.
- `user:` vaut aussi pour `docker compose run` et `docker compose exec` : les procédures du README (`--entrypoint sh`, `ls`) tournent sous `CARTA_UID`, propriétaire des données.

## Journal

- 2026-11-05 : tâche créée à la demande de l'humain (B1 de la relecture de la PR #152), faite dans la même PR.
- 2026-11-05 : fait (PR #157). `user: "${CARTA_UID:-1000}:${CARTA_GID:-1000}"` dans les deux compose ; `.env.example` ; message de refus de l'entrypoint (variables, partages SMB/NFS, renvoi au README) ; README (section « Data folders and the node user », tableau des variables, étape 1 du démarrage, « Running a previous version ») ; `scripts/smoke/custom-uid.sh` dans `smoke.yml` ; `AGENTS.md` (ligne Smoke). L'entrypoint lisait déjà `id -u`/`id -g` : uid et commande justes sous `CARTA_UID`. Uid sans entrée `/etc/passwd` : `HOME=/`, `npm config get cache` = `/.npm` non inscriptible, mais `npx prisma` reste muet et `node-compile-cache` va dans `/tmp`. Gabarits du banc (`scripts/upgrade-test/layouts/`) inchangés : ils reproduisent les compose publiés jusqu'à 1.8.0, sans `user:`, et la valeur par défaut donne le même uid que `USER node`.
- 2026-11-05 : Notes de version : variable facultative, aucune action obligatoire. Nouvelles variables `CARTA_UID` et `CARTA_GID` (`.env`, défaut 1000:1000) lues par les compose. Données sur un partage réseau (SMB/NFS) où le `chown` de l'étape 3 de D-01 est refusé ou sans effet : définir `CARTA_UID`/`CARTA_GID` au propriétaire que le partage donne aux fichiers (options `uid=`/`gid=` pour CIFS, propriétaire de l'export NFS, `anonuid`/`anongid` avec `all_squash`), ou monter le partage avec `uid=1000,gid=1000`, ou changer le propriétaire sur le NAS ; ACL de NAS : donner lecture et écriture à cet uid. Compose personnalisé : `user: "<uid>:<gid>"`. Volumes nommés : garder la valeur par défaut. Retour à une image ≤ 1.11 avec le compose actuel : retirer aussi la ligne `user` (ces images démarrent en root). Le message de refus de l'entrypoint cite ces variables.
- 2026-11-05 : relecture de la PR #157 (approuvée), points non bloquants 1 et 2 repris dans le README : avec `uid=0` dans les options CIFS, remonter le partage avec `uid=1000,gid=1000` plutôt que `CARTA_UID=0` (jamais le backend en root) ; `ls -n` sur NFSv3, ou NFSv4 avec des domaines idmap identiques (`4294967294` ou `65534` = nobody : corriger l'idmapping d'abord). Rebasée sur `develop` (C-44).
