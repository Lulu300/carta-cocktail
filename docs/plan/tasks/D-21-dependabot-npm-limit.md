---
id: D-21
title: "Dependabot : réactiver les mises à jour npm après la phase B"
phase: D
lane: ci
criticite: basse
effort: S
status: done
owner: mixed
depends_on: [D-06, B-01, B-02, B-03, B-04, B-05, B-06, B-07, B-08, B-09, B-10, B-11]
touches: [.github/dependabot.yml]
sources: ["07-devops-history.md §3.5"]
branch: chore/D-21-dependabot-npm-limit
pr: https://github.com/Lulu300/carta-cocktail/pull/220
---

## Contexte

D-06 a ajouté `.github/dependabot.yml`. Décision humaine du 2026-10-11 : pour les deux entrées npm (`/backend` et `/frontend`), `open-pull-requests-limit: 0` tant que la phase B n'est pas terminée. La phase B met les dépendances à jour par lots planifiés et n'autorise qu'une tâche à la fois sur le lockfile d'un paquet : des PR Dependabot ouvertes en même temps créeraient des conflits de lockfile. Docker et GitHub Actions ont une configuration normale dès D-06.

## Problème constaté

- Avec une limite à 0, Dependabot ne propose aucune mise à jour de version npm. Les mises à jour de sécurité ne sont pas concernées par cette limite, mais elles sont désactivées (décision du 2026-10-11) : seules les « Dependabot alerts » signalent les failles, et les correctifs passent à la main par `develop`.
- Si personne ne relève la limite, les dépendances npm cessent d'être suivies, ce que D-06 voulait éviter.

## Ce qu'il faut faire

1. Vérifier que toutes les tâches de la phase B sont `done` (`node docs/plan/build.mjs --ready` : D-21 apparaît prête).
2. Dans `.github/dependabot.yml`, passer `open-pull-requests-limit` de `0` à `5` sur les deux entrées npm, et retirer le commentaire qui explique la limite à 0.
3. Revoir la liste `ignore` : les majeures encore planifiées dans une tâche ouverte (Prisma pour C-15, TypeScript pour F-07) restent ignorées ; ajouter temporairement à `ignore` les majeures qu'une autre tâche `deps` ouverte prévoit de faire.
4. Reconsidérer avec l'humain « Dependabot security updates » (désactivées le 2026-10-11, seules les alertes sont actives). Après la phase B, le risque de conflit de lockfile avec les tâches `deps` disparaît, mais ces PR visent toujours la branche par défaut (`main`) et ignorent `ignore`, `groups` et `labels` de ce fichier. Si l'humain les active (Settings > Code security), le noter dans le Journal.
5. Valider le fichier : `check-jsonschema --builtin-schema vendor.dependabot .github/dependabot.yml` (ou `pipx run check-jsonschema …`).

## Critères d'acceptation

- [x] Les deux entrées npm ont `open-pull-requests-limit: 5`.
- [x] Le fichier passe la validation du schéma Dependabot.
- [ ] La décision humaine sur « Dependabot security updates » est consignée dans le Journal.
- [ ] Après merge, « Check for updates » (Insights > Dependency graph > Dependabot) ouvre au plus une PR groupée mineure/patch par paquet, vers `develop`.

## Tests à ajouter ou adapter

- Pas de test automatisé. Contrôler les premières PR npm : branche cible, labels, groupement, CI verte.

## Points d'attention

- C-15 (Prisma 7) est en phase C mais touche aussi le lockfile backend. Si elle est en cours au moment de relever la limite, attendre son merge ou ajouter `prisma` et `@prisma/client` à `ignore` pour toutes les versions le temps de la tâche.
- La première vague peut être grosse (plusieurs mois de mises à jour). Les traiter une par une, en relançant la CI après chaque merge.

## Journal

- 2026-10-11 : tâche créée par D-06 pour relever la limite npm à la fin de la phase B (décision humaine du 2026-10-11).
- 2026-10-11 : `owner: mixed` : « Check for updates » et la décision sur les security updates demandent l'humain.
- 2026-10-12 : relecture de C-15 (PR #103) : la majeure Prisma 8 doit aussi être ignorée (ou groupée) pour `@prisma/adapter-better-sqlite3`, sinon elle arrive seule, décalée du client ; `better-sqlite3` 13 sort de la plage `^12.6` de l'adapter.
- 2026-11-25 : PR #220, étapes 1, 2, 3 et 5. Étape 1 : D-06 et B-01 à B-11 sont `done` ; B-14 et B-22 restent ouvertes mais hors `depends_on` (B-22 le précise). Étape 2 : `open-pull-requests-limit: 5` sur les deux entrées npm, commentaire de la limite à 0 retiré. Étape 3, registre au 2026-11-25 : `typescript` majeure toujours ignorée (F-07) ; `prisma` et `@prisma/client` gardées, `@prisma/adapter-better-sqlite3` et `better-sqlite3` ajoutées (Prisma monte en bloc ; `better-sqlite3` 13.2.0 est sortie mais l'adapter 7.10.1 demande `^12.6.0`), suivies par la nouvelle tâche D-47 ; `@types/node` majeure ignorée dans les deux paquets (suit Node 24 des images et de la CI, 26.x publiée). `prisma@latest` = 8.0.0-rc.35, stable 7.10.1 sous `prev` : Dependabot ne propose pas la rc (dependabot-core, `latest_version_finder.rb` : le dist-tag `latest` n'est retenu que si son statut de pré-version est celui de la version actuelle, et les pré-versions sont écartées tant que la version actuelle est stable). Majeures laissées à Dependabot, sans tâche prévue : `msw` 3, `jsdom` 31, `@hookform/resolvers` 7, `@testing-library/jest-dom` 8, `@types/supertest` 7 ; `@types/bcryptjs` 3.0.0 est un stub déprécié, que Dependabot écarte. Surcharges `effect` (B-24) et `minimatch` sous `readdir-glob` (B-22) inchangées. Étape 5 : `check-jsonschema --builtin-schema vendor.dependabot` (0.39.0) valide.
- 2026-11-25 : étape 4 en attente de l'humain, aucun réglage GitHub modifié. État par `gh api` : `automated-security-fixes` → `enabled: false` (`dependabot_security_updates: disabled`), alertes Dependabot actives (`vulnerability-alerts` → 204), 0 alerte ouverte, branche par défaut `main`. Si elles sont activées : PR vers `main` ; avec `target-branch: develop` sur chaque entrée, les options de l'entrée (`ignore`, `groups`, `labels`, `commit-message`) ne s'appliquent plus aux mises à jour de sécurité (doc GitHub, « Dependabot options reference », `target-branch`) ; limite fixe de 10 PR ouvertes, pas de délai de 3 jours par défaut ; le correctif mergé sur `main` doit revenir sur `develop`, avec un conflit possible sur un lockfile modifié entre-temps sur `develop` (PR Dependabot groupée ou tâche `deps`). Tâche passée `done` pour les étapes de fichier ; la décision de l'humain et le contrôle des premières PR (« Check for updates ») restent à consigner ici.
