---
id: E-57
title: "Smoke : custom-uid.sh lit les journaux du backend avant la fin du message de refus"
phase: E
lane: ci
criticite: basse
effort: S
status: todo
owner: agent
depends_on: []
touches: [scripts/smoke/custom-uid.sh]
sources: []
branch: ""
pr: ""
---

## Contexte

Relevé pendant E-48 (PR #188). Le job « Smoke (docker compose) » a échoué une fois, puis réussi en relance sans changement (run 43412846014) :

```
[1] As uid 4321 on volumes owned by uid 1000, the backend refuses to start
FAIL: the refusal does not give the chown command for 4321:4321
```

## Problème constaté

`scripts/smoke/custom-uid.sh` (étape [1]) attend la première ligne du refus (`wait_for_log_line "ERROR: the backend runs as uid …"`), puis cherche tout de suite `chown -R 4321:4321` dans `docker compose logs`. Dans `backend/docker-entrypoint.sh`, `refuse_unwritable` écrit son message ligne par ligne (un `echo` par ligne) : les journaux lus juste après la première ligne peuvent ne pas contenir encore la ligne du `chown`. Le test échoue alors sans que le produit soit en cause.

## Ce qu'il faut faire

1. Attendre la ligne du `chown` comme la première, avec `wait_for_log_line` (ou attendre la dernière ligne du message avant de vérifier les autres).
2. Garder la vérification « API running » absente.

## Critères d'acceptation

- [ ] L'étape [1] ne dépend plus de l'ordre d'arrivée des lignes du refus dans les journaux.

## Tests à ajouter ou adapter

- Le job Smoke lui-même. Sonde : une pause entre deux `echo` de `refuse_unwritable` dans une branche de test fait échouer l'ancienne version et pas la nouvelle.

## Points d'attention

- Ne pas changer le texte du message de refus (documenté dans le README et UPGRADING).

## Journal

- 2026-11-13 : tâche créée pendant E-48.
