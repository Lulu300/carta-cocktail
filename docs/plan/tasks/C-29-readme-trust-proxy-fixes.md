---
id: C-29
title: "README : corriger « Login limit behind a reverse proxy » (compteur partagé, pare-feu et Docker)"
phase: C
lane: docs
criticite: haute
effort: S
status: done
owner: agent
depends_on: [C-27]
touches: [README.md]
sources: []
branch: docs/C-29-readme-trust-proxy-fixes
pr:
---

## Contexte

C-27 (PR #87) a écrit la section `README.md` « Login limit behind a reverse proxy » sur `TRUST_PROXY` et la limite de connexion de C-11. La revue de la PR de notes v1.11.0 (#90, points 1, 2 et 10 du dernier commentaire) y relève deux erreurs. Décision humaine : correction avant v1.11.0.

## Problème constaté

1. **Compromis de `TRUST_PROXY` présenté à l'envers.** Sous Docker rootless ou Podman, Docker Desktop, ou pour un client IPv6 relayé par `docker-proxy`, le premier proxy voit tous ces clients sous la même adresse privée. Avec le défaut, Express fait confiance à toute la chaîne et renvoie l'adresse la plus à gauche : les clients honnêtes partagent déjà un compteur, et un client qui forge `X-Forwarded-For` contourne la limite. Le README laisse croire que `TRUST_PROXY=1` ou `2` crée le compteur partagé et son risque de blocage de l'admin ; en réalité il enlève seulement le contournement.
2. **« Block them at the firewall » est faux avec Docker rootful.** Les ports publiés passent par `PREROUTING`, `FORWARD` et `DOCKER-USER`, pas par `INPUT` : ufw et les zones firewalld usuelles ne les filtrent pas. Le port 3001 reste joignable, et avec `TRUST_PROXY=1` l'API croit le `X-Forwarded-For` d'un client qui s'y connecte en direct.

## Ce qu'il faut faire

1. Réécrire la limite « adresse privée » : compteur déjà partagé par les clients honnêtes avec le défaut, contournement par en-tête forgé.
2. Après l'extrait YAML : `TRUST_PROXY=1` (nginx seul) ou `2` (SWAG…) enlève le contournement sans ajouter de risque de blocage ; relever `LOGIN_RATE_LIMIT` au besoin.
3. Remplacer « block them at the firewall » : ne pas publier le port 3001 (retirer l'entrée `ports` de `carta-cocktail-backend`, nginx le joint par le réseau compose) ou le lier à `127.0.0.1:3001:3001` ; même chose pour le port de nginx derrière SWAG ; expliquer pourquoi le pare-feu de l'hôte ne suffit pas avec Docker rootful ; ne pas rediriger ces ports depuis Internet.

## Critères d'acceptation

- [x] La section dit qu'avec le défaut, dans les installations listées, les clients honnêtes partagent déjà un compteur et qu'un client qui forge l'en-tête contourne la limite.
- [x] La section dit que `TRUST_PROXY=1` ou `2` enlève le contournement sans ajouter de risque de blocage, et propose de relever `LOGIN_RATE_LIMIT`.
- [x] La section ne recommande plus le pare-feu de l'hôte pour les ports publiés par Docker rootful, et recommande de ne pas publier le port 3001 ou de le lier à `127.0.0.1`.
- [x] Seule cette section du README change ; fichiers compose inchangés.

## Tests à ajouter ou adapter

- Aucun (documentation). Comportements vérifiés avec `proxy-addr` 2.0.7 et `compileTrust` d'Express (voir Journal).

## Points d'attention

- Ne pas modifier les fichiers compose : D-03 retirera la publication du port 3001.
- C-18 et D-23 touchent aussi `README.md` : rester dans la section.
- Les mêmes erreurs figurent dans les notes v1.11.0 et `UPGRADING.md` ; elles sont corrigées dans la PR #90 (C-28), pas ici.

## Journal

- 2026-10-11 : tâche créée (revue de la PR #90, points 1, 2 et 10 ; décision humaine : prérequis de v1.11.0).
- 2026-10-11 : fait. Vérifié avec `proxy-addr` 2.0.7 et `compileTrust` d'Express 5 (socket nginx `172.18.0.3`). Rootless, nginx seul : `X-Forwarded-For: 10.0.2.100` donne `10.0.2.100` avec le défaut, `1` et `2` ; `1.2.3.4, 10.0.2.100` donne `1.2.3.4` avec le défaut, `10.0.2.100` avec `1`. Rootless derrière SWAG : `1.2.3.4, 10.0.2.100, 172.18.0.4` donne `10.0.2.100` avec `2`. Rootful, IPv4 via nginx : l'adresse réelle avec le défaut et `1`, quel que soit l'en-tête. Accès direct au port 3001 : socket `203.0.113.9` et en-tête `9.9.9.9` donnent `9.9.9.9` avec `1` ou `2` ; socket privée (rootless) : `9.9.9.9` aussi avec le défaut. Seule la section « Login limit behind a reverse proxy » de `README.md` change. Pas d'action utilisateur imposée (recommandations de configuration), pas de ligne « Notes de version ».
