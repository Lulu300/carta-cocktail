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
touches: [.github/workflows/release.yml, docs/plan/README.md]
sources: ["07-devops-history.md §3.4"]
branch:
pr:
---

## Contexte

D-05 (PR #118) publie les versions finales avec les tags d'image `X.Y.Z`, `X.Y`, `X` et `latest` (`docker/metadata-action`, `latest` piloté par le job `verify`). Ces tags suivent la dernière version finale poussée, pas la plus haute. La revue (§3.4) proposait « `latest` uniquement pour le tag le plus élevé ».

## Problème constaté

- Si une version finale plus basse est taguée sur `main` après une plus haute (exemple : `v1.11.1` après `v1.12.0`), `latest`, `:1` et `:1.11` sont réécrits et `latest` / `:1` reculent vers `1.11.1`.
- La GitHub Release d'une version finale est toujours marquée « Latest » (`make_latest` du job `github-release`) : même recul.
- Aujourd'hui rien ne l'empêche : `verify` contrôle le format du tag et la branche (D-11), pas son rang parmi les versions finales existantes.

## Ce qu'il faut faire

1. Dans le job `verify` de `release.yml`, pour une version finale, déterminer si le tag courant est la version finale la plus haute (et la plus haute de sa mineure, pour la seconde option de l'étape 2). Réutiliser le tri de l'étape « Previous tag » (`git -c versionsort.suffix=- tag --list 'v*' --sort=-v:refname`, versions finales filtrées par `grep -v -- '-'`) plutôt qu'un second tri : étendre cette étape ou en extraire la liste, et exposer le résultat en sortie de `verify`.
2. Choisir et documenter le comportement quand le tag n'est pas le plus haut :
   - soit refuser la release (échec de `verify` avant tout push d'image, message qui explique pourquoi) ;
   - soit publier seulement `X.Y.Z` (et `X.Y` si c'est la plus haute de sa mineure), sans `X` ni `latest`.

   Dans les deux cas, `make_latest` suit la même sortie de `verify`.
3. Mettre à jour la description du modèle de release dans `docs/plan/README.md` si le comportement change pour l'utilisateur du pipeline.

## Critères d'acceptation

- [ ] Une version finale plus basse que la plus haute existante ne fait reculer ni `latest` ni `:X`, ni `:X.Y` quand une version plus haute de la même mineure existe (exemple : `v1.11.1` après `v1.11.2`), ni le badge « Latest » de la GitHub Release.
- [ ] La version finale la plus haute garde le comportement de D-05 (`X.Y.Z`, `X.Y`, `X`, `latest`), y compris quand on relance le run Release de ce tag (le tag courant figure dans la liste : égalité = plus haute).
- [ ] La décision est prise dans `verify`, avant tout push d'image.
- [ ] Les pré-versions ne changent pas.

## Tests à ajouter ou adapter

- Étape rejouée en local dans un dépôt jetable, comme le banc de D-11, sur ces cas : tag le plus haut ; plus bas qu'une autre mineure (`v1.11.2` après `v1.12.0`) ; plus bas dans sa mineure (`v1.11.1` après `v1.11.2`) ; relance du tag le plus haut ; premier tag final ; pré-version.
- Vérification réelle du chemin « plus haute » à la première version finale publiée après le merge. Le chemin « plus basse » se vérifie comme la règle de branche de D-11 (tag posé sur un ancien commit de `main`, échec avant tout push d'image, tag supprimé ensuite), avec l'accord de l'humain.

## Points d'attention

- Décision de l'humain du 2026-10-12 (relecture de D-05) : créer cette garde plutôt que de seulement documenter la règle.
- `verify` récupère déjà tous les tags (`fetch-depth: 0`) : la comparaison s'y fait. Le checkout du job `images` est superficiel et ne voit pas les tags : `images` lit seulement les sorties de `verify` (`flavor: latest=…`, et `enable=` sur les lignes `type=semver` de `metadata-action` pour la publication réduite).
- Le choix entre refus et publication réduite est soumis à l'humain dans la PR : le refus empêche de publier tout correctif d'une ancienne ligne.
- Le modèle n'a pas de branche de maintenance : le cas est rare, mais une erreur de tag ferait basculer toutes les instances qui suivent `latest`.

## Journal

- 2026-10-12 : tâche créée après la relecture de D-05 (PR #118), décision de l'humain.
