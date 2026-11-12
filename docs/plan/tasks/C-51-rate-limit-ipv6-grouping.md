---
id: C-51
title: "Limites de débit : compter un client IPv6 par réseau /64, pas par /56"
phase: C
lane: backend
criticite: basse
effort: S
status: review
owner: agent
depends_on: [C-47]
touches: [backend/src/middleware/rateLimit.ts, backend/src/middleware/rateLimit.test.ts, backend/src/routes/apiRateLimit.test.ts, backend/src/routes/loginRateLimit.test.ts, backend/AGENTS.md, README.md, .env.example, UPGRADING.md]
sources: []
branch: fix/C-51-rate-limit-ipv6-grouping
pr: ""
---

## Contexte

Relecture des notes de v1.13.0 (PR #174, manque 3 du relecteur). Les trois limiteurs (connexion `LOGIN_RATE_LIMIT`, API `API_RATE_LIMIT`, sauvegarde 10 par 15 minutes) viennent de `createRateLimiter()` (`backend/src/middleware/rateLimit.ts`, C-47), qui ne règle ni `keyGenerator` ni `ipv6Subnet`.

Le `keyGenerator` par défaut d'express-rate-limit 8.7.0 appelle `ipKeyGenerator(req.ip, 56)` : une adresse IPv6 compte pour tout son réseau /56. C'était déjà le cas du limiteur de connexion en v1.11.0 et v1.12.0 (même version de la bibliothèque).

## Décisions validées

- 2026-11-12, humain : « Code fix before the rc » — « Change the IPv6 grouping in createRateLimiter (e.g. /64 or per address) with a test, and correct the README. Counting per address lets one client get around the limit by rotating its IPv6 addresses. »
- 2026-11-12, humain : « /64 (one LAN) » — « ipv6Subnet: 64. Same Wi-Fi shares a count (as an IPv4 NAT); guest VLAN and staff VLAN, or mobile subscribers, are separate. A client with a /56 delegation gets 256× the limit (≈2,560 login attempts per 15 min). »

## Problème constaté

Tous les appareils d'un même site IPv6 partagent un compteur, comme derrière un NAT IPv4, alors que le README et `.env.example` disent « per client IP address ». Deux cas concrets :
- les échecs de connexion d'un invité sur le réseau invités bloquent l'admin sur le réseau du personnel, quand les deux réseaux sont deux /64 d'un même /56 ;
- des abonnés mobiles sans lien entre eux, chacun avec son /64 tiré du même bloc de l'opérateur, peuvent partager un compteur.

L'effet ne se voit que là où une vraie adresse IPv6 arrive dans `X-Forwarded-For` : un reverse proxy qui voit les clients IPv6 (réseau hôte, réseau Docker avec IPv6, autre machine), Cloudflare Tunnel, ou une installation hors Docker. Dans l'installation de base, les clients IPv6 passent par `docker-proxy` sous une seule adresse IPv4 : rien ne change pour eux.

## Ce qu'il faut faire

1. `ipv6Subnet: 64` dans `createRateLimiter()`, donc pour les trois limiteurs, avec la raison en commentaire. Pas de `keyGenerator` : l'option suffit, et express-rate-limit écrit une `ValidationError` pour un `keyGenerator` qui lit `req.ip` sans `ipKeyGenerator`, ou pour `ipv6Subnet` hors de 32-64.
2. Tests : adresses d'un même /64 sur un seul compteur ; /64 différents d'un même /56 sur des compteurs séparés ; IPv4 et forme `::ffff:` inchangées ; aucune erreur ni aucun avertissement d'express-rate-limit.
3. Corriger le README (« Environment Variables », « Login limit behind a reverse proxy »), `.env.example` et `backend/AGENTS.md`. La ligne « Login limit » de la section v1.11.0 d'`UPGRADING.md`, déjà publiée, disait « from one IP address » alors que le compte se faisait par /56 : elle est précisée (accord du coordinateur pour cette exception à la règle 9).

## Critères d'acceptation

- [x] Deux adresses IPv6 du même /64 partagent un compteur, pour la connexion et pour l'API.
- [x] Deux /64 différents d'un même /56 ont chacun leur compteur.
- [x] Un client IPv4 garde son compteur par adresse, et `::ffff:203.0.113.1` compte avec `203.0.113.1`.
- [x] La création du limiteur et la première requête n'écrivent rien dans `console.error` ni `console.warn`.
- [x] README, `.env.example` et `backend/AGENTS.md` disent qu'un client IPv6 compte pour son /64.

## Tests à ajouter ou adapter

- `backend/src/middleware/rateLimit.test.ts` (nouveau) : petite app Express avec un limiteur à 2 requêtes, `trust proxy` sur le loopback, clients donnés par `X-Forwarded-For`. Vérifié : les tests de regroupement échouent avec `IPV6_SUBNET = 56`, et le test « no validation error » échoue avec 128.
- `apiRateLimit.test.ts` et `loginRateLimit.test.ts` : un test « counts an IPv6 client per /64 network » chacun, à travers l'app réelle.

## Points d'attention

- Un client qui a une délégation /56 obtient 256 compteurs (environ 2 560 échecs de connexion par 15 minutes) ; un /48 en obtient 65 536. Décision humaine ci-dessus.
- Les notes de v1.13.0 sont dans la PR #174, hors de cette branche : la phrase à reprendre est dans la ligne « Notes de version » du Journal.

## Journal

- 2026-11-12 : tâche créée d'après la relecture de la PR #174 (manque 3). Faits établis avant la décision : options d'express-rate-limit 8.7.0 sondées (clés produites pour /56, /64 et `false`, validations qui écrivent une `ValidationError` sans bloquer), et chemin de `req.ip` depuis nginx (`listen 8080` en IPv4 seulement, réseau compose sans IPv6). Décision humaine : /64.
- 2026-11-12 : PR ouverte (branche `fix/C-51-rate-limit-ipv6-grouping`). `ipv6Subnet: 64` dans la fabrique, tests unitaires et d'intégration, README, `.env.example`, `backend/AGENTS.md`, et la ligne v1.11.0 d'`UPGRADING.md`.
- Notes de version : « An IPv6 client now counts for its /64 network (one LAN) in the rate limits, instead of its /56: devices on the same Wi-Fi still share a counter, but other networks of the same site, such as a guest network and a staff network, and mobile subscribers each get their own. No action required; only installs where the API sees real IPv6 client addresses (a reverse proxy or tunnel that receives IPv6) notice the change. »
