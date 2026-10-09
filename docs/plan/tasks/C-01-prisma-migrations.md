---
id: C-01
title: "Migrations Prisma versionnées à la place de db push --accept-data-loss"
phase: C
lane: backend
criticite: critique
effort: M
status: done
owner: mixed
depends_on: [A-04]
touches: [backend/prisma/migrations/, backend/Dockerfile, backend/package.json, .gitignore, backend/docker-entrypoint.sh, README.md, .github/workflows/ci.yml]
sources: ["07-devops-history.md §2.2", "02-backend-data-perf.md §5"]
branch: feature/C-01-prisma-migrations
pr: "#44"
---

## Décisions validées (2026-10-08)

- **Bascule** : automatique avec garde-fous. L'entrypoint sauvegarde la base (`pre-migrate-<date>.db`), marque `0_init` comme appliquée si la base correspond au schéma, et refuse de démarrer avec un message clair sinon. Avant le premier déploiement, l'humain vérifie sur une copie de la production (étape 3 de la procédure de baseline).

## Contexte

Le conteneur backend applique le schéma Prisma à chaque démarrage avec `db push --accept-data-loss`. Toute modification de schéma (renommage, changement de type, contrainte) part en production sans revue et peut supprimer des colonnes ou des tables. C-07 et C-11 modifient le schéma : il leur faut des migrations versionnées et relues.

## Problème constaté

- `backend/Dockerfile:18` : `CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm run db:seed && npm start"]`.
- `.gitignore:31-32` exclut `backend/prisma/migrations/` ; aucun dossier de migrations n'existe.
- `backend/package.json:13` déclare `db:migrate: prisma migrate dev`, jamais utilisé. Seul `db push` est documenté (`README.md:45`, `AGENTS.md` « Running Locally »).
- `docker-compose.prod.yml:3` tire `:latest` : un simple `pull` applique un nouveau schéma sans contrôle.
- La base a été construite par `db push` successifs : dans `backend/prisma/carta_cocktail.db`, la colonne `Bottle.location` est en fin de table (ajout tardif). Une base de prod peut donc différer légèrement d'une base neuve.
- `sh -c` ne transmet pas SIGTERM à Node : l'arrêt du conteneur attend 10 s puis tue le process.

## Ce qu'il faut faire

1. `.gitignore` : supprimer les lignes 31-32. Ajouter `*.db-wal` et `*.db-shm` à côté de `*.db-journal` (le WAL arrive avec C-02).
2. Créer la migration de base depuis le schéma actuel, **sans modifier `schema.prisma`** :
   ```bash
   cd backend && mkdir -p prisma/migrations/0_init
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
   printf 'provider = "sqlite"\n' > prisma/migrations/migration_lock.toml
   ```
3. `package.json` : ajouter `"db:deploy": "prisma migrate deploy"`, `"db:status": "prisma migrate status"` et
   `"db:check": "prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url file:./shadow.db --exit-code"`. Garder `db:migrate` (dev). Supprimer `db:push` (les tests appellent la CLI directement).
4. Créer `backend/docker-entrypoint.sh` (`#!/bin/sh`, `set -eu`) :
   - `DB_FILE="${DATABASE_URL#file:}"` (chemin absolu en Docker) ;
   - si `$DB_FILE` existe et que `npx prisma migrate status` sort en erreur (migrations en attente ou base non baselinée) : copier `$DB_FILE` et ses `-wal`/`-shm` dans `/app/data/backups/pre-migrate-$(date +%Y%m%d-%H%M%S).db`, garder les 10 plus récentes ;
   - lancer `migrate deploy` en capturant la sortie. Si elle contient `P3005` (base non vide sans `_prisma_migrations`), baseliner **seulement si la base correspond à `0_init`** :
     ```sh
     rm -f /tmp/baseline.db
     npx prisma db execute --url "file:/tmp/baseline.db" --file prisma/migrations/0_init/migration.sql
     if npx prisma migrate diff --from-url "$DATABASE_URL" --to-url "file:/tmp/baseline.db" --exit-code >/dev/null; then
       npx prisma migrate resolve --applied 0_init && npx prisma migrate deploy
     else
       echo "Base existante différente de 0_init : baseline manuelle requise (voir README)." >&2; exit 1
     fi
     ```
   - puis `npm run db:seed` et `exec node dist/index.js` (pas `npm start`, pour que SIGTERM atteigne Node).
