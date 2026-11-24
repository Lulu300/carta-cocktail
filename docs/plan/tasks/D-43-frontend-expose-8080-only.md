---
id: D-43
title: "Image frontend aplatie : n'exposer que le port 8080 (port 80 hérité de nginx officiel)"
phase: D
lane: infra
criticite: haute
effort: S
status: done
owner: agent
depends_on: [D-40]
touches: [frontend/Dockerfile, scripts/smoke/smoke.sh, README.md, docs/plan/README.md, docs/plan/tasks/D-40-nginx-official-mainline.md]
sources: []
branch: fix/D-43-frontend-expose-8080-only
pr: https://github.com/Lulu300/carta-cocktail/pull/198
---

## Décisions validées (2026-11-24)

- Choix de l'humain : « Code fix before the rc ». Option présentée : « Go back to option (b): flatten the image so it exposes only 8080 (4 more Dockerfile lines; base image labels lost for scanners, whole layer re-downloaded on each update). Then no reverse proxy needs any action. »
- Variables de l'image de base (`NGINX_VERSION`…) : réponse du coordinateur, option (a) « laisse tomber les six variables », pas de valeur en dur. Elles avaient été présentées à l'humain avec ce coût (« base image labels/vars lost »).

## Contexte

D-40 (PR #194) base l'image frontend sur `nginx:1.31-alpine`, rendue non-root dans notre Dockerfile. L'image officielle déclare `EXPOSE 80`, qu'aucune instruction suivante ne peut retirer : l'image exposait 80 et 8080, rien n'écoutant sur 80.

## Problème constaté

- Un reverse proxy qui détecte seul le port du conteneur prend 80 et répond 502 : Traefik sans `loadbalancer.server.port` (port le plus bas), nginx-proxy sans `VIRTUAL_PORT`, et le mod `swag-auto-proxy` de SWAG sans `swag_port` (trouvé à la relecture des notes v1.14.0, PR #196). Avant D-40, `nginxinc/nginx-unprivileged` n'exposait que 8080.
- D-40 l'annonçait par une action conditionnelle dans « Required actions ». Cette tâche la remplace par un correctif avant la pré-version v1.14.0-rc.1.

## Ce qu'il faut faire

1. `frontend/Dockerfile` : l'étape nginx devient `FROM nginx:1.31-alpine AS nginx` (le `RUN` de D-40 et ses `grep -q` inchangés), puis `FROM scratch`, `COPY --from=nginx / /`, et `ENTRYPOINT`, `CMD`, `STOPSIGNAL` redéclarés avec les valeurs de l'image officielle. `PATH` et `WorkingDir` (`/`) sont remis par BuildKit sur `FROM scratch`. Nos `COPY`, `ENV`, `EXPOSE 8080` et `USER 101` suivent, comme avant.
2. `scripts/smoke/smoke.sh` : vérifier que le conteneur frontend n'expose que 8080.
3. README, décision du plan et D-40 : retirer ce qui dit que l'image expose 80 ou qu'un reverse proxy doit indiquer 8080 à cause de cela.

## Critères d'acceptation

- [x] `docker inspect` (Config) de l'image : `ExposedPorts` = `8080/tcp` seul, `User` 101 ; `Entrypoint`, `Cmd`, `StopSignal`, `WorkingDir`, `PATH`, `BACKEND_HOST`, `NGINX_ENTRYPOINT_LOCAL_RESOLVERS` identiques à l'image de `develop`. Écarts : label `maintainer` et les six variables de l'image de base absents, `ArgsEscaped: true` (posé par BuildKit avec `CMD`, sans effet sous Linux).
- [x] Système de fichiers identique à l'image de `develop` (chemin, mode, uid, gid, taille des 2 190 entrées).
- [x] `nginx -v` 1.31.10, `id` uid 101 ; démarre sous `--user 12345:0`.
- [x] Smoke complet (`smoke.sh` puis `custom-uid.sh`) dans le projet `carta-d-43`, frontend `healthy`.
- [x] En-têtes et corps identiques à l'image de `develop` (même code) : `/`, `/menu/1`, `/api/health`, `/api/public/settings`, une photo, un asset gzip, `/assets` (301), deux 404, un `.png` inconnu, `/favicon.svg`, un 413 (22 Mo) et `POST /api/backup/import` sans token (401) ; journaux de démarrage identiques.

## Tests à ajouter ou adapter

- `scripts/smoke/smoke.sh`, étape 13 : `ExposedPorts` du conteneur frontend vaut `{"8080/tcp":{}}`. Sonde : frontend recréé avec l'image de `develop` (80 et 8080), `smoke.sh` échoue à l'étape 13.

## Points d'attention

- **Variables de l'image de base perdues** : `NGINX_VERSION`, `PKG_RELEASE`, `DYNPKG_RELEASE`, `NJS_VERSION`, `NJS_RELEASE`, `ACME_VERSION`. `docker inspect` et `env` ne montrent plus `NGINX_VERSION` ; la version reste visible par `nginx -v` et la base apk (`nginx-1.31.10-r1`). Rien ne les lit à l'exécution : `grep -rE 'NGINX_VERSION|PKG_RELEASE|NJS_|ACME_VERSION'` dans `/docker-entrypoint.sh`, `/docker-entrypoint.d/` et `/etc/nginx` ne trouve rien. Ce sont les variables de build de l'image officielle. Les écrire en dur serait faux à la prochaine 1.31.x (`nginx:1.31-alpine` est flottant).
- **Lien avec l'image de base perdu** : label `maintainer` et historique de `nginx` absents. Les scanners qui lisent les paquets (base apk présente et identique) voient les mêmes paquets ; un outil qui recommande une image de base à partir de l'historique ne reconnaît plus `nginx`. Aucun scanner installé localement (ni Trivy, ni Grype, ni `docker scout`) : comparaison non faite.
- **Couches** : 95,3 Mo non compressés en 4 couches, contre 104,4 Mo en 12 (le `chown -R` ne double plus `/etc/nginx` et `/var/cache/nginx`). Deux builds `--no-cache` donnent deux digests différents pour la couche aplatie (les `sed` et `chown` réécrivent des fichiers) : hors cache, une mise à jour retélécharge toute la couche, environ 26 Mo compressés, au lieu des seules couches modifiées. `release.yml` reprend le cache GHA, qui la réutilise tant que la base et le `RUN` n'ont pas changé.

## Journal

- 2026-11-24 : tâche créée par le coordinateur après la relecture des notes v1.14.0 (PR #196, cas `swag-auto-proxy`) et la décision de l'humain « Code fix before the rc ».
- 2026-11-24 : question de l'agent (les six variables de l'image de base ne peuvent pas être gardées sans valeur en dur) ; réponse du coordinateur : les laisser tomber.
- 2026-11-24 : réalisée (PR #198). Vérifications : `docker inspect`, système de fichiers, `nginx -v`, `id`, `--user 12345:0`, smoke complet dans `carta-d-43` (ports de test sur 127.0.0.1 par un fichier d'override), comparaison des réponses et des journaux avec l'image de `develop` lancée à côté, sur le même réseau compose et devant le même backend : aucune différence hors `Date`/`ETag`/`Last-Modified` et compteurs `RateLimit`. `scripts/smoke/smoke.sh` ajouté à `touches` (étape 13). Deux passages de `custom-uid.sh` ont échoué à l'étape [1], la ligne attendue étant dans les logs (D-41) ; un troisième, avec une copie locale non commitée qui remplace `grep -q` par `grep -F … >/dev/null`, a passé, comme un premier passage du script inchangé avant l'ajout de l'étape 13.
- Notes de version : `breaking: false`. L'image frontend n'expose plus que le port 8080 (D-40 exposait aussi 80, hérité de l'image nginx officielle). Aucune action pour aucun reverse proxy, y compris en détection automatique du port (Traefik, nginx-proxy, SWAG auto-proxy). L'image ne porte plus les variables `NGINX_VERSION`… de l'image de base : `nginx -v` donne la version.
