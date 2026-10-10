---
id: D-02
title: "Image frontend non-root et en-têtes de sécurité nginx"
phase: D
lane: infra
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [A-06, B-01]
touches: [frontend/Dockerfile, frontend/nginx.conf.template, frontend/security-headers.conf, docker-compose.yml, docker-compose.prod.yml, scripts/upgrade-test/layouts/]
sources: ["03-security.md §8", "07-devops-history.md §2.8"]
branch:
pr:
---

## Décisions validées (2026-10-10)

- **Port 8080** : le conteneur frontend écoute sur 8080. L'alternative `listen 80` est écartée (elle ne marche ni sous Docker rootless ni sous Podman). Changement cassant, `breaking: true` dans les notes de la version qui l'embarque (v1.8.0 au plus tôt).
- **Banc de mise à jour** : les layouts du banc publient le port 80 du frontend (`127.0.0.1::80` dans `compose-1.5.0.yml`). Ajouter dans `scripts/upgrade-test/layouts/friend/` et `layouts/official/` une génération `compose-1.8.0.yml` identique à `compose-1.5.0.yml` sauf le port du conteneur frontend (`127.0.0.1::8080`), et l'enregistrer dans les `layout.mjs` si besoin. Le hook `hooks/1.8.0.mjs` reste au coordinateur (notes de release, règle 9) : pour vérifier la PR, utiliser un hook temporaire non commité qui fait `updateCompose` vers la génération `1.8.0`.

## Contexte

nginx sert le HTML de l'admin et de la carte publique. helmet ne protège que les réponses de l'API Express, donc la page d'admin peut être affichée dans une iframe tierce (clickjacking) et n'a pas de CSP. Le master nginx tourne en root et l'image de base n'est pas épinglée : un rebuild peut changer de version sans prévenir.

## Problème constaté

