---
id: C-46
title: "Banc de mise à jour : reconnaître le refus « cannot write » de D-01"
phase: C
lane: ci
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-41]
touches: [scripts/upgrade-test/]
sources: []
branch:
pr:
---

## Contexte

Relecture des notes de v1.12.0 (PR #152, point M2). Depuis D-01 (#108), le backend tourne en uid 1000 et l'entrypoint refuse de démarrer quand il ne peut pas écrire dans `/app/data` ou `/app/uploads` (« cannot write to /app/data »). Le banc ne connaît que le refus d'une migration en échec (`FAILED_MIGRATION_REFUSAL`, C-18/C-37).

## Problème constaté

Avec `--inject-duplicate --mode naive` sur le layout `official`, les volumes nommés gardent leur propriétaire même sous Docker Desktop : en mode naïf, le saut vers v1.12.0 est refusé pour « cannot write » avant la migration. `checkInjectedDuplicateRefused` rapporte alors un échec inattendu (« refused, but not by the failed migration: no known refusal message »). Constat du relecteur sur `hooks/1.12.0.mjs` ; à la release v1.12.0, `--inject-duplicate` n'a été passé que sur `friend` (montages de dossiers, propriétaires ignorés par Docker Desktop), où il passe.

## Ce qu'il faut faire

1. Ajouter le refus « cannot write » de l'entrypoint aux refus connus (`lib/checks.mjs`), avec son contrôle (aucune écriture dans la base).
2. Avec `--inject-duplicate`, quand le démarrage est refusé pour « cannot write » en mode naïf, marquer la ligne du doublon comme non applicable (le doublon n'a pas pu être testé) au lieu d'un échec.
3. Lister ce refus dans `profile.refusals` du hook 1.12.0 si nécessaire, et documenter le cas dans `scripts/upgrade-test/README.md`.

## Critères d'acceptation

- [ ] `--layout official --path 1.4.0,<version ≥ 1.12.0> --mode both --inject-duplicate` passe sans échec inattendu.
- [ ] Le layout `friend` donne le même résultat qu'avant.
- [ ] Tests `node --test scripts/upgrade-test/test/*.test.mjs` ajoutés et verts.

## Points d'attention

- Le jeu d'essai reste hors du dépôt, et le rapport ne contient que des nombres.
- Banc et images à nom fixe : un verrou `mkdir` si deux agents le lancent en même temps.

## Journal
