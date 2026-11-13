---
id: E-46
title: "Message traduit pour le 413 de nginx (fichier au-delà de sa limite) et les autres 4xx non JSON"
phase: E
lane: frontend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [E-45]
touches: [frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/i18n/locales/public/]
sources: []
branch: fix/E-46-nginx-413-message
pr: "#181"
---

## Contexte

Relevé pendant E-45. nginx (`frontend/nginx.conf.template`) refuse lui-même un envoi au-delà de `client_max_body_size` : 20 Mo pour `/api/`, 210 Mo pour la restauration. Il répond 413 avec une page HTML. Le backend a des limites plus basses (photo 5 Mo, import de bouteilles 10 Mo, sauvegarde 200 Mo) et répond un 413 JSON traduit, mais seulement quand le fichier passe nginx.

Décision de l'humain (« Before the rc ») : « Run E-46 now (author + reviewer): translated message for a non-JSON 413 (and other non-JSON 4xx), then the notes describe it. »

## Problème constaté

Une photo de plus de 20 Mo ou une sauvegarde de plus de 210 Mo n'atteint pas le backend : `send()` (`frontend/src/services/api.ts`) ne trouve pas de champ `error` et l'admin lit « HTTP 413 ». E-45 garde ce texte pour les 4xx non JSON, car « le serveur ne répond pas » y serait faux. Le frontend ne vérifie pas la taille avant l'envoi.

4xx non JSON qui peuvent arriver au frontend (vérifié sur `develop`) :

- **nginx** : 413 (`client_max_body_size`), 400 (requête mal formée, « Request Header Or Cookie Too Large »), 414 (URL au-delà de `large_client_header_buffers`), 408 (`client_body_timeout`). Pas de 404 ni de 405 de nginx sous `/api/` : tout y part au backend, dont le 404 est en JSON.
- **Serveur HTTP de Node, avant Express** : 431 (en-têtes au-delà de 16 Ko) et 408 (requête plus lente que `requestTimeout`, 300 s par défaut ; vérifié avec Node 24.14 : réponse `408 Request Timeout` sans corps). Voir E-48.
- **Proxy placé devant** (Traefik, Caddy, Cloudflare, proxy d'authentification) : n'importe quel 4xx avec sa propre page, par exemple 401, 403, 404, 405, 429.

## Ce qu'il faut faire

1. Dans `errorMessage()`, à l'endroit où E-45 choisit le message, donner un message traduit (en, fr) à un 413 sans `error` : « The file or request is too large » (« Le fichier ou la requête est trop volumineux »), le texte du 413 du backend (`errors.fileTooLarge`), sans taille car la limite dépend de la route.
2. Pour tout autre 4xx sans `error` : « The request could not be completed (error {{status}}). » (« La requête n'a pas abouti (erreur {{status}}). »). Le statut reste dans le texte : c'est le seul détail que l'admin peut transmettre.
3. Le 413 JSON du backend garde son message ; `ApiError.status` ne change pas ; clés dans les messages publics.

La vérification de la taille dans le frontend avant l'envoi n'est pas retenue : le message suffit pour ne plus afficher de texte brut.

## Critères d'acceptation

- [x] Un 413 HTML de nginx donne un message traduit, statut gardé.
- [x] Les autres 4xx non JSON donnent un message traduit avec le statut ; un 401 non JSON termine toujours la session.
- [x] Le 413 JSON du backend garde son message.
- [x] Budget du bundle public respecté (140 kB) : 133,30 kB avant, 133,41 kB après.

## Tests à ajouter ou adapter

- `services/api.test.ts` : 413 HTML de nginx sur l'envoi d'une photo (message, statut, jeton gardés) et en français ; 413 JSON du backend inchangé (message français avec l'interface en anglais) ; 400, 403, 404, 405, 408, 414 et 431 non JSON (message générique avec le statut) et en français ; 401 non JSON qui appelle toujours le gestionnaire de session ; le test de l'import de sauvegarde (422 non JSON) attend le message générique.

## Points d'attention

- Les écrans de sauvegarde ne sont pas touchés (E-47 y traite le 504).

## Journal

- 2026-11-12 : tâche créée pendant E-45 (PR #180).
- 2026-11-13 : faite (PR #181, branche `fix/E-46-nginx-413-message`). Deux branches ajoutées à `errorMessage()` après celle des 5xx. Sondes de sabotage : suppression de la branche 413, retour à `HTTP ${status}`, 413 testé avant le `error` du backend, interpolation retirée, clé française retirée ; chacune fait échouer au moins un test. Bundle public mesuré avec `.github/scripts/bundle-budget.mjs` : 133,30 kB avant, 133,41 kB après. E-48 créée pour l'envoi d'une sauvegarde coupé par Node au bout de 5 minutes.
- Notes de version : une photo de plus de 20 Mo ou une sauvegarde de plus de 210 Mo, refusée par nginx, affiche « The file or request is too large » au lieu de « HTTP 413 » ; tout autre 4xx de nginx ou d'un proxy placé devant affiche « The request could not be completed (error 4xx). » au lieu de « HTTP 4xx ».
