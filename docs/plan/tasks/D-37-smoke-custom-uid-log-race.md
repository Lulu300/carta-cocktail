---
id: D-37
title: "Smoke instable : custom-uid.sh lit la commande chown avant qu'elle soit dans les logs"
phase: D
lane: ci
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [D-34]
touches: [scripts/smoke/custom-uid.sh]
sources: []
branch:
pr:
---

## Contexte

D-34 (PR #157) a ajouté `scripts/smoke/custom-uid.sh`, lancé par le job « Smoke (docker compose) » (`.github/workflows/smoke.yml`, étape « Backend as another uid (CARTA_UID) ») après `smoke.sh`. Son étape [1] recrée le backend en uid 4321 sur des volumes de l'uid 1000 et vérifie le refus de l'entrypoint :

```bash
wait_for_log_line "ERROR: the backend runs as uid $CUSTOM_ID and cannot write to /app/data."
backend_logs | grep -qF -- "chown -R $CUSTOM_ID:$CUSTOM_ID" \
  || fail "the refusal does not give the chown command for $CUSTOM_ID:$CUSTOM_ID"
```

Dans `backend/docker-entrypoint.sh`, `refuse_unwritable` écrit le refus par neuf `echo` séparés dans un bloc `{ … } >&2` : la ligne `ERROR:` est la première, la commande `chown -R $owner /data` la cinquième.

## Problème constaté

`wait_for_log_line` rend la main dès que la ligne `ERROR:` apparaît dans `docker compose logs`, puis le script lit les logs une seule fois pour y chercher la ligne `chown`. Cause probable de l'échec : chaque `echo` est une écriture distincte, que Docker recopie dans ses logs ligne par ligne ; un instantané pris juste après la première ligne peut ne pas encore contenir les suivantes.

Échec vu sur la PR #166 (run 43288181424, tentative 1, head 377e2c7, qui ne touchait ni l'entrypoint ni les scripts) : `[1]` démarre à 19:17:09.23, le conteneur démarre à 19:17:09.81, et `FAIL: the refusal does not give the chown command for 4321:4321` tombe à 19:17:10.07. La ligne `ERROR:` a donc été trouvée dès le premier passage, et la ligne `chown` n'était pas encore là. La relance (tentative 2) est passée. Le check Smoke est obligatoire (ruleset 24936910) : chaque échec de ce type bloque un merge jusqu'à la relance.

## Ce qu'il faut faire

1. Attendre chaque ligne attendue au lieu de la chercher dans un seul instantané : après la ligne `ERROR:`, `wait_for_log_line "chown -R $CUSTOM_ID:$CUSTOM_ID"`, en gardant un message d'échec qui dit que le refus ne donne pas la commande `chown`, par exemple en passant le message à `wait_for_log_line`. Chacune garde son délai de 60 s (30 passages de 2 s par appel).
2. Le contrôle « API running » reste une lecture unique, faite après les deux attentes : le refus est complet, et l'entrypoint s'arrête (`exit 1`) avant de lancer l'API. Il ne doit pas utiliser `grep -q` (voir les points d'attention) : `grep -F … >/dev/null`, ou une seule capture des logs dans une variable puis une recherche dedans.
3. Ne pas changer l'entrypoint pour le test (un seul `printf` du bloc serait possible, mais le script ne doit pas dépendre du découpage des écritures de l'entrypoint).

## Critères d'acceptation

- [ ] Le script attend la ligne `chown` au lieu de la lire une seule fois après la ligne `ERROR:`.
- [ ] Un refus sans la commande `chown` fait toujours échouer l'étape [1], avec un message qui le dit (vérifié en local en retirant la ligne de l'entrypoint sur une copie, puis annulé).
- [ ] Job « Smoke (docker compose) » vert sur la PR ; `shellcheck scripts/smoke/custom-uid.sh` sans nouvel avertissement s'il est disponible.

## Tests à ajouter ou adapter

Le script est lui-même le test. Vérification en local, dans un projet compose dédié (`carta-d-37`, voir « Smoke » dans `AGENTS.md`), dans le même appel du shell : `docker compose -p carta-d-37 up -d --build --wait`, `smoke.sh`, `custom-uid.sh`, puis `docker compose -p carta-d-37 down -v --remove-orphans --rmi local`. Le sabotage du critère 2 se fait sur une image construite pour l'occasion, supprimée ensuite.

## Points d'attention

- `COMPOSE_PROJECT_NAME` doit valoir `carta-d-37` pour les deux scripts (ils appellent `docker compose` sans `-p`) ; jamais le projet par défaut, l'étape [2] change le propriétaire des volumes.
- Deuxième course, sous `set -euo pipefail` : dans `backend_logs | grep -qF …`, `grep -q` s'arrête à la première ligne trouvée ; si `docker compose logs` écrit encore, il reçoit SIGPIPE et le pipeline sort en 141 alors que la ligne est là (vérifié en local : `set -o pipefail; gen | grep -qF match` → 141, `gen | grep -F match >/dev/null` → 0). Dans `wait_for_log_line`, cela ne coûte qu'un passage de plus ; dans le contrôle négatif « API running », une ligne présente pourrait passer inaperçue et le contrôle réussir à tort. Remplacer les `grep -qF` des pipelines du script par `grep -F … >/dev/null` (ou une capture unique des logs). L'échec du run 43288181424 s'explique plutôt par des logs incomplets : la ligne `ERROR:`, suivie d'autres lignes, a été trouvée au premier passage.
- Le conteneur refusé redémarre en boucle (`restart: unless-stopped`) : les logs contiennent plusieurs refus, ce qui ne gêne pas une recherche par `grep -F`.
- Nettoyage selon `AGENTS.md` : images `carta-d-37-*` et volumes du projet.

## Journal

- 2026-11-12 : tâche créée par la PR docs de suivi du lot D-35/E-18/B-20/C-12 à partir de la relecture de la PR #166 (C-12). Script, entrypoint et journal du run 43288181424 (tentative 1 en échec, tentative 2 verte) vérifiés sur `develop` (9799168).
