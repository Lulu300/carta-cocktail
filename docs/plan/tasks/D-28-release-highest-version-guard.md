---
id: D-28
title: "Release : ne pas faire reculer `latest`, `:X` et `:X.Y` avec une version finale plus basse"
phase: D
lane: ci
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [D-05]
touches: [.github/workflows/release.yml]
sources: ["07-devops-history.md §3.4"]
branch:
pr:
---

## Contexte

D-05 (PR #118) publie les versions finales avec les tags d'image `X.Y.Z`, `X.Y`, `X` et `latest` (`docker/metadata-action`, `latest` piloté par le job `verify`). Ces tags suivent la dernière version finale poussée, pas la plus haute. La revue (§3.4) proposait « `latest` uniquement pour le tag le plus élevé ».

## Problème constaté

- Si une version finale plus basse est taguée sur `main` après une plus haute (exemple : `v1.11.1` après `v1.12.0`), `latest`, `:1` et `:1.11` sont réécrits et `latest` / `:1` reculent vers `1.11.1`.
- Aujourd'hui rien ne l'empêche : `verify` contrôle le format du tag et la branche (D-11), pas son rang parmi les versions finales existantes.

## Ce qu'il faut faire

1. Dans le job `verify` de `release.yml`, pour une version finale : lister les tags `vX.Y.Z` finaux existants (hors `-rc.N`) et comparer avec le tag courant (tri semver, par exemple `sort -V`).
2. Choisir et documenter le comportement quand le tag n'est pas le plus haut :
   - soit refuser la release (échec de `verify` avant tout push d'image, message qui explique pourquoi) ;
   - soit publier seulement `X.Y.Z` (et `X.Y` si c'est la plus haute de sa mineure), sans `X` ni `latest`.
3. Mettre à jour la description du modèle de release dans `docs/plan/README.md` si le comportement change pour l'utilisateur du pipeline.

## Critères d'acceptation

- [ ] Une version finale plus basse que la plus haute existante ne fait reculer ni `latest` ni `:X`.
- [ ] La version finale la plus haute garde le comportement de D-05 (`X.Y.Z`, `X.Y`, `X`, `latest`).
- [ ] Les pré-versions ne changent pas.

## Tests à ajouter ou adapter

- Script de comparaison testé en local sur une liste de tags (cas : plus haute, plus basse, égale à une mineure existante, premier tag).
- Vérification réelle à la première version finale publiée après le merge (pas de tag jetable, décision du 2026-10-09).

## Points d'attention

- Décision de l'humain du 2026-10-12 (relecture de D-05) : créer cette garde plutôt que de seulement documenter la règle.
- `actions/checkout` doit récupérer les tags (`fetch-depth: 0` ou `git fetch --tags`) pour que la comparaison voie toutes les versions.
- Le modèle n'a pas de branche de maintenance : le cas est rare, mais une erreur de tag ferait basculer toutes les instances qui suivent `latest`.

## Journal

- 2026-10-12 : tâche créée après la relecture de D-05 (PR #118), décision de l'humain.
