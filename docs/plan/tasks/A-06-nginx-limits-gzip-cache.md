---
id: A-06
title: "nginx : taille max des requêtes, compression gzip, cache correct"
phase: A
lane: infra
criticite: haute
effort: S
status: done
owner: agent
depends_on: []
touches: [frontend/nginx.conf.template, frontend/nginx.conf]
sources: ["07-devops-history.md §2.4", "06-frontend-ux-perf.md §1", "03-security.md §6"]
branch: fix/A-06-nginx-limits-gzip-cache
pr: 31
---

## Contexte

En Docker, nginx est la seule porte d'entrée de l'application. Sans réglage, il refuse tout corps de requête de plus de 1 Mo : une photo de smartphone, un import de bouteilles ou une restauration de backup échouent en 413 avant d'atteindre Express. Il ne compresse rien (605 Ko de JS envoyés bruts aux invités qui scannent le QR code). Enfin, sa règle de cache marque `immutable` des fichiers non versionnés, ne protège pas `index.html` contre les versions périmées et ne met aucun cache sur les photos.

## Problème constaté

`frontend/nginx.conf.template`, seul fichier utilisé (copié par `frontend/Dockerfile:14`) :
- aucun `client_max_body_size`, donc 1 Mo par défaut. Limites côté backend : image 5 Mo (`backend/src/routes/cocktails.ts:40`), import de bouteilles 10 Mo (`backend/src/routes/bottles.ts:14`), backup 500 Mo (`backend/src/routes/backup.ts:14`) ;
- aucune directive `gzip` ; l'image `nginx:alpine` ne l'active pas par défaut ;
- l.31-34 : `location ~* \.(js|css|png|jpg|...|svg|...)$` avec `expires 1y` et `immutable`. La règle touche aussi les fichiers non hashés (`/favicon.ico`, `/vite.svg`), dont une nouvelle version ne serait jamais vue ;
- `index.html` n'a pas de `Cache-Control` : après un déploiement, un navigateur peut garder un `index.html` qui référence des assets supprimés. Le risque augmente avec le découpage du bundle prévu en E-01 (« Failed to fetch dynamically imported module ») ;
- l.17-23 : `location ^~ /uploads/` est prioritaire sur la regex, donc les photos passent sans en-tête de cache nginx (Express envoie `max-age=0` par défaut).

`frontend/nginx.conf` : ancienne copie avec `backend` en dur, non utilisée par le Dockerfile. Fichier mort.

Les tests appellent Express directement et ne voient aucun de ces problèmes. Constats de la revue confirmés.

## Ce qu'il faut faire

1. Réécrire `frontend/nginx.conf.template` :
   ```nginx
   server {
       listen 80;
       server_name _;
       root /usr/share/nginx/html;
       index index.html;

       client_max_body_size 20m;

       gzip on;
       gzip_vary on;
       gzip_proxied any;
       gzip_comp_level 5;
       gzip_min_length 1024;
       gzip_types text/plain text/css text/csv application/javascript application/json image/svg+xml;

       # Restauration de backup : gros fichier transmis en flux
       location = /api/backup/import {
           client_max_body_size 512m;
           proxy_request_buffering off;
           proxy_read_timeout 300s;
           proxy_send_timeout 300s;
           proxy_pass http://${BACKEND_HOST}:3001/api/backup/import;
           # mêmes proxy_set_header que /api/
       }

       location /api/ {
           # inchangé
       }

       location ^~ /uploads/ {
           proxy_pass http://${BACKEND_HOST}:3001/uploads/;
           # proxy_set_header inchangés
           proxy_hide_header Cache-Control;
           add_header Cache-Control "public, max-age=2592000";
       }

       location /assets/ {
           try_files $uri =404;
           add_header Cache-Control "public, max-age=31536000, immutable";
       }

       location = /index.html {
           add_header Cache-Control "no-cache";
       }

       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```
   Supprimer la `location ~*` à base de regex.
2. Supprimer `frontend/nginx.conf`.
3. Valider la syntaxe et le comportement (voir Tests), coller les sorties dans la PR.

