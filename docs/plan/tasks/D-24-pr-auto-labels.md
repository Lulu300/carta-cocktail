---
id: D-24
title: "Labels de PR automatiques pour les notes de release"
phase: D
lane: ci
criticite: basse
effort: S
status: todo
owner: mixed
depends_on: [D-07]
touches: [.github/labeler.yml, .github/workflows/labeler.yml]
sources: ["07-devops-history.md §1.3"]
branch:
pr:
---

## Contexte

D-07 a ajouté `.github/release.yml` : la liste des PR des notes de release (job « Create GitHub Release » de `.github/workflows/release.yml`) est classée par label (`breaking`, `feature`, `fix`, `dependencies`, `ci`, `docs`). Les titres de PR suivent le format du plan (`A-02: …`), donc seul le label permet de classer une PR.

## Problème constaté

- Aucune PR du plan ne porte de label (vérifié sur les PR #85 à #93). Seules les PR Dependabot en reçoivent (`dependencies`, `ci`, `docker`, `backend`, `frontend`, via `.github/dependabot.yml`).
- Sans label, une PR tombe dans la catégorie « Other changes » : le classement de D-07 reste vide en pratique.
- Le modèle de PR de D-07 demande d'ajouter un label, mais un oubli passe inaperçu.

## Ce qu'il faut faire

1. Ajouter `.github/labeler.yml` (format `actions/labeler` v5 ou plus, règle `head-branch`) qui déduit le label du préfixe de branche du plan (`docs/plan/README.md`, règle 3) : `fix/` → `fix`, `feature/` → `feature`, `docs/` → `docs`. `chore/` ne reçoit rien d'office (dépendances ou outillage : label à poser à la main).
2. Ajouter `.github/workflows/labeler.yml` sur `pull_request_target` (types `opened`, `reopened`), `permissions: { contents: read, pull-requests: write }`, sans checkout du code de la PR (le workflow ne lit que la configuration de la branche de base).
3. Partie humaine : créer les labels manquants (`breaking`, `feature`, `fix`, `docs`, `skip-changelog`) si D-07 ne l'a pas déjà fait (commandes dans la PR de D-07).
4. `breaking` reste manuel : la PR qui a une section « Required actions » avec `breaking: true` le pose elle-même.

## Critères d'acceptation

- [ ] Une PR depuis `fix/X-00-…` reçoit le label `fix` à l'ouverture, une PR depuis `feature/…` reçoit `feature`, une PR depuis `docs/…` reçoit `docs`.
- [ ] Le workflow n'exécute aucun code de la PR (pas de checkout de `head`).
- [ ] `gh api repos/Lulu300/carta-cocktail/releases/generate-notes -f tag_name=vtest -f target_commitish=develop -f previous_tag_name=<dernier tag>` classe les PR labellisées dans leurs catégories (appel sans effet de bord, rien n'est publié).

## Tests à ajouter ou adapter

- Pas de test automatisé.
- `pull_request_target` exécute le workflow tel qu'il est sur la branche de base : il ne tourne donc pas sur la PR de D-24 elle-même, et rien ne prouve qu'il fonctionne avant le merge. Le contrôle se fait **après le merge dans `develop`** : ouvrir une PR brouillon depuis une branche `fix/` vers `develop`, vérifier qu'elle reçoit le label `fix`, puis la fermer.

## Points d'attention

- `pull_request_target` s'exécute avec les droits de la branche de base : ne jamais y ajouter un checkout ou un `run` qui utilise le code de la PR.
- Si le ruleset de D-07 rend des checks obligatoires, ne pas y ajouter ce workflow : un label manquant ne doit pas bloquer un merge.
- Avec la suppression automatique des branches (réglage de D-07), la branche disparaît après le merge ; le label, lui, reste sur la PR, ce qui suffit aux notes.

## Journal

- 2026-10-12 : tâche créée par D-07 : `.github/release.yml` classe les PR par label, mais aucune PR du plan n'en porte.
- 2026-10-12 : revue de la PR #97 (D-07) : le contrôle du labeler se fait après le merge de D-24 (`pull_request_target`) ; la branche disparaît par suppression automatique, pas par squash (merge commit retenu partout).
