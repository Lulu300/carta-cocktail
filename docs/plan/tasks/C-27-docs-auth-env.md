---
id: C-27
title: "Documenter LOGIN_RATE_LIMIT, TRUST_PROXY, JWT_EXPIRES_IN et CORS_ORIGIN"
phase: C
lane: docs
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-11, D-13]
touches: [README.md, .env.example]
sources: []
branch: docs/C-27-docs-auth-env
pr: https://github.com/Lulu300/carta-cocktail/pull/87
---

## Contexte

C-11 (PR #82) ajoute quatre variables d'environnement facultatives au backend, lues par `backend/src/config.ts`. Elles n'ont pas été documentées dans la PR de C-11 parce que `README.md` et `.env.example` étaient modifiés en parallèle par D-13.

## Problème constaté

`README.md` et `.env.example` ne citent pas :

- `LOGIN_RATE_LIMIT` : nombre d'échecs de connexion admis par adresse IP en 15 minutes, 10 par défaut ; au-delà, 429. Entier positif, sinon le backend refuse de démarrer.
- `TRUST_PROXY` : proxys dont l'API croit l'en-tête `X-Forwarded-For`, pour connaître l'IP du client. Par défaut `loopback, linklocal, uniquelocal` : nginx et un reverse proxy placé devant lui sur un réseau privé (SWAG, Traefik…) sont reconnus sans configuration, et une adresse forgée par un client d'Internet est ignorée. Un nombre = nombre de proxys traversés ; sinon une liste Express d'adresses, de sous-réseaux ou de noms. Une valeur illisible fait refuser le démarrage. Limites : un client du réseau local peut forger son adresse. Dans les installations où le premier proxy (nginx, ou SWAG) voit un client d'Internet sous une adresse **privée** (Docker rootless ou Podman via leur redirecteur de ports, client IPv6 sur un port publié quand le démon Docker n'a pas IPv6 et que `docker-proxy` le relaie, Docker Desktop), cette adresse est jugée sûre et l'API lit l'adresse écrite par le client dans `X-Forwarded-For` : il peut en changer à chaque essai et la limite est contournable, comme sur `develop` avant C-11. `TRUST_PROXY=1` (ou `2` derrière SWAG) donne alors un compteur partagé par tous les clients à la place du contournement : la limite tient, mais 10 échecs de n'importe qui bloquent aussi l'admin pendant 15 minutes.
- `JWT_EXPIRES_IN` : durée de vie des tokens, `7d` par défaut. Nombre de secondes ou durée (`24h`, `7d`) ; une valeur illisible fait refuser le démarrage.
- `CORS_ORIGIN` : vide par défaut (aucune origine externe autorisée, l'application est servie sur une seule origine) ; une origine (`https://exemple.fr`) l'autorise.

## Ce qu'il faut faire

1. `.env.example` : les quatre variables, commentées, avec leur valeur par défaut.
2. `README.md` : une ligne par variable dans le tableau ou la section de configuration du backend, avec les limites de `TRUST_PROXY` ci-dessus.

## Critères d'acceptation

- [x] Les quatre variables sont documentées avec leur valeur par défaut et leur format.

## Tests à ajouter ou adapter

- Aucun (documentation).

## Points d'attention

- Ne pas les ajouter aux fichiers compose : les valeurs par défaut conviennent.

## Journal

- 2026-10-11 : tâche créée pendant C-11 (PR #82).
- 2026-10-11 : fait (PR #87). Défauts et formats vérifiés dans `backend/src/config.ts` et `backend/src/app.ts`. `README.md`, section « Environment Variables » seulement : une ligne par variable, une note sur Docker (les fichiers compose ne transmettent pas ces variables : les ajouter à la liste `environment` de `carta-cocktail-backend`, comme `SQLITE_WAL`), sous-section « Login limit behind a reverse proxy » avec les limites de `TRUST_PROXY` et le fait qu'un redémarrage vide les compteurs (en mémoire). `.env.example` : les quatre variables commentées avec leur défaut. Fichiers compose inchangés. Pas d'action utilisateur, pas de ligne « Notes de version ».
- 2026-10-11 : suites de la revue de la PR #87. (1) Sous-section `TRUST_PROXY` : `TRUST_PROXY=1` ou `2` ne tient que si aucun client ne contourne un proxy ; tant que les fichiers compose publient le port 3001 (D-03 à venir), et derrière SWAG le port de nginx, un client qui s'y connecte directement forge son adresse : ne pas exposer ces ports ou les bloquer au pare-feu. (2) Extrait YAML `- TRUST_PROXY=1` et avertissement sur les guillemets (gardés dans la valeur par compose, refus de démarrer) ; guillemets retirés du défaut dans `.env.example`. Branche rebasée sur `develop` (#86).