5. `Dockerfile` : copier l'entrypoint, `chmod +x`, `ENTRYPOINT ["/app/docker-entrypoint.sh"]`, supprimer le `CMD`. Ne pas passer en multi-stage : c'est D-01.
6. `.github/workflows/ci.yml`, job backend : étape `npm run db:check` après `prisma generate`. Elle échoue si `schema.prisma` change sans migration.
7. `README.md` : remplacer `npx prisma db push` (`:45`) par `npx prisma migrate deploy` ; section « Base de données » : `npm run db:migrate -- --name <nom>` en dev, jamais `db push` hors tests, procédure de baseline ci-dessous, restauration d'une copie `pre-migrate-*`. `AGENTS.md` est mis à jour par D-09.

### Procédure de baseline sur la prod existante (humain)

1. Arrêter le backend : `docker compose stop carta-cocktail-backend`.
2. Copier la base hors du volume : `docker run --rm -v <projet>_db-data:/data -v "$PWD":/out alpine sh -c 'cp /data/carta_cocktail.db* /out/'`. Garder cette copie jusqu'à validation.
3. Sur la copie, en local, depuis `backend/` : `npx prisma migrate diff --from-url "file:/chemin/absolu/carta_cocktail.db" --to-schema-datamodel prisma/schema.prisma --script`. Attendu : une migration vide (`-- This is an empty migration.`). Sinon, lire le SQL et corriger la base avant de déployer.
4. Déployer l'image : l'entrypoint sauvegarde, baseline puis applique `migrate deploy`.
5. Vérifier : `docker compose exec carta-cocktail-backend npx prisma migrate status` → « Database schema is up to date ». Contrôler l'admin et la carte publique.
6. Bases de dev existantes : `npx prisma migrate resolve --applied 0_init`.

## Critères d'acceptation

