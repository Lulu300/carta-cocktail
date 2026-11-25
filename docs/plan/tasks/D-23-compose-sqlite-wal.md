---
id: D-23
title: "Compose : transmettre SQLITE_WAL depuis .env"
phase: D
lane: infra
criticite: basse
effort: S
status: done
owner: agent
depends_on: [D-13]
touches: [docker-compose.yml, docker-compose.prod.yml, README.md, UPGRADING.md, .env.example, docs/operations.md, backend/src/lib/prisma.test.ts]
sources: ["02-backend-data-perf.md §3.4"]
branch: fix/D-23-compose-sqlite-wal
pr: 224
---

## Contexte

Trouvé pendant D-13. Les deux fichiers compose listent les variables du backend une à une (`environment`) et lisent la plupart depuis `.env` (`JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_RESET_PASSWORD`). `SQLITE_WAL` (C-02) n'y figure pas.

## Problème constaté

- Une ligne `SQLITE_WAL=false` dans le `.env` placé à côté du compose n'atteint pas le conteneur : la base reste en WAL, y compris sur un partage réseau où le WAL ne fonctionne pas.
- Le README (D-13) et `UPGRADING.md` (v1.6.0) demandent donc d'ajouter la variable à la main dans la liste `environment` du compose, contrairement aux autres variables, qui se règlent dans `.env`.

## Ce qu'il faut faire

1. `docker-compose.yml` et `docker-compose.prod.yml` : ajouter `- SQLITE_WAL=${SQLITE_WAL:-true}` à l'`environment` de `carta-cocktail-backend`. *Remplacé par la PR #224 : `${VAR:-}` (vide = défaut du backend), pour `SQLITE_WAL` et les autres variables facultatives (voir le Journal).*
2. README, section « Database files and network shares » et ligne `SQLITE_WAL` du tableau : remplacer la consigne d'édition du compose (et la phrase « Add this line again each time you download a new compose file ») par « dans `.env` ». `.env.example` : retirer la remarque sur Docker.
3. Section « Required actions » de la PR (règle 9) : *before* — une instance qui a ajouté `- SQLITE_WAL=false` à la main dans son compose met `SQLITE_WAL=false` dans `.env` avant la mise à jour. La mise à jour remplace `docker-compose.prod.yml` par un fichier téléchargé (`UPGRADING.md`, v1.6.0, étape 5) : l'ajout à la main disparaît et `${SQLITE_WAL:-true}` repasserait la base en WAL sans prévenir. Ligne « Notes de version » correspondante dans le Journal. *Remplacé par la PR #224 : aucune action requise ; la consigne de déplacer la ligne dans `.env` en téléchargeant le nouveau compose est dans la ligne « Notes de version » du Journal.*

## Critères d'acceptation

- [x] `SQLITE_WAL=false` dans `.env` donne `SQLite journal mode: delete` au démarrage du conteneur (`docker compose up`).
- [x] Sans la variable, le log affiche `SQLite journal mode: wal`.
- [x] Instance qui avait `- SQLITE_WAL=false` ajouté à la main dans son compose : après le passage au nouveau compose téléchargé, avec `SQLITE_WAL=false` dans `.env`, le log affiche toujours `SQLite journal mode: delete`.

## Tests à ajouter ou adapter

- Aucun test automatique ; essai manuel décrit dans la PR : `docker compose config`, puis démarrage avec et sans la variable, puis le cas de l'ajout à la main (ancien compose modifié, remplacé par le nouveau, variable déplacée dans `.env`).

## Points d'attention

- Zone séquentielle : `docker-compose*.yml` (voir `docs/plan/README.md`). Regrouper avec une autre tâche compose si l'une est ouverte.
- `UPGRADING.md` n'est pas modifié par la tâche (règle 9) : le coordinateur adapte la section v1.6.0 au moment de la release s'il le juge utile.

## Journal

- 2026-10-11 : tâche créée pendant D-13 (les compose ne transmettent pas `SQLITE_WAL` depuis `.env`).
- 2026-11-25 : fait dans la PR #224. Les deux compose transmettent depuis `.env` les six variables facultatives du backend, pas seulement `SQLITE_WAL` : `SQLITE_WAL`, `JWT_EXPIRES_IN`, `LOGIN_RATE_LIMIT`, `API_RATE_LIMIT`, `TRUST_PROXY`, `CORS_ORIGIN`, toutes sous la forme `${VAR:-}` (écart avec `${SQLITE_WAL:-true}` du point 1 : le défaut reste dans le backend). Vérifié dans le code et son historique : une valeur vide donne le défaut pour chacune depuis son introduction (`=== 'false'`, `!value`, `|| false`), donc aussi avec une image plus ancienne. Test ajouté : `configureSqlite` avec `SQLITE_WAL=''` donne `wal`. Les lignes sont au-dessus de `PORT` : compose garde la dernière entrée d'une variable en double, donc une ligne ajoutée à la main après `UPLOAD_DIR` (ancienne consigne) l'emporte encore. Essai réel dans le projet compose `carta-d-23` : `wal` sans variable ou avec les six vides (limite API 600, pas d'en-tête CORS), `delete` avec `SQLITE_WAL=false` dans `.env`, ancien compose modifié à la main puis nouveau compose avec la variable dans `.env` : `delete` les deux fois. README (partages réseau, tableau, proxy inverse), `.env.example` et `docs/operations.md` (installation, étape 3 de la mise à jour) mis à jour ; `UPGRADING.md` non modifié (règle 9). Point relevé : une entrée de `environment`, même vide, l'emporte sur `env_file:` ; documenté dans le README et la PR.
- 2026-11-25 : Notes de version : les fichiers compose transmettent depuis `.env` les variables facultatives `SQLITE_WAL`, `JWT_EXPIRES_IN`, `LOGIN_RATE_LIMIT`, `API_RATE_LIMIT`, `TRUST_PROXY` et `CORS_ORIGIN` ; non définies ou vides, le backend garde ses valeurs par défaut. Aucune action requise : un compose existant, avec ses lignes ajoutées à la main, continue de fonctionner. En téléchargeant le nouveau `docker-compose.prod.yml`, mettre dans `.env` les variables ajoutées à la main à la liste `environment` (`SQLITE_WAL=false` sur un partage réseau) ; une ligne remise à la main dans le nouveau fichier doit rester à la fin de la liste `environment`, sinon l'entrée vide placée plus bas l'emporte et la variable revient à son défaut sans prévenir (`.env` reste la bonne solution) ; une installation qui les lit depuis un `env_file` les déplace dans `.env` ou retire leurs lignes du nouveau fichier, sinon elles reviennent à leur défaut sans prévenir ; une valeur déjà présente dans `.env`, ignorée jusque-là sous Docker, s'applique. Le rappel « remettre `- SQLITE_WAL=false` » des notes devient inutile pour qui passe par `.env` avec le nouveau compose. `breaking: false`.
- 2026-11-25 : revue de la PR #224 approuvée sans bloquant ; label `fix` ajouté par le coordinateur. À sa demande : la ligne « Notes de version » précise qu'une ligne remise à la main dans le nouveau compose doit rester à la fin de la liste `environment` ; `UPGRADING.md` (exception à la règle 9 demandée par le coordinateur) renvoie vers `.env` sans réécrire les sections historiques : phrase ajoutée à l'étape 6 de v1.6.0, à l'étape 6 de v1.12.0 et aux paragraphes « If you download `docker-compose.prod.yml` again » de v1.13.0, v1.14.0 et v1.15.0 (« Compose files newer than v1.15.0 pass these variables from `.env` », sans nommer la version suivante).
