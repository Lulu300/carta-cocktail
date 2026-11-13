---
id: E-48
title: "Restauration coupée par Node quand l'envoi de la sauvegarde dure plus de 5 minutes (408)"
phase: E
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: []
touches: [backend/src/serverTimeouts.ts, backend/src/serverTimeouts.test.ts, backend/src/index.ts, backend/src/test/helpers.ts, backend/src/routes/backup.test.ts, frontend/nginx.conf.template]
sources: []
branch: fix/E-48-restore-upload-timeout
pr: "#188"
---

## Contexte

Relevé pendant E-46 en cherchant quels 4xx non JSON peuvent arriver au frontend. La restauration (`location = /api/backup/import` de `frontend/nginx.conf.template`) transmet l'archive au backend au fil de l'eau (`proxy_request_buffering off`), avec `proxy_send_timeout 300s` entre deux écritures et jusqu'à 210 Mo.

## Problème constaté

Le backend ne réglait pas `server.requestTimeout` (`backend/src/index.ts`, `app.listen`). La valeur par défaut de Node (depuis la v18, Node 24 compris) est 300 000 ms pour recevoir **toute** la requête, corps compris. Vérifié avec Node 24.14 : un serveur `http` dont le corps de requête arrive plus lentement que `requestTimeout` répond `HTTP/1.1 408 Request Timeout` sans corps et ferme la connexion.

Une sauvegarde de 200 Mo envoyée à moins d'environ 5,3 Mbit/s (connexion distante, liaison montante d'une box) dépasse donc 5 minutes et est coupée par Node, alors que nginx accepte la taille et le délai. Vérifié avec `nginx:1.28-alpine`, la `location` de la restauration et `curl --limit-rate` : nginx relaie le 408 de Node au navigateur (corps vide), pas un 502. L'admin lit « The request could not be completed (error 408). » (`common.requestFailed`, depuis E-46), et réessayer au même débit échoue de la même façon.

Faits établis dans le code de Node v24.14.0 (`lib/_http_server.js`, `src/node_http_parser.cc`) et par des essais :

- `requestTimeout` : durée maximale entre le début d'une requête et la fin de son corps, vérifiée toutes les `connectionsCheckingInterval` (30 s). Elle ne compte plus une fois le corps reçu : le traitement de la restauration n'est pas concerné. Le réglage vaut pour tout le serveur, relu à chaque vérification. Node n'offre rien de public pour une seule route : `req.setTimeout(0)` n'empêche pas le 408.
- `headersTimeout` : `min(60 000, requestTimeout)` à la création du serveur, donc 60 s. Il reste actif avec `requestTimeout = 0`.
- `timeout` (inactivité, désactivé par défaut) et `keepAliveTimeout` (5 s entre deux requêtes) ne jouent pas ici.
- Une voie par route existe (`server.on('clientError')`), mais elle oblige à réécrire la réponse de Node pour toutes les erreurs client, avec des champs internes.
- Derrière nginx, les autres routes ne sont pas concernées par `requestTimeout` : nginx garde leur corps en mémoire tampon (20 Mo, `client_body_timeout` de 60 s entre deux lectures) et l'envoie d'un coup.

## Ce qu'il faut faire

Décision de l'humain (2026-11-13), mot pour mot : « A: disable for the server » — « server.requestTimeout = 0 (2 lines + test). Consistent with nginx, which only bounds the gap between writes. On direct connections, no more time limit on any request body, before auth included. »

1. `configureServerTimeouts(server)` (`backend/src/serverTimeouts.ts`) met `requestTimeout` à 0. `index.ts` l'appelle après `app.listen`. Module à part pour que les tests règlent le même serveur avec des délais courts.
2. Commentaire de la `location` de la restauration dans `nginx.conf.template` : les délais bornent l'écart entre deux écritures, pas l'envoi entier, et le backend ne pose pas de limite totale non plus.
3. Le README ne documente aucun délai : pas de changement.

## Critères d'acceptation

- [x] Une restauration dont l'envoi dure plus de 5 minutes aboutit.
- [x] Les autres routes gardent une limite de durée : `headersTimeout` (60 s) pour les en-têtes ; derrière nginx, le `client_body_timeout` de nginx pour le corps. En accès direct, plus de limite sur le corps (voir Points d'attention).

## Tests à ajouter ou adapter

- `backend/src/serverTimeouts.test.ts` : valeurs retenues (`requestTimeout` 0, `headersTimeout` 60 000) ; 408 toujours envoyé à un client qui ne termine pas ses en-têtes à temps (délai réduit).
- `backend/src/routes/backup.test.ts` : une restauration envoyée en 10 morceaux sur 5 fois l'ancien délai (réduit à 200 ms, vérifié toutes les 10 ms) aboutit et ramène les données.
- `listenWithShortTimeouts()` dans `src/test/helpers.ts` démarre l'app avec les réglages d'`index.ts` sur des délais courts.

## Points d'attention

- Compromis accepté par l'humain : sur une connexion qui arrive **directement** au backend (`npm run dev`, ou un port 3001 publié à nouveau), plus aucune limite de durée sur le corps d'une requête, sur toutes les routes, avant l'authentification comprise (`express.json()` lit les corps JSON de 100 ko avant `authMiddleware`). Un client lent peut garder une connexion ouverte sans fin. Les en-têtes restent bornés à 60 s. Depuis v1.12.0, `docker-compose.prod.yml` ne publie pas 3001 et `docker-compose.yml` le lie à `127.0.0.1`.
- `index.ts` est exclu de la couverture : le test vérifie `configureServerTimeouts`, pas son appel dans `index.ts`.

## Journal

- 2026-11-13 : tâche créée pendant E-46.
- 2026-11-13 : faits établis (question au coordinateur, options A à E), décision de l'humain : option A. Faite (PR #188, branche `fix/E-48-restore-upload-timeout`). Sondes de sabotage, chacune annulée : sans `requestTimeout = 0` (2 échecs : la restauration lente reçoit 408, la valeur reste 300 000), avec en plus `headersTimeout = 0` (2 échecs : la valeur, et le client aux en-têtes incomplets n'est plus coupé).
- Notes de version : une restauration de sauvegarde dont l'envoi dure plus de 5 minutes (archive de 200 Mo à moins d'environ 5 Mbit/s) n'est plus coupée par une erreur 408. Le backend ne limite plus la durée totale de réception d'une requête, comme nginx pour la restauration ; seuls les en-têtes restent limités à 60 s. Hors nginx (port 3001 publié), aucune limite de durée ne s'applique donc plus au corps des requêtes.
