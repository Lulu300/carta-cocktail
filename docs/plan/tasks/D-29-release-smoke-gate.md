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
sources: ["07-devops-history.md §3.3"]
branch:
pr:
---

## Contexte

D-08 (PR #122) a ajouté `.github/workflows/smoke.yml` : il démarre la pile de `docker-compose.yml` (images construites depuis le code) et lance `scripts/smoke/smoke.sh` à travers nginx (login, upload d'une photo, persistance après recréation du backend, export de sauvegarde). Il tourne sur les PR vers `main` et `develop` et à la demande (`workflow_dispatch`).

`release.yml` (D-05, PR #118) rejoue la CI complète du commit tagué avant de pousser les images : job `ci` (`uses: ./.github/workflows/ci.yml`), dont dépend le job `images` (`needs: [verify, ci]`).

## Problème constaté

- La release ne lance pas le smoke : une image qui ne démarre pas, ou une pile qui casse l'upload, peut être publiée si le commit tagué n'est pas passé par une PR avec un smoke vert (tag posé sur un commit de merge, smoke pas encore obligatoire dans le ruleset).
- `smoke.yml` n'a pas de déclencheur `workflow_call` : `release.yml` ne peut pas l'appeler.

Relevé par la relecture de la PR #122.

## Ce qu'il faut faire

1. `smoke.yml` : ajouter `workflow_call:` aux déclencheurs. Vérifier le groupe de concurrence (`smoke-${{ github.ref }}`, `cancel-in-progress: true`) quand le workflow est appelé : le commentaire de `release.yml` sur `ci.yml` explique pourquoi un workflow appelé garde un groupe nommé d'après l'appelant ; s'assurer qu'un smoke de release ne peut pas annuler, ni être annulé par, un autre run.
2. `release.yml` : job `smoke` (`needs: verify`, `uses: ./.github/workflows/smoke.yml`), puis `images` passe à `needs: [verify, ci, smoke]`. Permissions minimales (le smoke ne demande que `contents: read`).
3. Commentaire dans `release.yml` : le smoke teste le code du tag avec des images construites en local (amd64), pas les images multi-architectures poussées ensuite ; il bloque la publication d'une pile qui ne marche pas.

## Critères d'acceptation

- [ ] Le run Release d'une pré-version exécute le smoke, et aucune image n'est poussée s'il échoue.
- [ ] Les PR continuent de lancer le smoke comme avant (même nom de check, « Smoke (docker compose) »).
- [ ] Aucun conteneur ni volume laissé par le smoke de release (`down -v` en `if: always()`, déjà dans `smoke.yml`).

## Tests à ajouter ou adapter

- `actionlint` sur les deux workflows.
- Preuve sur la prochaine pré-version (ou un tag sur une branche jetable, refusé par `verify`, pour vérifier que le smoke dépend bien de `verify`) : lien du run Release dans la PR ou dans le Journal.

## Points d'attention

- D-28 modifie aussi `release.yml` (job `verify`) : enchaîner les deux tâches.
- Le smoke ajoute environ une minute au run Release (64 s mesurées sur la PR #122, cache Docker froid).

## Journal

- 2026-10-12 : tâche créée après la relecture de la PR #122 (D-08) : le smoke ne fait pas partie du gate de la release.
