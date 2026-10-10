---
id: D-17
title: "Banc de mise à jour : version par défaut de l'étape local"
phase: D
lane: ci
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [D-15]
touches: [scripts/upgrade-test/]
sources: []
branch:
pr:
---

## Contexte

Le banc de mise à jour (D-15) rejoue un chemin de versions, par exemple `1.4.0,1.6.0,local`. L'étape `local` construit les images depuis le checkout et suit les notes de version de `--local-version`. Sans cette option, il prend la version du hook le plus récent de `scripts/upgrade-test/hooks/` (`latestHookVersion`, `run.mjs:155`). Vu le 2026-10-10 en vérifiant B-01 (PR #53).

## Problème constaté

- Depuis la sortie de v1.6.0, le hook le plus récent est `1.6.0.mjs`. L'étape `local` vaut donc `1.6.0`, et `parseUpgradePath` (`lib/versions.mjs:65-68`) refuse le chemin `1.4.0,1.6.0,local` : « --path must go up: 1.6.0 -> local » (code de sortie 2).
- C'est pourtant le cas courant : tester le checkout de `develop` à partir de la dernière version publiée. Le README du banc ne montre que `1.6.0-rc.1,local`, qui marche parce que la pré-version est plus petite que `1.6.0`.
- Contournement actuel : `--local-version 1.7.0` (une version sans hook hérite du profil de la précédente et n'a pas d'action obligatoire).

## Ce qu'il faut faire

1. Choisir une valeur par défaut qui « monte » toujours après le dernier hook. Par exemple : version suivante du dernier hook (mineure suivante, `1.7.0`), ou version suivante de la dernière étape publiée du chemin. Garder `--local-version` pour forcer une valeur (notes d'une version en préparation qui a déjà son hook).
2. Si la valeur par défaut est égale ou inférieure à l'étape précédente, donner un message d'erreur qui propose `--local-version`.
3. Mettre à jour `scripts/upgrade-test/README.md` : exemple `<dernière version>,local` et rôle de `--local-version`.

## Critères d'acceptation

- [ ] `node scripts/upgrade-test/run.mjs --fixture <dir> --layout friend --path 1.4.0,1.6.0,local --mode conformant` démarre sans `--local-version`.
- [ ] `--local-version` garde la priorité sur la valeur par défaut.
- [ ] Un chemin qui descend reste refusé, avec un message qui cite `--local-version`.
- [ ] README du banc à jour.

## Tests à ajouter ou adapter

- `scripts/upgrade-test/test/` : tests unitaires de `parseUpgradePath` et de la valeur par défaut (dernier hook = 1.6.0 → `local` après `1.6.0` accepté ; `--local-version` explicite ; chemin descendant refusé). `node --test scripts/upgrade-test/test/*.test.mjs`.

## Points d'attention

- Une étape `local` sans hook hérite du profil de la version précédente : vérifier que les actions obligatoires d'un hook futur (ex. `1.7.0.mjs` ajouté avec ses notes) s'appliquent bien quand ce hook existe.
- Le jeu d'essai réel contient des données personnelles : ne rien copier dans le dépôt, ne publier que des comptes dans la PR.

## Journal

- 2026-10-10 : tâche créée pendant B-01 (PR #53) : le banc refusait `1.4.0,1.6.0,local` sans `--local-version 1.7.0`.
