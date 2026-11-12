---
id: E-48
title: "Restauration coupée par Node quand l'envoi de la sauvegarde dure plus de 5 minutes (408)"
phase: E
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: []
touches: [backend/src/index.ts, frontend/nginx.conf.template]
sources: []
branch: ""
pr: ""
---

## Contexte

Relevé pendant E-46 en cherchant quels 4xx non JSON peuvent arriver au frontend. La restauration (`location = /api/backup/import` de `frontend/nginx.conf.template`) transmet l'archive au backend au fil de l'eau (`proxy_request_buffering off`), avec `proxy_send_timeout 300s` entre deux écritures et jusqu'à 210 Mo.

## Problème constaté

Le backend ne règle pas `server.requestTimeout` (`backend/src/index.ts`, `app.listen`). La valeur par défaut de Node (depuis la v18, Node 24 compris) est 300 000 ms pour recevoir **toute** la requête, corps compris. Vérifié avec Node 24.14 : un serveur `http` dont le corps de requête arrive plus lentement que `requestTimeout` répond `HTTP/1.1 408 Request Timeout` sans corps et ferme la connexion.

Une sauvegarde de 200 Mo envoyée à moins d'environ 5,3 Mbit/s (connexion distante, liaison montante d'une box) dépasse donc 5 minutes et est coupée par Node, alors que nginx accepte la taille et le délai. Si nginx relaie ce 408, l'admin lit « The request could not be completed (error 408). » depuis E-46 (« HTTP 408 » avant) ; s'il répond 502, « The server is not responding, try again in a moment. », et réessayer échoue de la même façon. Les autres routes ne sont pas concernées : nginx y garde le corps en mémoire tampon et l'envoie d'un coup au backend.

## Ce qu'il faut faire

1. Vérifier sur la pile Docker (envoi limité en débit, par exemple `curl --limit-rate`) ce que reçoit le navigateur : le 408 de Node relayé par nginx, ou un 502.
2. Choisir une limite cohérente pour la restauration : `requestTimeout` plus long (ou désactivé) sur le serveur, ou réglé seulement pour cette route, en gardant une protection contre une connexion lente pour les autres routes (`headersTimeout`).
3. Aligner le commentaire de `nginx.conf.template` et la documentation de la restauration sur la limite retenue.

## Critères d'acceptation

- [ ] Une restauration dont l'envoi dure plus de 5 minutes aboutit (ou échoue avec un message qui dit pourquoi).
- [ ] Les autres routes gardent une limite de durée.

## Tests à ajouter ou adapter

- Backend : un test qui vérifie la valeur de `requestTimeout` retenue (ou le comportement de la route de restauration avec un corps envoyé lentement).

## Points d'attention

- Décision produit possible sur la durée maximale acceptée. Ne pas toucher aux écrans de sauvegarde en même temps qu'E-47.

## Journal

- 2026-11-13 : tâche créée pendant E-46.
