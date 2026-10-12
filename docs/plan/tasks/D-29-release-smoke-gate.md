---
id: D-29
title: "Release : lancer le smoke compose avant de pousser les images"
phase: D
lane: ci
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [D-05, D-08]
touches: [.github/workflows/release.yml, .github/workflows/smoke.yml]
sources: ["07-devops-history.md §3.3", "07-devops-history.md §3.4"]
branch:
pr:
---

## Décisions validées (2026-10-12)

- **Smoke dans la release** : le run Release lance le smoke avant de pousser les images (option retenue par l'humain, plutôt qu'un smoke sur `push` ou l'abandon de la tâche).

## Contexte

D-08 (PR #122) a ajouté `.github/workflows/smoke.yml` : il démarre la pile de `docker-compose.yml` (images construites depuis le code) et lance `scripts/smoke/smoke.sh` à travers nginx (login, upload d'une photo, persistance après recréation du backend, export de sauvegarde). Il tourne sur les PR vers `main` et `develop` et à la demande (`workflow_dispatch`).

`release.yml` (D-05, PR #118) rejoue la CI complète du commit tagué avant de pousser les images : job `ci` (`uses: ./.github/workflows/ci.yml`), dont dépend le job `images` (`needs: [verify, ci]`).

## Problème constaté

- Le smoke ne tourne que sur `pull_request`, c'est-à-dire sur la ref de merge au moment du push de la PR. Le ruleset n'exige pas une branche à jour (`strict_required_status_checks_policy: false`) : après deux PR mergées l'une après l'autre, le sommet de `develop`, celui qu'on tague, n'est jamais passé au smoke. Ce trou reste ouvert même quand le check sera obligatoire.
- La release ne lance pas le smoke, et `smoke.yml` n'a pas de déclencheur `workflow_call` : `release.yml` ne peut pas l'appeler.

Relevé par la relecture de la PR #122, précisé par celle de la PR #129.

## Ce qu'il faut faire

1. `smoke.yml` : ajouter `workflow_call:` aux déclencheurs. Concurrence : dans un workflow appelé, le contexte `github` est celui de l'appelant (`github.ref` = `refs/tags/vX.Y.Z`, `github.event_name` = `push`). Le groupe `smoke-${{ github.ref }}` devient donc `smoke-refs/tags/vX.Y.Z`, distinct des PR (`refs/pull/N/merge`) et du groupe de la release. Seul un lancement manuel de Smoke sur le même tag le partage : passer `cancel-in-progress` à `${{ github.event_name == 'pull_request' }}`, comme `ci.yml`, pour qu'il n'annule pas le smoke de la release.
2. `release.yml` : job `smoke` (`needs: verify`, `uses: ./.github/workflows/smoke.yml`), puis `images` passe à `needs: [verify, ci, smoke]`. Rien à ajouter côté permissions : `release.yml` est en `contents: read` au niveau global et un workflow appelé ne reçoit jamais plus que l'appelant.
3. Commentaire dans `release.yml` : le smoke teste le code du tag avec des images amd64 construites en local, pas les images multi-architectures poussées ensuite ; il bloque la publication d'une pile qui ne marche pas.

## Critères d'acceptation

- [ ] Le run Release d'une pré-version exécute le smoke (check « Smoke / Smoke (docker compose) ») sur le commit du tag (checkout par défaut d'`actions/checkout` dans un appel), et aucune image n'est poussée s'il échoue.
- [ ] Un lancement manuel de Smoke sur le même tag n'annule pas le smoke de la release.
- [ ] Les PR continuent de lancer le smoke comme avant (même nom de check, « Smoke (docker compose) »).
- [ ] Aucun conteneur ni volume laissé par le smoke de release (`down -v` en `if: always()`, déjà dans `smoke.yml`).

## Tests à ajouter ou adapter

- `actionlint` sur les deux workflows.
- Preuve sur la prochaine pré-version (ou un tag sur une branche jetable, refusé par `verify`, pour vérifier que le smoke dépend bien de `verify`) : lien du run Release dans la PR ou dans le Journal.

## Points d'attention

- D-28 et C-23 (prêtes) modifient aussi `release.yml`, comme F-04 et F-09 plus tard : enchaîner ces tâches.
- Avec `needs: verify`, le smoke tourne en parallèle de `ci` (environ 1 min contre 2 min pour Backend et Frontend sur la PR #129) : la durée du run ne change pas, seules les minutes de runner augmentent.

## Journal

- 2026-10-12 : tâche créée après la relecture de la PR #122 (D-08) : le smoke ne fait pas partie du gate de la release. Décision humaine à la relecture de la PR #129 : garder la tâche (smoke dans la release), plutôt qu'un smoke sur `push` ou l'abandon.
