---
id: D-04
title: "CI renforcée : tsc -b, lint backend, audit, build Docker sur PR"
phase: D
lane: ci
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: [B-02, B-05, D-01]
touches: [.github/workflows/ci.yml, docs/plan/tasks/D-05-release-pipeline.md, docs/plan/tasks/D-09-docs-sync-ops-guide.md]
sources: ["07-devops-history.md §3.3"]
branch: chore/D-04-ci-hardening
pr: "#112"
---

## Contexte

La CI est verte sur toutes les PR depuis février, mais une partie de ses étapes ne vérifie rien. Le typage frontend n'est contrôlé que par le build, le backend n'a pas de lint, aucune dépendance vulnérable ne bloque une PR et un Dockerfile cassé n'apparaît qu'au moment du tag. Cette tâche rend la CI fiable avant que D-05 ne s'appuie dessus pour publier les images.

## Problème constaté

- `.github/workflows/ci.yml:80-81` : `npx tsc --noEmit` dans `frontend/`. `frontend/tsconfig.json:2` contient `"files": []` et des `references` : sans `-b`, tsc ne compile aucun fichier et sort en 0. Le vrai contrôle se fait dans `npm run build` (`frontend/package.json:8`, `tsc -b`).
- `ci.yml:10-58` : aucune étape de lint backend. B-05 ajoute ESLint et le script `lint` dans `backend/package.json`.
- Aucune étape `npm audit`. La revue relève 11 vulnérabilités prod côté backend et 2 high côté frontend (A-07 et B-07 les corrigent).
- Aucun build Docker sur les PR. `release.yml:41-61` est le seul endroit où les images sont construites.
- `ci.yml` n'a ni `permissions:` (le jeton garde les droits par défaut) ni `concurrency:` (deux pushes rapprochés font tourner deux CI complètes).
- `ci.yml:24,74` : version de Node codée en dur (`24`). B-01 crée `.nvmrc`.
- Les actions sont épinglées par tag majeur (`actions/checkout@v5`, `setup-node@v5`, `upload-artifact@v5`).
- `ci.yml:50,94` : `${{ github.base_ref }}` interpolé dans `run:`. Ce point relève de B-02, qui réécrit l'étape delta-coverage.

## Ce qu'il faut faire

1. Vérifier que B-02, B-05 et D-01 sont mergés. Partir de leur version de `ci.yml`.
2. En tête du workflow :
   ```yaml
   on:
     push:
       branches: [main, develop]
     pull_request:
       branches: [main, develop]
     workflow_call:

   permissions:
     contents: read

   concurrency:
     group: ci-${{ github.ref }}
     cancel-in-progress: ${{ github.event_name == 'pull_request' }}
   ```
   `workflow_call` permet à D-05 d'appeler cette CI depuis la release.
3. Dans les deux jobs, remplacer `node-version: 24` par `node-version-file: .nvmrc`.
4. Job backend, après `prisma generate` : `- run: npm run lint`.
5. Job frontend : remplacer l'étape « TypeScript check » par `run: npx tsc -b` (les deux tsconfig référencés ont déjà `noEmit: true`).
6. Dans chaque job, après `npm ci` : `- name: Audit des dépendances de prod` avec `run: npm audit --omit=dev --audit-level=high`.
7. Ajouter un job de build des images, sans push :
   ```yaml
   docker:
     name: Docker build
     runs-on: ubuntu-latest
     strategy:
       matrix:
         service: [backend, frontend]
     steps:
       - uses: actions/checkout@v5
       - uses: docker/setup-buildx-action@v3
       - uses: docker/build-push-action@v6
         with:
           context: ./${{ matrix.service }}
           push: false
           load: true
           tags: carta-${{ matrix.service }}:ci
           cache-from: type=gha,scope=${{ matrix.service }}
           cache-to: type=gha,mode=max,scope=${{ matrix.service }}
   ```
   Optionnel : scan Trivy de l'image chargée, `severity: CRITICAL,HIGH`, non bloquant au début (`exit-code: '0'`), action épinglée par SHA.
8. Corriger la doc qui recommande `npx tsc --noEmit` côté frontend : signaler dans la PR que D-09 s'en charge (`AGENTS.md:31`, `frontend/AGENTS.md:13`), ne pas modifier ces fichiers ici.

## Critères d'acceptation

- [x] Une erreur de type volontaire dans un fichier `frontend/src/**` fait échouer l'étape « TypeScript check ».
- [x] Une erreur ESLint volontaire dans `backend/src/**` fait échouer le job Backend.
- [x] Le job « Docker build » tourne sur chaque PR, pour les deux images, et échoue si un Dockerfile est cassé.
- [x] `npm audit --omit=dev` tourne dans les deux jobs : `--audit-level=high` côté frontend, `--audit-level=critical` côté backend jusqu'à B-11 (décision humaine du 2026-10-12, option 3).
- [x] Deux pushes successifs sur la même PR : le premier run est annulé.
- [x] Le jeton du workflow est en `contents: read`.
- [x] Le workflow est appelable par `uses: ./.github/workflows/ci.yml`.

## Tests à ajouter ou adapter

- Pas de test unitaire. Valider sur la PR elle-même : une PR brouillon avec trois commits volontairement fautifs (type, lint, Dockerfile), vérifier que chaque étape échoue, puis les retirer.
- `actionlint` en local sur `ci.yml` avant de pousser.

## Points d'attention