Hors périmètre : en-têtes de sécurité, `server_tokens off`, image non-root (D-02) ; healthcheck et port 3001 (D-03) ; brotli ou précompression au build ; smoke test en CI (D-08) ; `frontend/AGENTS.md:106`, qui présente encore `nginx.conf` comme la config de prod (D-09).

## Critères d'acceptation

- [x] `nginx -t` passe sur le template rendu.
- [x] Upload d'une photo de 3 à 4 Mo via l'UI en Docker : succès, plus de 413.
- [x] Import d'un fichier de bouteilles de 5 Mo : pas de 413.
- [x] Restauration d'un backup de 100 Mo : pas de 413.
- [x] `/assets/*.js` servi avec `Content-Encoding: gzip` et `Cache-Control: public, max-age=31536000, immutable`.
- [x] `/` et `/menu/<slug>` servis avec `Cache-Control: no-cache`.
- [x] `/uploads/<photo>` servi avec une seule ligne `Cache-Control: public, max-age=2592000`.
- [x] Les réponses JSON de plus de 1 Ko sous `/api/` sont compressées.
- [x] `frontend/nginx.conf` supprimé.

## Tests à ajouter ou adapter

Pas de test unitaire possible pour nginx. Vérifications à exécuter et à coller dans la PR :
```bash
# Syntaxe : l'entrypoint de l'image rend les templates avant d'exécuter nginx -t
docker run --rm -e BACKEND_HOST=127.0.0.1 \
  -v "$PWD/frontend/nginx.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  nginx:alpine nginx -t

# Comportement
docker compose up --build -d
curl -sI -H 'Accept-Encoding: gzip' "http://localhost/assets/<fichier index-*.js du build>"
curl -sI http://localhost/
curl -sI http://localhost/menu/test
head -c 3000000 /dev/urandom > /tmp/big.bin
curl -s -o /dev/null -w '%{http_code}\n' -X POST -F 'file=@/tmp/big.bin' \
  http://localhost/api/bottles/import/preview   # attendu 401 (Express atteint), pas 413
head -c 25000000 /dev/urandom > /tmp/huge.bin
curl -s -o /dev/null -w '%{http_code}\n' -X POST -F 'file=@/tmp/huge.bin' \
  http://localhost/api/bottles/import/preview   # attendu 413 (limite nginx)
```
Le test automatisé de bout en bout (upload réel de 2 Mo) relève de D-08.

## Points d'attention

- Un `add_header` dans une `location` annule ceux hérités du niveau `server`. D-02 ajoutera des en-têtes de sécurité au niveau `server` : il devra les répéter dans chaque `location` qui a son propre `add_header`, ou passer par un `include`. Le signaler dans la PR.
- `client_max_body_size 512m` pour le backup suit la limite multer actuelle (500 Mo). Si C-05 abaisse cette limite, réduire la valeur nginx dans la même PR.
- Avec `proxy_request_buffering off`, nginx transmet le corps au fil de l'eau ; le stockage en mémoire de multer côté backend reste le vrai facteur limitant (C-05).
- Les noms de fichiers uploadés sont uniques (`Date.now()` plus un aléa, `cocktails.ts:26-29`), d'où un cache de 30 jours sans risque de version périmée. Une restauration de backup réécrit les mêmes noms avec le même contenu.
- Pas de dossier `frontend/public/` aujourd'hui : `/vite.svg` renvoie `index.html`. Le favicon est traité en E-12, ne pas le recréer ici.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : PR #31. Template réécrit selon le plan, `proxy_set_header` déclarés une fois au niveau `server` (hérités par les `location` proxifiées), `text/javascript` ajouté à `gzip_types`, `frontend/nginx.conf` supprimé. Vérifié avec `nginx -t` (nginx 1.31.6) et `docker compose up --build` + curl : bundle JS gzippé (605 Ko → 169 Ko), en-têtes de cache conformes, photo 3,5 Mo 200, CSV bouteilles 5 Mo 200, 25 Mo 413, backup 100 Mo restauré (200). Upload testé par curl à travers nginx, pas par clic dans l'UI.
