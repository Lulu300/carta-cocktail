---
id: D-20
title: "Banc de mise à jour : premier démarrage en KO sur un chemin qui part après 1.4.0 (layout friend)"
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

Le banc de mise à jour (D-15) démarre la première version du chemin avec le compose de la génération du layout. Pour le layout `friend`, un chemin qui commence à 1.5.0 ou après démarre donc avec `compose-1.4.0.yml`, qui monte les photos sur `/uploads`. Vu le 2026-10-11 en vérifiant C-16 (`--layout friend --path 1.5.0,local`).

## Problème constaté

- Au premier démarrage (« Start 1.5.0 »), dans les deux modes, trois contrôles sont en KO : photos via le backend, photos via le nginx du frontend, dossier d'uploads qui survit à la recréation du conteneur (42 photos sur 42 en 404).
- Ces échecs sont attendus : c'est l'état d'une instance `friend` qui a pris v1.5.0 sans appliquer ses notes. Mais `naiveMayFail` ne s'applique qu'aux sauts, pas au premier démarrage. Le résumé affiche donc **KO** et le code de sortie vaut `1`, alors que l'étape `local` est OK dans les deux modes.
- Un chemin conseillé pour vérifier une tâche (« à partir de 1.5.0 ») ne peut donc pas finir en code `0`.

## Ce qu'il faut faire

1. Au premier démarrage, marquer comme attendus les échecs dus au layout quand celui-ci monte les photos sur un dossier que la version ne lit plus (même cause que celle déjà donnée pour les sauts en mode naïf), ou démarrer le mode conforme avec le compose de la génération de la première version.
2. Garder ces lignes visibles dans le rapport, avec la cause.
3. Mettre à jour `scripts/upgrade-test/README.md`.

## Critères d'acceptation

- [ ] `node scripts/upgrade-test/run.mjs --fixture <dir> --layout friend --path 1.5.0,local` finit en code `0` quand l'étape `local` passe, et le rapport donne la cause des KO du premier démarrage.
- [ ] Un échec inattendu au premier démarrage (backend qui ne démarre pas, perte de lignes) reste en KO.

## Tests à ajouter ou adapter

- Tests unitaires de `lib/expectations.mjs` : premier démarrage du layout `friend` à partir de 1.5.0.

## Points d'attention

- Ne pas masquer un vrai problème au premier démarrage : seuls les groupes liés aux photos sont concernés.

## Journal

- 2026-10-11 : tâche créée pendant C-16 (banc `friend`, chemin `1.5.0,local`).