- Audit bloquant : si B-07 (montée d'`adm-zip` en 0.6) n'est pas mergé, l'audit backend échoue sur une vulnérabilité high connue. Choix à faire : attendre B-07, ou démarrer en `--audit-level=critical` et remonter le seuil ensuite.
- Noms des checks : les jobs s'appellent « Backend », « Frontend », « Docker build (backend) », « Docker build (frontend) ». D-07 les déclare comme checks obligatoires. Ne pas les renommer après coup sans mettre à jour la règle de protection.
- Transmis par D-07 : les checks obligatoires sont dans le ruleset « Require PR and CI on main and develop », créé par l'humain après le merge de D-07. Son id est noté dans le Journal de D-07 ; à défaut : `gh api repos/Lulu300/carta-cocktail/rulesets --jq '.[] | select(.name == "Require PR and CI on main and develop") | .id'`. Ajouter les checks Docker est une action humaine : lire le ruleset (`gh api repos/Lulu300/carta-cocktail/rulesets/<id>`), compléter `required_status_checks`, puis `gh api -X PUT repos/Lulu300/carta-cocktail/rulesets/<id> --input <fichier>`, une fois les jobs mergés et verts sur `develop`.
- `concurrency` et `workflow_call` : si `release.yml` déclare un groupe de concurrence identique, les deux runs s'annulent. D-05 doit utiliser un autre groupe.
- Le scope de cache GHA par service évite que les deux images s'écrasent le cache. `release.yml` partage aujourd'hui le scope par défaut, D-05 corrige.
- Épinglage des actions par SHA : faisable ici, mais à garder cohérent avec D-06 (Dependabot met à jour les SHA et les commentaires de version).

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-12 : PR #112, sans l'étape d'audit (seuil à décider, voir plus bas). `ci.yml` : `workflow_call`, `permissions: contents: read`, `concurrency` (groupe par PR avec annulation ; groupe par commit pour les pushes sur `main`/`develop` et les appels de la release, pour qu'un push n'annule jamais la CI d'un commit précédent), `node-version-file: .nvmrc`, lint backend, `npx tsc -b` côté frontend, job « Docker build (backend) » / « Docker build (frontend) » (`push: false`, `outputs: type=cacheonly` au lieu de `load: true` puisque l'image ne sert pas ensuite, cache GHA par service avec les scopes de `release.yml`, `fail-fast: false`), actions épinglées par SHA avec la version en commentaire (Dependabot les suit). Bloc `env` de l'étape de tests backend retiré : `src/test/setup.ts` impose déjà `DATABASE_URL`, les secrets, l'admin et `NODE_ENV` (tests verts en local sans ces variables). Pas de scan Trivy (optionnel) : un scan non bloquant que personne ne lit n'apporte rien pour l'instant.
- 2026-10-12 : vérifications. `actionlint` 1.7.7 sans erreur sur `ci.yml` et `release.yml`. En local : `tsc --noEmit` sort en 0 avec une erreur de type volontaire, `tsc -b` en 2 ; `npm run lint` backend sort en 1 sur une erreur volontaire ; builds amd64 des deux images avec un builder `docker-container` (comme en CI), le backend en `USER node` compris, et échec d'un Dockerfile cassé. Sur la PR : un commit fautif (type, lint, Dockerfile) a annulé le run précédent (`cancelled`), puis fait échouer « TypeScript check » (Frontend), « Lint » (Backend) et les deux « Docker build » ; commit retiré ensuite.
- 2026-10-12 : audit. `npm audit --omit=dev` : backend 4 high (`deepmerge-ts` via `@prisma/config`, `prisma`, `mysql2`), 0 critical ; frontend 0. Seuil `high` impossible sans exception tant que B-11 n'est pas faite : question posée au coordinateur, critère non coché, tâche en `review` jusqu'à la décision.
- 2026-10-12 : transmis. À D-09 : `AGENTS.md` et `frontend/AGENTS.md` recommandent `npx tsc --noEmit` côté frontend (ne vérifie rien, utiliser `npx tsc -b`), et la ligne « CI runs… » de `backend/AGENTS.md` ne cite ni le lint ni le build Docker. À D-05 (Points d'attention) : épingler les actions de `release.yml` par SHA comme `ci.yml`, groupe de concurrence `release-*` à garder distinct. Ajout des checks Docker au ruleset : action humaine, procédure dans la PR.
- 2026-10-12 : relecture de la PR #112 (APPROVE, 4 points non bloquants traités). (1) Procédure du ruleset dans la PR : garde si le ruleset « Require PR and CI on main and develop » n'existe pas encore (partie humaine de D-07 pas faite), cas de la création directe avec les quatre checks, contrôle de `.bypass_actors` avant le `PUT`, `integration_id` recopié par jq ; une PR ouverte obtient les checks Docker à son prochain push. (2) `cache-to` seulement sur push : les PR lisent le cache de leur base sans l'écrire (cache GHA du dépôt à 11,2 Go pour un quota de 10 Go). (3) Groupe de concurrence `ci-${{ github.workflow }}-…` : appelée par la release, la CI (`ci-Release-<sha>`) ne partage plus le groupe de la CI du push sur le même commit ; D-05 averti de ne pas donner `permissions: {}` à son job `ci`. (4) Descriptions de la CI devenues fausses (`AGENTS.md`, `backend/AGENTS.md`, `frontend/AGENTS.md`) écrites dans les Points d'attention de D-09, fichier ajouté à `touches`.
- 2026-10-12 : audit, décision humaine (option 3) : étape « Audit production dependencies » après `npm ci`, `--omit=dev --audit-level=high` dans le job Frontend (0 vulnérabilité), `--audit-level=critical` dans le job Backend (4 high, 0 critical : passe) avec renvoi à B-11, qui remontera le backend à `high` (étape, critère, `touches` et `depends_on` ajoutés à B-11, avec la conduite à tenir : PR de montée de version ou de surcharge, jamais de baisse du seuil). Tâche terminée.
