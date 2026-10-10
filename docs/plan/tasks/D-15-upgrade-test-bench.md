---
id: D-15
title: "Banc de test de mise à jour sur une base réelle"
phase: D
lane: ci
criticite: haute
effort: M
status: todo
owner: mixed
depends_on: [D-11]
touches: [scripts/upgrade-test/, .gitignore, docs/plan/README.md]
sources: ["07-devops-history.md §2.1", "07-devops-history.md §2.2", "07-devops-history.md §3.4"]
branch:
pr:
---

## Contexte

Les versions 1.5.0 et 1.6.0 sont cassantes : photos déplacées vers `/app/uploads`, `JWT_SECRET` obligatoire, bascule vers les migrations Prisma avec refus de démarrer si la base ne correspond pas à `0_init`, passage en WAL. Les notes de version décrivent les actions obligatoires pour l'installation de référence (`docker-compose.prod.yml`, volumes nommés). Les instances réelles s'en écartent : bind mounts, photos montées sur `/uploads`, `env_file` séparé, images en `:latest`.

Un utilisateur a fourni une copie de sa base de production (v1.4.0), ses photos et sa configuration compose anonymisée. Ce jeu d'essai reste hors du dépôt (données personnelles) : la partie humaine de la tâche est de le fournir et de le garder à jour.

## Problème constaté

- Rien ne rejoue une montée de version complète (image publiée, vraie base, vraies photos) avant une release. La CI teste le code, pas le passage d'une version à l'autre.
- Les notes de version ne sont validées que sur l'installation de référence. Une configuration personnalisée (montage `/uploads`, `env_file`) peut casser sans que personne le voie avant l'utilisateur.

## Ce qu'il faut faire

1. `scripts/upgrade-test/` : script Node sans dépendance qui pilote la CLI `docker`.
   - Entrées : `--fixture <dir>` (base + archive des photos), `--layout friend|official`, `--path` (chaîne de versions, `local` pour une image construite depuis le checkout), `--mode naive|conformant|both`, `--keep`.
   - Image de départ v1.4.0 : tag `:1.4.0` s'il correspond à l'empreinte de l'instance réelle, sinon l'empreinte.
   - Un fichier de hooks par version (`hooks/<version>.mjs`) décrit les actions obligatoires des notes et le comportement attendu de la version. Mode naïf : seul le tag change. Mode conforme : actions de toutes les versions franchies.
   - Vérifications à chaque saut : démarrage ou refus propre, lignes de log attendues, `prisma migrate status` à partir de 1.6.0, nombre de lignes par table, `PRAGMA integrity_check`, mode de journal, connexion admin, API publique (cartes et fiches cocktail), chaque photo référencée via le backend et via le nginx du frontend, persistance du dossier d'upload.
   - Rapport Markdown hors du dépôt, sans données personnelles. Code de sortie ≠ 0 si une vérification attendue échoue. Nettoyage des conteneurs, volumes et réseaux (préfixe `carta-ut-`).
2. Deux layouts commités sans donnée personnelle : `friend` (bind mounts, `/uploads`, `env_file`, réseau externe) et `official` (`docker-compose.prod.yml`, volumes nommés).
3. `.gitignore` : chemins des rapports et des copies de travail.
4. `docs/plan/README.md`, procédure de release : passer le banc sur la pré-version avant de taguer la version finale.
5. Lancer le banc sur le jeu d'essai et reporter les anomalies dans la PR, sans corriger l'application.

## Critères d'acceptation

- [ ] `node scripts/upgrade-test/run.mjs --fixture <dir> --layout friend --path 1.4.0,1.5.0,1.6.0-rc.1` rejoue les deux modes et écrit un rapport par saut et par mode.
- [ ] Le rapport ne contient ni email, ni hash, ni donnée nominative : compteurs et statuts seulement.
- [ ] Le hash admin de la copie de travail est remplacé par un hash de test, et le rapport le dit.
- [ ] Le code de sortie est différent de 0 quand une vérification attendue échoue.
- [ ] Aucun conteneur, volume ou réseau `carta-ut-*` ne reste après un passage sans `--keep`.
- [ ] La procédure de release du README du plan demande de passer le banc sur la pré-version.

## Tests à ajouter ou adapter

- `node --test scripts/upgrade-test/test/*.test.mjs` : versions et chemins, sélection des hooks, attentes (échecs prévus par les notes), lecture des comptages, rendu du rapport.
- Le banc lui-même n'est pas lancé par la CI : il demande Docker, les images publiées et le jeu d'essai privé.

## Points d'attention

- Le jeu d'essai contient l'email réel de l'admin : ne jamais le copier dans le dépôt ni l'afficher. Le banc travaille sur une copie dans un dossier temporaire.
- Les images publiées sont en `linux/amd64` seulement : sur Apple Silicon, elles tournent en émulation (plus lent).
- La v1.4.0 réécrit l'email et le mot de passe admin depuis l'environnement à chaque démarrage : après le premier démarrage, le mot de passe valide est celui de l'`env_file`, pas le hash de test.
- Les anomalies trouvées par le banc deviennent des tâches séparées ; les actions manquantes dans les notes sont reprises par le coordinateur (règle 9).

## Journal

- 2026-10-10 : tâche créée avec le banc.
