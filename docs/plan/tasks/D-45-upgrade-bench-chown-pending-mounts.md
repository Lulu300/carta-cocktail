---
id: D-45
title: "Banc de mise à jour : chownMounts lit les montages de l'ancien conteneur sur un saut direct (layout friend)"
phase: D
lane: ci
criticite: basse
effort: S
status: done
owner: agent
depends_on: [D-20]
touches: [scripts/upgrade-test/lib/actions.mjs, scripts/upgrade-test/README.md]
sources: []
branch: fix/D-45-bench-chown-pending-mounts
pr: 0
---

## Contexte

L'action `chownMounts` (v1.12.0 Before 3) donne à l'uid 1000 les volumes ou dossiers montés sur `/app/data` et `/app/uploads`. Elle lit ces montages par `docker inspect` sur le conteneur backend arrêté, c'est-à-dire celui de l'étape précédente. Les actions `before` de toutes les notes traversées par un saut s'exécutent avant la recréation du conteneur, et `updateCompose` ne fait que changer le fichier compose qui servira au saut.

## Problème constaté

Relevé par D-20 le 2026-11-24 (layout `friend`, `--path 1.12.0,1.14.0`, mode conforme et naïf) :

- Sur un saut qui part d'avant v1.5.0 et arrive à v1.12.0 ou après (`1.4.0,1.12.0`, ou le premier démarrage d'un chemin qui commence à v1.12.0 ou après, depuis D-20), l'ancien conteneur est celui de `compose-1.4.0.yml`, qui monte `./uploads` sur `/uploads`.
- Le rapport donne alors « /app/data (bind) given to 1000:1000 » : le dossier `./uploads`, que v1.5.0 Before 3 a pourtant fait monter sur `/app/uploads`, n'est pas donné à l'uid 1000. Un utilisateur qui suit les notes, lui, fait le `chown` avec son compose déjà mis à jour.
- Sans effet sur macOS (Docker Desktop n'applique pas les propriétaires des bind mounts) : les passages de D-20 y sont OK. Sous Linux, avec un utilisateur dont l'uid n'est pas 1000, le backend v1.12.0 refuserait de démarrer (« cannot write to /app/uploads ») en mode conforme : faux KO.
- Le layout `official` n'est pas concerné : `compose-1.4.0.yml` monte déjà le volume `uploads` sur `/app/uploads`.

## Ce qu'il faut faire

1. Faire lire à `chownMounts` les montages du fichier compose de la génération en cours (après les `updateCompose` du saut), par exemple avec `docker compose config --format json` sur le fichier rendu, plutôt que ceux de l'ancien conteneur.
2. Garder le comportement actuel quand la génération ne change pas.
3. Mettre à jour `scripts/upgrade-test/README.md` (description de `chownMounts`).

## Critères d'acceptation

- [x] `--layout friend --path 1.4.0,1.12.0` en mode conforme : le rapport donne `/app/data` et `/app/uploads` donnés à `1000:1000`.
- [x] Les passages `1.4.0`, `1.8.0` et `1.12.0` vers la dernière version, layouts `friend` et `official`, restent sans échec inattendu.

## Tests à ajouter ou adapter

- Tests unitaires de la résolution des montages depuis la sortie de `docker compose config` (bind relatif, volume nommé).

## Points d'attention

- Vérifier la propriété réelle des dossiers après l'action (helper `ls -ln`), puisque macOS ne fait pas échouer le démarrage.

## Journal

- 2026-11-24 : tâche créée par D-20 (hors périmètre du premier démarrage).
- 2026-11-26 : `chownMounts` lit les montages de `docker compose config` sur le fichier de la génération en cours (rendu à côté du vrai, `Instance.plannedConfig`), plus ceux du conteneur arrêté. Vérifié : `friend 1.4.0,1.12.0` conforme donne `/app/data` et `/app/uploads` à 1000:1000.
