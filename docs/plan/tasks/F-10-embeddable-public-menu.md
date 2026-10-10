---
id: F-10
title: "Carte publique intégrable dans le site d'un bar (iframe)"
phase: F
lane: infra
criticite: basse
effort: M
status: todo
owner: mixed
depends_on: [D-02]
touches: [frontend/nginx.conf.template, frontend/security-headers.conf, frontend/Dockerfile, docker-compose.yml, docker-compose.prod.yml, .env.example, frontend/src/components/layout/PublicLayout.tsx, frontend/src/components/layout/AdminLayout.tsx, frontend/src/pages/auth/LoginPage.tsx]
sources: ["03-security.md §8"]
branch:
pr:
---

## Décisions validées (2026-10-10)

- D-02 bloque l'intégration en iframe partout (`X-Frame-Options: DENY`, `frame-ancestors 'none'`). Pas d'exception pour `/menu/` dans D-02 : cette tâche y revient plus tard.
- **À confirmer par l'humain avant de commencer** (`owner: mixed`) : un bar a-t-il réellement besoin d'intégrer la carte dans son site ? Si oui, quelles origines (`https://www.mon-bar.fr`…) ?

## Contexte

Depuis D-02, nginx envoie sur toutes les réponses `X-Frame-Options: DENY` et une CSP avec `frame-ancestors 'none'` (`frontend/security-headers.conf`). Cela protège l'admin du clickjacking, mais empêche aussi un bar d'afficher sa carte publique (`/menu/<slug>`) dans une iframe de son propre site.

## Problème constaté

- `frontend/security-headers.conf` : `frame-ancestors 'none'` et `X-Frame-Options: DENY` s'appliquent à toutes les routes, publiques comprises.
- L'application est une SPA : `/menu/…`, `/login` et `/admin/…` sont tous servis par le même `index.html`, via le repli `try_files` puis `location = /index.html`. Les en-têtes ne peuvent donc pas dépendre de la seule `location` : il faut décider à partir de l'URI demandée par le navigateur (`$request_uri`).
- `X-Frame-Options` n'accepte pas de liste d'origines (`ALLOW-FROM` est obsolète et ignoré par les navigateurs récents) : seule la directive CSP `frame-ancestors` peut autoriser des origines précises.

## Ce qu'il faut faire

1. Variable d'environnement du conteneur frontend, par exemple `PUBLIC_MENU_FRAME_ANCESTORS`, avec la liste des origines autorisées séparées par des espaces. Vide par défaut : comportement actuel (`'none'` partout). La documenter dans `.env.example` et les deux compose.
2. Dans `nginx.conf.template`, un `map $request_uri` (au niveau `http`, hors du bloc `server`) qui choisit la valeur de `frame-ancestors` :
   - routes publiques de la carte (`/menu/…`, et `/` si la page d'accueil publique doit aussi être intégrable, à décider) : `'self' <origines autorisées>` ;
   - toutes les autres (`/login`, `/admin/…`, API, photos) : `'none'`.
3. Dans `security-headers.conf`, construire la CSP avec cette variable. Ne plus envoyer `X-Frame-Options` sur les routes publiques autorisées (une valeur `DENY` bloquerait l'iframe même avec `frame-ancestors`) ; le garder à `DENY` partout ailleurs. Une variable vide ne doit jamais produire une CSP invalide.
4. L'admin reste en `DENY` / `frame-ancestors 'none'`. Une carte intégrée peut naviguer côté client vers `/login` ou `/admin` sans recharger le document, donc sans nouveaux en-têtes : ouvrir le lien de connexion du pied de page dans la fenêtre principale (`target="_top"`), et refuser d'afficher la connexion et l'admin quand `window.top !== window.self` (message avec un lien qui ouvre l'admin hors de l'iframe).
5. Garder l'inclusion du snippet dans chaque `location` qui a son propre `add_header` (règle d'héritage d'nginx, voir D-02).

## Critères d'acceptation

- [ ] Sans `PUBLIC_MENU_FRAME_ANCESTORS`, les en-têtes sont identiques à ceux de D-02 sur toutes les routes.
- [ ] Avec une origine configurée, `curl -sI http://localhost/menu/<slug>` renvoie `frame-ancestors 'self' <origine>` et pas de `X-Frame-Options`.
- [ ] `/login`, `/admin`, `/admin/…`, `/api/…` et `/uploads/…` gardent `X-Frame-Options: DENY` et `frame-ancestors 'none'`, même avec une origine configurée.
- [ ] Une page HTML servie depuis l'origine autorisée affiche la carte dans une iframe ; servie depuis une autre origine, le navigateur la bloque.
- [ ] Dans l'iframe, le lien de connexion ouvre la fenêtre principale, et l'admin ne s'affiche pas dans l'iframe.
- [ ] `nginx -t` passe avec et sans la variable.

## Tests à ajouter ou adapter

- Contrôle manuel ou script : `curl -sI` sur `/menu/<slug>`, `/login`, `/admin`, `/api/public/settings`, avec et sans la variable.
- Navigateur headless (Playwright) : page hôte sur une origine autorisée et sur une origine refusée ; erreurs console relevées.
- Frontend : test unitaire du garde « pas d'admin dans une iframe » (`window.top` simulé) et du `target="_top"` du lien de connexion.
- Smoke test D-08 s'il est mergé : en-têtes de `/admin` inchangés.

## Points d'attention

- Ne pas élargir `frame-ancestors` aux photos ou à l'API : seule la page de la carte doit être intégrable.
- `/` est la liste des cartes publiques : à confirmer avec l'humain si elle doit aussi être intégrable.
- Une origine mal formée dans la variable (guillemets, point-virgule) casse la CSP : valider ou documenter le format (origines `https://…` séparées par des espaces).
- Notes de version : nouvelle variable optionnelle, sans action obligatoire (comportement inchangé si elle n'est pas définie).
- E-11 a déplacé le lien « Connexion » dans un pied de page discret : c'est ce lien qui doit cibler `_top`.

## Journal

- 2026-10-10 : tâche créée à la demande de l'humain, lors de la PR de D-02 (#61) : l'intégration en iframe reste bloquée partout dans D-02, à rouvrir si un bar en a besoin.
