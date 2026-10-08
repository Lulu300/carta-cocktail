---
id: D-06
title: "Dependabot (npm, Docker, GitHub Actions)"
phase: D
lane: ci
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [A-07, B-01]
touches: [.github/dependabot.yml]
sources: ["07-devops-history.md §3.5"]
branch:
pr:
---

## Contexte

Aucune dépendance n'a été mise à jour depuis février : les lockfiles datent du 23 février et Node 20 est resté dans les Dockerfiles après sa fin de vie. Pour un projet solo travaillé par sessions espacées, l'outil doit proposer les mises à jour, sinon personne ne les fait. Dependabot couvre les deux paquets npm, les images de base Docker et les actions GitHub.

## Problème constaté

- `.github/` ne contient que `scripts/delta-coverage.mjs` et `workflows/{ci,release}.yml`. Pas de `dependabot.yml`, pas de Renovate.
- Les actions sont épinglées par tag majeur (`ci.yml:18,22,54`, `release.yml:21,24,27,42,98`) : sans outil, leurs mises à jour passent aussi inaperçues.
- `backend/Dockerfile:1` et `frontend/Dockerfile:1,11` utilisent des images de base que rien ne surveille (B-01 et D-02 les épinglent).

## Ce qu'il faut faire

1. Vérifier que B-01 est mergé (Node 24, lockfiles à jour). Sinon la première vague de PR Dependabot recouvre B-01.
2. Créer `.github/dependabot.yml` :
   ```yaml
   version: 2
   updates:
     - package-ecosystem: npm
       directory: /backend
       target-branch: develop
       schedule: { interval: weekly, day: monday, timezone: Europe/Paris }
       open-pull-requests-limit: 5
       commit-message: { prefix: "chore(deps)" }
       labels: [dependencies, backend]
       groups:
         backend-minor-patch:
           update-types: [minor, patch]
       ignore:
         - dependency-name: "prisma"
           update-types: ["version-update:semver-major"]
         - dependency-name: "@prisma/client"
           update-types: ["version-update:semver-major"]
         - dependency-name: "typescript"
           update-types: ["version-update:semver-major"]

     - package-ecosystem: npm
       directory: /frontend
       target-branch: develop
       schedule: { interval: weekly, day: monday, timezone: Europe/Paris }
       open-pull-requests-limit: 5
       commit-message: { prefix: "chore(deps)" }
       labels: [dependencies, frontend]
       groups:
         frontend-minor-patch:
           update-types: [minor, patch]
       ignore:
         - dependency-name: "typescript"
           update-types: ["version-update:semver-major"]

     - package-ecosystem: docker
       directories: [/backend, /frontend]
       target-branch: develop
       schedule: { interval: weekly, day: monday, timezone: Europe/Paris }
       commit-message: { prefix: "chore(docker)" }
       labels: [dependencies, docker]
       ignore:
         - dependency-name: "node"
           update-types: ["version-update:semver-major"]

     - package-ecosystem: github-actions
       directory: /
       target-branch: develop
       schedule: { interval: monthly }
       commit-message: { prefix: "chore(ci)" }
       labels: [dependencies, ci]
       groups:
         actions:
           patterns: ["*"]
   ```
3. Créer les labels `dependencies`, `backend`, `frontend`, `docker`, `ci` s'ils n'existent pas (`gh label create ...`). Dependabot n'applique pas un label qui n'existe pas.
4. Valider le fichier avant de pousser : `pipx run check-jsonschema --builtin-schema vendor.dependabot .github/dependabot.yml`.

## Critères d'acceptation

- [ ] `.github/dependabot.yml` existe et GitHub l'accepte (aucune erreur dans Insights > Dependency graph > Dependabot).
- [ ] Les 4 écosystèmes apparaissent (npm backend, npm frontend, docker, github-actions).
- [ ] Les PR Dependabot ciblent `develop`, pas `main`.
- [ ] Les mises à jour mineures et patch d'un même paquet npm arrivent en une seule PR groupée.
- [ ] Les majeures de Prisma, TypeScript et Node ne génèrent pas de PR.

## Tests à ajouter ou adapter

- Pas de test automatisé. Après merge, déclencher une vérification manuelle (Insights > Dependency graph > Dependabot > « Check for updates ») et contrôler les premières PR : branche cible, labels, groupement, CI verte.

## Points d'attention

- Les majeures ignorées sont celles déjà planifiées : Prisma (C-15), TypeScript (F-07), Node (changement de LTS fait à la main). Les autres majeures (Vite, ESLint, Vitest, i18next...) arrivent en PR séparées. Tant que B-04, B-05, B-06 et B-07 ne sont pas mergés, fermer ces PR avec un renvoi vers la tâche, ou ajouter temporairement les paquets à `ignore`.
- Le README du plan impose une seule tâche à la fois sur les lockfiles d'un paquet. Une PR Dependabot ouverte en même temps qu'une tâche `deps` crée un conflit de lockfile. Option à valider : `open-pull-requests-limit: 0` pour npm tant que la phase B n'est pas terminée.
- `directories` (pluriel) sur l'écosystème docker suppose un `FROM` à tag littéral : Dependabot ne met pas à jour une image dont le tag vient d'un `ARG`. D-01 et D-02 doivent garder des tags littéraux.
- Le dossier `e2e/` de F-04 aura son propre `package.json` : ajouter alors une entrée npm `/e2e`.
- Action humaine facultative : activer « Dependabot alerts » et « Dependabot security updates » dans Settings > Code security. Le fichier seul ne fait que les mises à jour de version. Voir aussi D-07.
- Le préfixe `chore(deps)` suppose l'adoption de Conventional Commits (D-07). L'ajuster si l'humain choisit une autre convention.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
