---
id: D-41
title: "Smoke instable : custom-uid.sh rate une ligne présente dans les logs (pipefail et grep -q)"
phase: D
lane: ci
criticite: basse
effort: S
status: todo
owner: agent
depends_on: []
touches: [scripts/smoke/custom-uid.sh]
sources: []
branch:
pr:
---

## Contexte

`scripts/smoke/custom-uid.sh` (D-34) tourne dans le job « Smoke (docker compose) », check obligatoire. Il s'exécute sous `set -euo pipefail` et lit les logs du backend avec `backend_logs | grep -qF -- "$line"` (`wait_for_log_line`, puis les contrôles de l'étape [1]).

## Problème constaté

Vu en local le 2026-11-24 pendant D-40 (PR #194), projet `carta-d-40`, script inchangé : `FAIL: no "ERROR: the backend runs as uid 4321 and cannot write to /app/data." in the backend logs after 60 s`, alors que le dump des logs affiché juste avant contenait cette ligne, deux fois (le conteneur refusé redémarre en boucle). Le passage suivant, identique, a réussi.

Cause probable : avec `pipefail`, le statut du pipeline est celui de la dernière commande en échec. `grep -q` s'arrête dès la première ligne trouvée ; si `docker compose logs` écrit encore ensuite, il reçoit SIGPIPE et sort en erreur, et le `if` voit un échec. Démonstration : `bash -c 'set -o pipefail; { echo match; sleep 0.3; echo more; } | grep -q match; echo $?'` affiche `141`. Plus les logs sont longs (redémarrages en boucle), plus la fenêtre est large. Les autres lectures `backend_logs | grep -qF` du script (ligne `chown`, absence de « API running ») ont le même défaut. Distinct de D-37 (instantané des logs pris trop tôt), même fichier.

## Ce qu'il faut faire

1. Lire les logs dans une variable puis chercher dedans (`logs="$(backend_logs)"; grep -qF -- "$line" <<< "$logs"`), ou utiliser `grep -F` sans `-q` redirigé vers `/dev/null`, pour toutes les lectures `backend_logs | grep -q…` du script.
2. Coordonner avec D-37 (même fonction `wait_for_log_line`) : une seule PR peut traiter les deux.

## Critères d'acceptation

- [ ] Aucune lecture `… | grep -q` sous `pipefail` dans `custom-uid.sh`.
- [ ] Le job Smoke passe ; le script passe plusieurs fois de suite en local.

## Tests à ajouter ou adapter

- Sonde : remplacer `backend_logs` par une fonction qui écrit la ligne attendue puis d'autres lignes après une pause ; avant le correctif, `wait_for_log_line` échoue ; après, il réussit.

## Points d'attention

- Ne pas retirer `pipefail` du script : il protège les autres pipelines.

## Journal

- 2026-11-24 : tâche créée pendant D-40 (relance du smoke après la revue de la PR #194).