- [x] `prisma/migrations/0_init/migration.sql` et `migration_lock.toml` sont versionnés.
- [x] `npm run db:check` passe, et échoue si on ajoute un champ au schéma sans migration.
- [x] Le CI exécute `db:check`.
- [x] Volume vide : le conteneur démarre, tables créées par `migrate deploy`, seed passé.
- [x] Base existante issue de `db push` (copie de `develop`) : sauvegarde `pre-migrate-*` créée, `0_init` marquée appliquée, aucune donnée perdue.
- [ ] Même vérification sur une copie de la base de production (humain, étape 3 de la procédure de baseline ; commandes dans la PR #44, « Required actions »).
- [x] Base différente de `0_init` : démarrage refusé avec un message clair, base intacte.
- [ ] `docker compose stop` arrête le backend en moins de 2 s. (Node est bien PID 1, mais sans gestionnaire SIGTERM il ignore le signal : 10 s avec C-01 seule, 0,21 s avec le handler de C-02, PR #42. À cocher après le merge de C-02.)
- [x] Plus aucun `db push` hors `src/test/helpers.ts` (code, scripts, Dockerfile, README). Les deux `AGENTS.md` en parlent encore : D-09.

## Tests à ajouter ou adapter

Pas de code TypeScript nouveau : la couverture n'est pas concernée. Vérifications à faire et à décrire dans la PR :
- `npm run db:check` : exit 0 sur la branche ; exit 2 après ajout d'un champ fictif dans `schema.prisma` ; revert.
- Docker, cas 1 : volume vide → démarrage OK.
- Docker, cas 2 : volume contenant une base `db push` de `develop` avec quelques bouteilles → démarrage OK, données présentes, dossier `backups/` créé.
- Docker, cas 3 : base modifiée à la main (`ALTER TABLE Bottle DROP COLUMN location`) → démarrage refusé, base inchangée.
- `npm test` backend vert. Les tests gardent `db push --force-reset` (`src/test/helpers.ts:27`) ; leur passage à `migrate deploy` relève de B-03.

## Points d'attention

- **Sauvegarde d'abord** : ne pas déployer cette version en prod sans la copie manuelle de l'étape 2.
- `0_init` doit refléter le schéma de `develop` au moment du merge. Si une autre PR modifie `schema.prisma` avant, régénérer `0_init`.
- Si la prod tourne une version plus ancienne que `develop`, sa base ne correspond pas à `0_init` : la mettre d'abord à jour avec la dernière image sans migrations, ou corriger à la main, puis baseliner.
- Le code de sortie de `prisma migrate status` en cas de migrations en attente est à vérifier sur Prisma 6 avant de s'y fier dans l'entrypoint.
- La CLI `prisma` et `tsx` (seed) sont en devDependencies : l'image actuelle les contient (`npm ci` complet). D-01 devra les garder disponibles au runtime ou compiler le seed.
- Syntaxe Prisma 6 (`--to-schema-datamodel`, `--from-url`, `db execute --url`) : C-15 (Prisma 7) devra adapter l'entrypoint et `db:check`.
- Le shadow `file:./shadow.db` se crée dans `backend/prisma/` : couvert par `*.db`.
- Prisma peut exiger `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` quand un agent lance une commande destructive (`migrate reset`) : ne pas le contourner sans accord humain.
- Ordre : après A-04 (seed non destructif, lancé par l'entrypoint). Avant C-06, C-07, C-11 et F-09 (premières migrations), D-01 (refonte du Dockerfile autour de cet entrypoint) et C-05 (le backup lira la version de migration). `ci.yml` est aussi touché par B-02 et D-04 : enchaîner.
- **Notes de version** (règle de D-11 : la PR ne touche ni `docs/releases/` ni `UPGRADING.md`). `breaking: true` : le conteneur peut refuser de démarrer si la base diffère de `0_init`. La description de la PR a une section « Required actions » et le Journal une ligne « Notes de version ». Actions attendues : *before* — arrêter le backend et copier la base hors du volume (étapes 1 et 2 de la procédure de baseline) ; si l'instance tourne une version antérieure à la précédente, passer d'abord par celle-ci ; *after* — `docker compose exec <backend> npx prisma migrate status` doit afficher « Database schema is up to date » ; en cas de refus de démarrage, suivre la procédure de baseline manuelle du README. Épinglage recommandé : `:<version>` avant D-05, `:<majeure>.<mineure>` ensuite.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
- 2026-10-09 : C-06 et F-09 ajoutées aux premières migrations ; point d'attention « Notes de version » (règle de D-11 décidée le 2026-10-09).
- 2026-10-09 : C-01 réalisée (PR #44). Vérifié sur Prisma 6.19.3 : `migrate status` sort en 1 pour des migrations en attente comme pour une base `db push` sans historique, en `P1003` si le fichier n'existe pas (d'où le test d'existence) ; l'ordre des colonnes (`Bottle.location` ajoutée en dernier) ne gêne pas la comparaison. Écarts : `db:check` utilise `--shadow-database-url file::memory:` (avec `file:./shadow.db`, Prisma ne vide pas la base fantôme, le deuxième lancement échoue en `P3006`, et le fichier se crée dans `backend/`) ; dossier de sauvegarde déduit du chemin de la base (`/app/data/backups` en Docker) ; pas de nouvelle copie si la base est identique à la dernière (sinon une boucle de redémarrage après un refus ou une migration ratée ferait sortir la bonne copie des 10 gardées) ; le refus affiche le SQL d'écart. Docker (image construite depuis une archive propre de `backend/`, npm 10.8.2) : volume vide OK ; base créée par l'image publiée `backend:1.5.0` avec 3 bouteilles : copie identique à l'octet, `0_init` marquée appliquée, mêmes comptes de lignes ; base sans `Bottle.location` : refus (code 1), SHA-256 inchangé, pas de deuxième copie au redémarrage. Arrêt en moins de 2 s seulement avec C-02 (critère non coché). Reste à l'humain : vérification sur une copie de la production avant le premier déploiement. Mentions de `db push` dans les `AGENTS.md` transmises à D-09.
- 2026-10-09 : Notes de version : `breaking: true`. Le backend peut refuser de démarrer si la base existante ne correspond pas à `0_init` (base intacte, copie dans `/app/data/backups/`). *Before* : arrêter le backend, copier la base hors du volume, passer d'abord par v1.5.0 si l'instance est plus ancienne, vérifier la copie (diff vide contre `0_init`, ou entrypoint lancé sur la copie). *After* : `docker compose exec carta-cocktail-backend npx prisma migrate status` → « Database schema is up to date! » ; en cas de refus, procédure de baseline manuelle du README (« Database migrations ») ou retour à la version précédente avec la copie `pre-migrate-*`. Bases de dev `db push` : `npx prisma migrate resolve --applied 0_init`. Épinglage recommandé : `:<version>`.
