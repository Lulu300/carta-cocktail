---
id: D-40
title: "Image frontend : nginx officiel 1.31 (mainline) non-root, correctifs de sécurité du 2026-11-18"
phase: D
lane: infra
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: [D-02]
touches: [frontend/Dockerfile, README.md, docs/plan/README.md, docs/plan/tasks/D-02-frontend-image-security-headers.md]
sources: []
branch: chore/D-40-nginx-1.31.9
pr: https://github.com/Lulu300/carta-cocktail/pull/194
---

## Décisions validées (2026-11-24)

- Choix de l'humain : « Official nginx 1.31.9 (mainline) » : « The very latest version: switch to nginx:1.31.9-alpine and make it non-root ourselves (uid 101, port 8080, writable paths), keeping the same behaviour; leaves the stable line chosen in D-02. »
- Épinglage : « Minor: nginx:1.31-alpine » : « Follows the plan's rule (like node:24.x-alpine and the old 1.30-alpine). Always the latest 1.31.x at build time; a release built later can get a newer nginx than the rc that was benched. »
- Port 80 hérité de l'image de base : « (a) Keep it, announce it » : « Shortest Dockerfile. The release notes and 'Required actions' say: if your reverse proxy auto-detects the container port (Traefik without loadbalancer.server.port, nginx-proxy without VIRTUAL_PORT), set 8080. »

## Contexte

L'image frontend partait de `nginxinc/nginx-unprivileged:1.30-alpine` (D-02), qui embarque nginx 1.30.6 (`ghcr.io/lulu300/carta-cocktail/frontend:1.13.0` aussi). Le 2026-11-18, nginx a publié 1.30.7 (stable) et 1.31.9 (mainline), qui corrigent dix CVE, dont la chaîne « NGINX2Root » menée par CVE-2026-123007 (HTTP/2). Le 2026-11-23, 1.30.8 et 1.31.10 ont corrigé CVE-2026-132779 (`ssl_early_data`). Au 2026-11-24, `nginxinc/nginx-unprivileged` n'avait pas été reconstruite depuis le 2026-10-19 (1.30.6 / 1.31.7) ; l'image officielle `nginx` avait `1.31-alpine` = `mainline-alpine` = 1.31.10.

## Problème constaté

- `frontend/Dockerfile` : `FROM nginxinc/nginx-unprivileged:1.30-alpine`, nginx 1.30.6.
- Exposition de notre configuration (`listen 8080` en HTTP/1.1 clair ; pas de `http2`, `quic`, `ssl`, `mail {}`, `stream {}`, `proxy_protocol` ni `alias`) aux dix CVE du 2026-11-18 :
  - CVE-2026-123634, use-after-free dans le resolver : **nous touche** (`resolver ${NGINX_LOCAL_RESOLVERS}` et `$backend` résolu à chaque requête). Exploitation : réponses DNS forgées sur le réseau compose.
  - CVE-2026-123007 et CVE-2026-123633 (HTTP/2), CVE-2026-121810 (HTTP/3), CVE-2026-118899 (TLS 1.3), CVE-2026-113425 (mail), CVE-2026-120993 (PROXY protocol v2), CVE-2026-125283 (`alias` avec `try_files`), CVE-2026-120967 et CVE-2026-123640 (stream) : fonctions non utilisées.
  - CVE-2026-132779 (1.31.10, `ssl_early_data`) : pas de TLS dans le conteneur.

## Ce qu'il faut faire

