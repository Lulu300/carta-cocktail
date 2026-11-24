---
id: D-20
title: "Banc de mise à jour : premier démarrage en KO sur un chemin qui part après 1.4.0 (layout friend)"
phase: D
lane: ci
criticite: basse
effort: S
status: done
owner: agent
depends_on: [D-15]
touches: [scripts/upgrade-test/]
sources: []
branch: chore/D-20-upgrade-bench-first-start
pr: 217
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

- [x] `node scripts/upgrade-test/run.mjs --fixture <dir> --layout friend --path 1.5.0,local` finit en code `0` quand l'étape `local` passe, et le rapport donne la cause des KO du premier démarrage. Vérifié avec `1.5.0,1.14.0` : le premier démarrage n'a plus de KO, le rapport liste les actions des notes appliquées pour l'atteindre et dit comment le premier pas est atteint.
- [x] Un échec inattendu au premier démarrage (backend qui ne démarre pas, perte de lignes) reste en KO.

## Tests à ajouter ou adapter

- Tests unitaires de `lib/expectations.mjs` : premier démarrage du layout `friend` à partir de 1.5.0.

## Points d'attention

- Ne pas masquer un vrai problème au premier démarrage : seuls les groupes liés aux photos sont concernés.

## Journal

- 2026-10-11 : tâche créée pendant C-16 (banc `friend`, chemin `1.5.0,local`).
- 2026-11-24 : reproduit sur `develop` avec une copie de la fixture, plus largement que décrit : tout chemin qui part après 1.4.0 a un premier démarrage KO dans les deux modes et les deux layouts (photos, port 8080 du frontend dès 1.8.0, volumes de root refusés par l'image non-root dès 1.12.0), et le saut naïf suivant hérite de ces échecs comme attendus. Correction (seconde option de « Ce qu'il faut faire », étendue aux deux modes) : le premier pas est un saut depuis la version de la fixture (`stepOrigin`), qui applique les actions des notes traversées depuis 1.4.0 et est jugé comme en mode conforme (`stepMode`) ; aucun échec du premier démarrage n'est plus attendu, hors bugs connus de la version. Banc : `friend` depuis 1.4.0, 1.5.0, 1.8.0 et 1.12.0, `official` depuis 1.4.0, 1.8.0 et 1.12.0, jusqu'à 1.14.0, mode `both` : tous OK, code 0 (avant : code 1). Hors périmètre : D-45 (`chownMounts` lit les montages de l'ancien conteneur). Notes de version : aucune (outil de développement). PR #217.
- 2026-11-25 : relecture de #217 approuvée. Le choix fait pour chaque pas (origine, mode, notes traversées) est extrait dans `stepPlan` (`lib/expectations.mjs`), testé avec les vrais fichiers de hooks : revenir à l'ancien premier pas (mode du passage, ou aucune note traversée) fait échouer 2 et 3 tests. Le README signale l'`ADMIN_PASSWORD` de 6 caractères gardé dans le fichier d'env d'un chemin `friend` qui part après 1.4.0, sans effet sur les contrôles. Le comportement du banc ne change pas : pas de nouveau passage.
