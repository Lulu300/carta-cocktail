---
id: D-25
title: "Healthcheck du frontend : sortir les sondes de l'access log nginx"
phase: D
lane: infra
criticite: basse
effort: S
status: done
owner: agent
depends_on: [D-03]
touches: [frontend/nginx.conf.template, docker-compose.yml, docker-compose.prod.yml, scripts/smoke/smoke.sh]
sources: []
branch: chore/D-25-healthcheck-access-log
pr:
---

## Contexte

D-03 (PR #117) ajoute un healthcheck au service frontend des deux compose : `wget -qO /dev/null http://127.0.0.1:8080/` toutes les 30 s. Côté backend, la route `/api/health` est montée avant `morgan` pour ne pas remplir les logs ; côté nginx, rien n'écarte la sonde.

## Problème constaté

- Chaque sonde ajoute une ligne `GET / … "Wget"` à l'access log de nginx (sortie standard du conteneur), soit environ 2 900 lignes par jour qui noient les vraies requêtes dans `docker compose logs carta-cocktail-frontend`.
- La sonde vise `/`, la page de la SPA : elle passe par la `location /` et le fallback `try_files`, comme une visite.

## Ce qu'il faut faire

1. `frontend/nginx.conf.template` : ajouter une location dédiée, sans access log, par exemple :
   ```nginx
   # Docker healthcheck of the frontend service: kept out of the access log
   location = /healthz {
       access_log off;
       return 200;
   }
   ```
2. `docker-compose.yml` et `docker-compose.prod.yml`, service frontend : viser `http://127.0.0.1:8080/healthz` dans le `healthcheck`.

## Critères d'acceptation

- [ ] `docker compose up -d --wait` rend la main avec les deux services `healthy`.
- [ ] `docker compose logs carta-cocktail-frontend` ne contient plus les sondes du healthcheck ; une visite de la carte y apparaît toujours.
- [ ] `/healthz` répond 200 sans contenu sensible.

## Tests à ajouter ou adapter

- Manuel : `docker compose up -d --build --wait`, attendre deux intervalles, vérifier les logs nginx ; `docker inspect --format '{{.State.Health.Status}}'` sur le conteneur frontend.
- Si D-08 (smoke test compose) est mergée, y ajouter un appel à `/healthz`.

## Points d'attention

- `return 200` vérifie que nginx répond, pas que les fichiers de la SPA sont présents. Si l'on veut garder ce contrôle, servir `index.html` dans la location (`try_files /index.html =404;`) au lieu de `return 200`.
- `/healthz` devient une URL publique servie par nginx : vérifier qu'aucune route de la SPA ne porte ce nom.
- Un compose personnalisé qui reprend le healthcheck de D-03 continue de fonctionner (`/` reste servi) : pas d'action obligatoire, pas de ligne « Notes de version » nécessaire.

## Journal

- 2026-10-12 : tâche créée pendant la relecture de D-03 (PR #117), remarque hors périmètre du relecteur.
- 2026-11-26 : faite. Le healthcheck sondait `/` (wget, port 8080, image aplatie par D-43). Location `= /healthz` avec `access_log off` et `return 200` (pas de test des fichiers de la SPA : le backend sain est déjà exigé, et `try_files` vers `/index.html` remettrait la sonde dans le log). Aucune route de la SPA ne porte ce nom. Le smoke test vérifie que `/healthz` reste hors du log et qu'une requête sur `/` y figure.
- Notes de version : le log d'accès du frontend (`docker compose logs frontend`) ne contient plus les sondes du healthcheck (environ 2 900 lignes par jour) ; les requêtes des visiteurs y restent. Aucune action requise.
