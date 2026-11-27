---
id: F-10
title: "Carte publique intégrable dans le site d'un bar (iframe)"
phase: F
lane: infra
criticite: basse
effort: M
status: done
owner: mixed
depends_on: [D-02]
touches: [frontend/nginx.conf.template, frontend/security-headers.conf, frontend/src/components/layout/PublicLayout.tsx, frontend/src/components/layout/OutsideFrameOnly.tsx, frontend/src/App.tsx, frontend/src/components/admin/EmbedMenuSettings.tsx, frontend/src/pages/admin/SettingsPage.tsx, frontend/src/utils/frame.ts, frontend/src/utils/embedCode.ts, frontend/public/sw-frame-navigations.js, frontend/vite.config.ts, frontend/src/services/api.ts, frontend/src/types/index.ts, frontend/src/i18n/locales/, backend/prisma/schema.prisma, backend/prisma/migrations/, backend/src/services/embedOrigins.ts, backend/src/services/settingsService.ts, backend/src/routes/settings.ts, backend/src/routes/public.ts, backend/src/validation/settings.ts, backend/src/i18n/, scripts/smoke/smoke.sh, docs/operations.md, frontend/AGENTS.md, backend/AGENTS.md]
sources: ["03-security.md §8"]
branch: feature/F-10-embeddable-menu
pr: 299
---

## Décisions validées (2026-10-10)

- D-02 bloque l'intégration en iframe partout (`X-Frame-Options: DENY`, `frame-ancestors 'none'`). Pas d'exception pour `/menu/` dans D-02 : cette tâche y revient plus tard.
- **À confirmer par l'humain avant de commencer** (`owner: mixed`) : un bar a-t-il réellement besoin d'intégrer la carte dans son site ? Si oui, quelles origines (`https://www.mon-bar.fr`…) ?

## Décisions validées (2026-11-27)

- Un bar doit pouvoir intégrer sa carte dans son site.
- L'admin saisit la liste des sites autorisés dans Paramètres (par exemple `https://www.mon-bar.fr`), enregistrée en base : migration. Elle remplace la variable d'environnement prévue plus bas.
- Seule la carte publique (`/menu/...`) devient intégrable par ces sites. `/`, l'admin, `/login`, l'API et les photos gardent `frame-ancestors 'none'` et `X-Frame-Options: DENY`.
- Origines acceptées : `https://hôte[:port]` seulement, sans chemin ni `*` ; `http:` seulement pour `localhost`. Chaque refus a son message en en/fr. Liste vide par défaut : la carte n'est intégrable nulle part, comme avant.
- L'écran Paramètres montre le code `<iframe>` à copier.

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

Adaptés aux décisions du 2026-11-27 : une liste en base à la place de `PUBLIC_MENU_FRAME_ANCESTORS`.

- [x] Sans site autorisé, les en-têtes sont identiques à ceux de D-02 sur toutes les routes.
- [x] Avec un site autorisé, `curl -sI http://localhost/menu/<slug>` renvoie `frame-ancestors 'self' <origine>` et pas de `X-Frame-Options`.
- [x] `/`, `/login`, `/admin`, `/admin/…`, `/api/…` et `/uploads/…` gardent `X-Frame-Options: DENY` et `frame-ancestors 'none'`, même avec un site autorisé.
- [x] Une page HTML servie depuis l'origine autorisée affiche la carte dans une iframe ; servie depuis une autre origine, le navigateur la bloque.
- [x] Dans l'iframe, le lien de connexion ouvre la fenêtre principale, et l'admin ne s'affiche pas dans l'iframe.
- [x] `nginx -t` passe (la configuration ne dépend plus d'une variable).

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
- 2026-11-27 : décisions de l'humain : oui, un bar doit pouvoir intégrer sa carte ; l'admin saisit la liste des sites autorisés dans Paramètres (migration) ; seule la carte publique `/menu/...` devient intégrable, l'admin, `/login` et le reste gardent `frame-ancestors 'none'` et `X-Frame-Options: DENY` ; origines `https://hôte[:port]` seulement, sans chemin ni `*`, `http:` pour `localhost` seulement, chaque refus traduit en en/fr ; liste vide par défaut ; code `<iframe>` à copier dans l'écran.
- 2026-11-27 : réalisé (PR #299). Colonne `SiteSettings.embedOrigins` (origines séparées par une espace, migration `20261127120000_site_embed_origins`). En-tête calculé par nginx avec `auth_request` vers `GET /api/public/embed-origins`, qui renvoie la liste dans `X-Embed-Origins` : nginx garde la CSP et `X-Frame-Options` à un seul endroit, le backend n'envoie que des origines revalidées (même après la restauration d'une sauvegarde), et une erreur du backend sert la SPA non intégrable (`error_page 500`). Retenu plutôt que la CSP servie par le backend, qui devrait servir `index.html` lui-même. Le service worker de F-02 envoie toute navigation d'un cadre au réseau (`public/sw-frame-navigations.js`) : son `index.html` précaché porte `frame-ancestors 'none'` et bloquait la carte intégrée dès le deuxième chargement (vérifié en retirant ce fichier). Garde `OutsideFrameOnly` sur `/login` et `/admin`, liens « Connexion » et « Tableau de bord » en `target="_top"` dans un cadre. Vérifié dans le projet compose `carta-f-10` (curl, smoke complet, Chrome sans interface : 14 contrôles), et la migration sur une copie de la fixture.
- 2026-11-27 : Notes de version : `breaking: false`, aucune action obligatoire. Nouveau réglage Paramètres > « Intégrer la carte dans un site » : les sites listés peuvent afficher les pages `/menu/…` dans une iframe, avec le code à coller ; vide par défaut, comportement inchangé. Migration qui ajoute une colonne à `SiteSettings` (copie `pre-migrate-*` automatique). Derrière un reverse proxy : il ne doit pas ajouter son propre `X-Frame-Options` ni sa CSP, et un site en HTTPS ne peut intégrer qu'une instance en HTTPS.
