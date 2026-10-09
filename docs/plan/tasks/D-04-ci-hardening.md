---
id: D-04
title: "CI renforcée : tsc -b, lint backend, audit, build Docker sur PR"
phase: D
lane: ci
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [B-02, B-05, D-01]
touches: [.github/workflows/ci.yml]
sources: ["07-devops-history.md §3.3"]
branch:
pr:
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

- [ ] Une erreur de type volontaire dans un fichier `frontend/src/**` fait échouer l'étape « TypeScript check ».
- [ ] Une erreur ESLint volontaire dans `backend/src/**` fait échouer le job Backend.
- [ ] Le job « Docker build » tourne sur chaque PR, pour les deux images, et échoue si un Dockerfile est cassé.
- [ ] `npm audit --omit=dev --audit-level=high` tourne dans les deux jobs.
- [ ] Deux pushes successifs sur la même PR : le premier run est annulé.
- [ ] Le jeton du workflow est en `contents: read`.
- [ ] Le workflow est appelable par `uses: ./.github/workflows/ci.yml`.

## Tests à ajouter ou adapter

- Pas de test unitaire. Valider sur la PR elle-même : une PR brouillon avec trois commits volontairement fautifs (type, lint, Dockerfile), vérifier que chaque étape échoue, puis les retirer.
- `actionlint` en local sur `ci.yml` avant de pousser.

## Points d'attention

- Audit bloquant : si B-07 (montée d'`adm-zip` en 0.6) n'est pas mergé, l'audit backend échoue sur une vulnérabilité high connue. Choix à faire : attendre B-07, ou démarrer en `--audit-level=critical` et remonter le seuil ensuite.
- Noms des checks : les jobs s'appellent « Backend », « Frontend », « Docker build (backend) », « Docker build (frontend) ». D-07 les déclare comme checks obligatoires. Ne pas les renommer après coup sans mettre à jour la règle de protection.
- `concurrency` et `workflow_call` : si `release.yml` déclare un groupe de concurrence identique, les deux runs s'annulent. D-05 doit utiliser un autre groupe.
- Le scope de cache GHA par service évite que les deux images s'écrasent le cache. `release.yml` partage aujourd'hui le scope par défaut, D-05 corrige.
- Épinglage des actions par SHA : faisable ici, mais à garder cohérent avec D-06 (Dependabot met à jour les SHA et les commentaires de version).

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
