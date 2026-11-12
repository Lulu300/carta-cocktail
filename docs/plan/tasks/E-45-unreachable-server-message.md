---
id: E-45
title: "Message traduit quand le serveur ne répond pas (502, 503, 504, réponse non JSON)"
phase: E
lane: frontend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [E-39]
touches: [frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/contexts/AuthContext.test.tsx, frontend/src/i18n/locales/public/]
sources: []
branch: fix/E-45-unreachable-server-message
pr: "#180"
---

## Contexte

Relevé par la relecture des notes de v1.13.0 (PR #174, dernier commentaire, nit « Line 22 »). Quand le backend est arrêté derrière nginx (redémarrage, crash), `send()` (`frontend/src/services/api.ts`) ne trouve pas de champ `error` dans la réponse et prend `HTTP ${res.status}` comme message. Le nouvel écran « Your session could not be checked » d'E-39 (#175) affiche alors le texte brut « HTTP 502 ».

Décision de l'humain : « Code fix before the rc » — « New task (author + reviewer): a translated message such as 'The server is not responding, try again in a moment' for 502/503/504 or non-JSON answers, then the notes describe it. »

## Problème constaté

Vérifié sur `develop` :

- **Ce que renvoie nginx** (`frontend/nginx.conf.template`, `proxy_pass $backend` résolu à chaque requête) : une page HTML d'erreur, jamais du JSON. 502 quand le conteneur du backend est arrêté (nom introuvable par le résolveur) ou démarre (connexion refusée) ; 504 quand le backend ne répond pas dans `proxy_read_timeout` (60 s, 300 s pour la restauration). nginx n'envoie pas de 503 ici ; un proxy placé devant (Traefik, Caddy, Cloudflare) peut en envoyer, avec sa propre page. En développement, le proxy de Vite répond 500 sans corps quand le backend est arrêté.
- **Le backend** envoie toujours `{ error }` traduit pour une erreur (`errorHandler`, `apiNotFoundHandler`, limiteur) ; seule la route de santé répond `{ status: 'unavailable' }` (503), qu'on n'appelle pas depuis le frontend.
- **Où s'affiche le message d'une `ApiError`** :
  - écran de session d'E-39 (`App.tsx`, `SessionCheckError`) ;
  - page de connexion (`LoginPage`, `getLoginErrorMessage`, hors 401) ;
  - notifications d'erreur de l'admin (`toast.error`) : mutations CRUD (`queries/crud.ts`, `useForcedDelete`, `useMenuMutation`), export des bouteilles (`ExportMenu`), export des cocktails (`CocktailsPage`) ;
  - réglages : site, profil, export et restauration de sauvegarde (`SettingsPage`) ;
  - assistants d'import de bouteilles et de cocktails.
  
  Les pages publiques n'affichent pas ce message : `PublicErrorState` montre « Check your connection and try again. », et l'export public d'une recette ne fait qu'écrire dans la console. Les listes de l'admin en erreur (`LoadError`) ont leur propre texte.

## Ce qu'il faut faire

1. Dans `send()`, un seul endroit : garder le champ `error` du backend quand il existe, quel que soit le statut ; sans lui, un statut ≥ 500 (502, 503, 504, et le 500 vide du proxy de Vite) donne le message traduit `common.serverUnavailable`.
2. Le statut reste dans `ApiError.status` (réessai de React Query, 401, 404, 409, `Retry-After` du 429).
3. Clé dans les messages publics (en, fr) : `api.ts` fait partie du premier chargement.

## Critères d'acceptation

- [x] Un 502 HTML de nginx, un 503, un 504 et un 500 non JSON donnent « The server is not responding, try again in a moment. » (« Le serveur ne répond pas, réessayez dans un instant. »), avec le statut gardé.
- [x] Une réponse JSON avec `error` garde son message, y compris pour un 5xx ; le 401 et le 429 ne changent pas.
- [x] Une erreur réseau reste une `TypeError` (l'écran de session garde « Check your connection and try again. »).
- [x] Budget du bundle public respecté (140 kB) : 133,22 kB avant, 133,30 kB après.

## Tests à ajouter ou adapter

- `services/api.test.ts` : 502 HTML, 503 texte, 504 HTML, 500 sans corps (message traduit, statut gardé, jeton gardé) ; message en français ; 5xx JSON sans `error` ; 502 JSON avec `error` inchangé ; 413 non JSON inchangé (`HTTP 413`) ; erreur réseau inchangée. Le test de l'export de sauvegarde (503 non JSON) attend le nouveau message.
- `contexts/AuthContext.test.tsx` : la page HTML 502 de nginx sur `/api/auth/me` garde le jeton et donne `sessionError` avec le statut 502 et le message traduit.

## Points d'attention

- Un 4xx non JSON garde `HTTP <statut>` : « le serveur ne répond pas » serait faux. Le seul cas atteignable est le 413 de nginx pour un fichier au-delà de sa limite (photo de plus de 20 Mo, sauvegarde de plus de 210 Mo) ; il fait l'objet d'E-46.

## Journal

- 2026-11-12 : tâche créée d'après le nit « Line 22 » de la relecture de la PR #174 (décision humaine : correctif avant la rc).
- 2026-11-12 : faite (PR #180, branche `fix/E-45-unreachable-server-message`). Message traduit dans `send()` pour une réponse ≥ 500 sans `error` du backend. Bundle public mesuré avec `.github/scripts/bundle-budget.mjs` : 133,22 kB avant, 133,30 kB après (budget 140 kB). E-46 créée pour le 413 de nginx.
- Notes de version : quand le backend ne répond pas (redémarrage, arrêt, délai dépassé), l'écran « Your session could not be checked », la page de connexion et les messages d'erreur de l'admin disent « The server is not responding, try again in a moment. » au lieu de « HTTP 502 » (ou 503, 504).