1. `FROM nginx:1.31-alpine`.
2. Reprendre les changements de `nginxinc/nginx-unprivileged` (relevés dans l'historique de son image) : un `RUN` (`listen 80` → `8080` dans `conf.d/default.conf`, suppression de `user nginx;`, `pid` et `*_temp_path` dans `/tmp`, `chown -R 101:0` et `chmod -R g+w` sur `/var/cache/nginx` et `/etc/nginx`), puis `USER 101`. Les scripts d'entrée de l'image officielle font le reste (`15-local-resolvers.envsh`, `20-envsubst-on-templates.sh`).
3. README : dire d'indiquer le port 8080 à un reverse proxy, en particulier en détection automatique.
4. Décision du plan et Journal de D-02.

## Critères d'acceptation

- [x] `nginx -v` = 1.31.10 (≥ 1.31.9), `id` = uid 101, `nginx -t` OK ; démarre aussi sous `--user 12345:0`, comme l'ancienne image.
- [x] Smoke complet (`smoke.sh` puis `custom-uid.sh`) dans un projet compose dédié, frontend `healthy`.
- [x] En-têtes et corps identiques à l'ancienne image (même code) sur `/`, `/menu/1`, `/api/health`, `/api/public/settings`, une photo, un asset, `/assets` (301 relatif), deux 404, un 413 et `POST /api/backup/import` sans token (401).
- [x] Journaux de démarrage de l'entrypoint identiques.

## Tests à ajouter ou adapter

Aucun test automatisé : le job Smoke de la CI construit l'image et vérifie l'ensemble à travers nginx.

## Points d'attention

- L'image expose 80 et 8080 (`EXPOSE 80` de l'image officielle, impossible à retirer dans un Dockerfile) ; rien n'écoute sur 80. Traefik prend le port le plus bas, nginx-proxy prend 80 : sans port explicite, ils répondent 502. Alternative écartée par l'humain : aplatir l'image (`FROM scratch` + `COPY --from=nginx / /`).
- `1.31-alpine` est flottant : une release construite après le banc de la rc peut embarquer un nginx 1.31.x plus récent.
- Dependabot : `.github/dependabot.yml` n'a aucune règle `ignore` pour nginx, rien à changer. L'ignore posé sur #144 visait `nginxinc/nginx-unprivileged` et la règle manuelle de D-02 (ignorer les mineures impaires) ne vaut plus. Dependabot proposera 1.32 (stable) vers avril 2027, avant 1.33 (mainline) : le choix reviendra à l'humain à ce moment.
- Image plus lourde : 29,3 Mo compressés contre 26,2 Mo (modules en plus dans l'image officielle).
- Non testé ici : Docker rootless et Podman (même uid, même port, mêmes chemins que l'ancienne image).

## Journal

- 2026-11-24 : tâche créée par le coordinateur après la demande de l'humain (« la mise à jour de Nginx dans notre image. Parce que celle qu'on a a une faille, il faut qu'on prenne la toute dernière version disponible »).
- 2026-11-24 : question de l'agent (port 80 hérité, 1.31.10 sorti la veille, épinglage), décisions de l'humain ci-dessus.
- 2026-11-24 : réalisée (PR #194). Vérifications : versions (`nginx -v`, `id`), `nginx -t`, uid arbitraire du groupe 0, smoke complet dans le projet `carta-d-40` (ports de test sur 127.0.0.1 par un fichier d'override, le port 80 étant libre mais d'autres sessions tournant en parallèle), comparaison des réponses entre l'ancienne image (Dockerfile de `develop`) et la nouvelle : aucune différence hors `Date`/`ETag`. `README.md` et `docs/plan/README.md` ajoutés à `touches`.
- Notes de version : nginx 1.31.x (mainline, 1.31.10 au 2026-11-24) au lieu de 1.30.6, correctifs de sécurité du 2026-11-18 (CVE-2026-123007, -123633, -123634, -121810, -118899, -113425, -120993, -125283, -120967, -123640) et du 2026-11-23 (CVE-2026-132779) ; seule CVE-2026-123634 (resolver) touche notre configuration. Image de base : `nginx` officielle au lieu de `nginxinc/nginx-unprivileged`, toujours uid 101 et port 8080, mêmes en-têtes. L'image expose aussi le port 80 (rien n'y écoute). Aucune action avec les compose du dépôt, SWAG ou un proxy qui vise 8080. Avant : un reverse proxy qui détecte seul le port du conteneur doit indiquer 8080 (Traefik : `traefik.http.services.<name>.loadbalancer.server.port=8080` ; nginx-proxy : `VIRTUAL_PORT=8080`), sinon 502. Épinglage recommandé inchangé (`:<majeure>.<mineure>`).