- `frontend/Dockerfile:11` : `FROM nginx:alpine`, tag flottant, master en root.
- `frontend/Dockerfile:1` : stage de build en `node:20-alpine` (fin de vie). B-01 le passe en Node 24.
- `frontend/Dockerfile:16` : `ENV BACKEND_HOST=backend`, alors que le service s'appelle `carta-cocktail-backend` (`docker-compose.yml:2,26`). Sans effet avec les compose fournis, trompeur pour un compose maison.
- `frontend/nginx.conf.template:1-35` : aucun `add_header` de sécurité (CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`), `server_tokens` actif.
- `nginx.conf.template` (version A-06) : les trois `proxy_pass http://${BACKEND_HOST}:3001/...` (`location = /api/backup/import`, `/api/`, `^~ /uploads/`) résolvent le nom une seule fois au démarrage. Si le backend est recréé seul et change d'IP, nginx renvoie des 502 jusqu'à son redémarrage.
- Dans nginx, un `add_header` placé dans un `location` annule tous ceux hérités du `server`. A-06 ajoute des `Cache-Control` dans des `location` : des en-têtes posés seulement au niveau `server` disparaîtraient sur ces réponses.
- `frontend/src/index.css:1` charge Google Fonts (`fonts.googleapis.com` et `fonts.gstatic.com`). Une CSP `'self'` stricte casse les polices tant que E-12 ne les a pas auto-hébergées.
- `SiteSettingsContext.tsx:36-50` pose le favicon en `data:image/svg+xml`. La CSP doit autoriser `img-src data:`.

## Ce qu'il faut faire

1. Partir de la version de `nginx.conf.template` livrée par A-06 (gzip, `client_max_body_size`, cache).
2. Créer `frontend/security-headers.conf` :
   ```nginx
   add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
   add_header X-Content-Type-Options "nosniff" always;
   add_header X-Frame-Options "DENY" always;
   add_header Referrer-Policy "strict-origin-when-cross-origin" always;
   add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
   ```
   Si E-12 est mergé, retirer les deux domaines Google de la CSP.
3. Dans `nginx.conf.template` :
   - `server_tokens off;` au niveau `server` ;
   - `include /etc/nginx/snippets/security-headers.conf;` au niveau `server` et dans chaque `location` qui contient un `add_header` ;
   - `listen 8080;` ;
   - résolution dynamique du backend. Sans URI après le port, nginx transmet l'URI d'origine (`/api/...`, `/uploads/...`) ; avec une variable, une URI explicite remplacerait toute l'URI de la requête :
     ```nginx
     resolver 127.0.0.11 valid=30s ipv6=off;
     set $backend http://${BACKEND_HOST}:3001;
     location = /api/backup/import { proxy_pass $backend; ... }  # ajoutée par A-06, garder ses limites
     location /api/ { proxy_pass $backend; ... }
     location ^~ /uploads/ { proxy_pass $backend; ... }
     ```
     Les trois `location` passent à la variable, y compris `= /api/backup/import` (A-06), dont la version actuelle répète l'URI (`.../api/backup/import`). Avec une variable, nginx ne réécrit pas l'URI : il ne faut donc mettre aucun chemin après `$backend`, sinon toutes les requêtes de la `location` partent vers ce chemin exact ;
   - si une `location` regex (`~`) est ajoutée, passer `location /assets/` en `location ^~ /assets/` : une regex l'emporte sur un préfixe simple et pourrait capter les fichiers du build, qui perdraient leur `Cache-Control` ;
   - laisser HSTS commenté, avec une note : à activer seulement si le TLS est terminé en amont (D-09 le documente).
4. `frontend/Dockerfile`, stage final :
   ```dockerfile
   FROM nginxinc/nginx-unprivileged:1.28-alpine
   COPY --from=build /app/dist /usr/share/nginx/html
   COPY nginx.conf.template /etc/nginx/templates/default.conf.template
   COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
   ENV BACKEND_HOST=carta-cocktail-backend
   EXPOSE 8080
   ```
   Prendre la dernière version stable publiée sur Docker Hub au moment du travail (1.28 est un exemple). Supprimer la ligne `CMD`, celle de l'image de base suffit.
5. `docker-compose.yml` et `docker-compose.prod.yml` : `ports: - "80:8080"` pour le frontend.

## Critères d'acceptation

- [ ] `curl -sI http://localhost/` renvoie les 5 en-têtes de sécurité et pas de version dans `Server`.
- [ ] `curl -sI http://localhost/assets/<fichier>.js` renvoie aussi les en-têtes de sécurité, en plus du `Cache-Control` d'A-06.
- [ ] La carte publique et l'admin s'affichent sans erreur CSP dans la console (polices, favicon emoji, images de cocktails).
- [ ] `docker compose exec carta-cocktail-frontend id -u` renvoie un uid différent de 0.
- [ ] `docker compose up -d --force-recreate carta-cocktail-backend` puis `curl http://localhost/api/public/menus` : 200 sans redémarrer nginx.
- [ ] Le Dockerfile n'utilise plus de tag flottant.

## Tests à ajouter ou adapter

- Vérifier la syntaxe : `docker run --rm -e BACKEND_HOST=localhost <image> nginx -t`.
- Contrôle manuel des en-têtes avec `curl -sI` sur `/`, `/assets/...`, `/api/public/settings`, `/uploads/<image>`.
- Ajouter ces vérifications au smoke test D-08 (assertion d'en-tête sur `/`), ou les y signaler si D-08 est déjà mergé.

## Points d'attention

- Changement cassant. Le conteneur écoute sur 8080. Un utilisateur qui a son propre compose avec `"80:80"` perd l'accès après mise à jour de `:latest`. À annoncer dans les notes de version (point suivant) et dans D-09.
- **Notes de version** (règle de D-11 : la PR ne touche ni `docs/releases/` ni `UPGRADING.md`). `breaking: true`. La description de la PR a une section « Required actions » et le Journal une ligne « Notes de version ». Actions attendues : *before* — dans un compose personnalisé, remplacer le mapping `"<port>:80"` du frontend par `"<port>:8080"` (les compose du dépôt sont déjà à jour) ; *after* — vérifier que la carte publique et l'admin répondent, et qu'une restauration de backup passe toujours. Épinglage recommandé : `:<version>` avant D-05, `:<majeure>.<mineure>` ensuite. Alternative écartée le 2026-10-10 : rester sur `listen 80`, qui fonctionne en non-root avec Docker ≥ 20.10 (sysctl `ip_unprivileged_port_start=0` par défaut), mais pas sous Docker rootless ni Podman.
- `touches` complété : `frontend/security-headers.conf`, `docker-compose.yml`, `docker-compose.prod.yml`. Ces deux compose sont aussi modifiés par A-01, A-04 et D-03 : enchaîner les PR.
- `X-Frame-Options: DENY` et `frame-ancestors 'none'` empêchent d'intégrer la carte publique dans un site tiers. Si le bar veut l'intégrer, il faudra une exception sur `/menu/`.
- Relevé en revue de A-06 : la `location = /api/backup/import` garde `client_max_body_size 512m`, `proxy_request_buffering off` et ses délais ; seul son `proxy_pass` change. Tester une restauration de backup après la bascule (`curl -F file=@backup.zip …/api/backup/import`, attendu 401 sans token, pas 404 ni 502).
- Le `resolver` rend aussi nginx tolérant au démarrage si le backend n'est pas encore résolvable, ce qui complète le `depends_on: service_healthy` de D-03.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : suivi des revues de la phase A. Étape 3 complétée : `location = /api/backup/import` (A-06) passe aussi à `proxy_pass $backend` sans URI, conseil `location ^~ /assets/` si une regex est ajoutée.
- 2026-10-09 : point d'attention « Notes de version » (règle de D-11 décidée le 2026-10-09) : `breaking: true`, actions attendues, épinglage recommandé.
- 2026-10-10 : décision de l'humain, port 8080 (voir « Décisions validées ») ; `scripts/upgrade-test/layouts/` ajouté à `touches` pour la nouvelle génération de compose du banc.
