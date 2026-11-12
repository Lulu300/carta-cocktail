---
id: E-41
title: "Carte publique : retrouver le nom et l'icône du bar après l'échec du chargement des réglages"
phase: E
lane: frontend
criticite: basse
effort: S
status: review
owner: agent
depends_on: [C-47]
touches: [frontend/src/contexts/SiteSettingsContext.tsx, frontend/src/contexts/SiteSettingsContext.test.tsx, frontend/src/pages/public/PublicErrorState.tsx, frontend/src/pages/public/HomePage.test.tsx, frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/test/msw/utils.ts]
sources: []
branch: fix/E-41-site-settings-load-failure
pr:
---

## Contexte

Relevé par la relecture des notes de v1.13.0 (PR #174, manque 4). `SiteSettingsProvider` (`frontend/src/contexts/SiteSettingsContext.tsx`) charge `GET /api/public/settings` une fois au démarrage, hors React Query, et fournit le nom et l'icône du bar à `PublicLayout`, `HomePage` et `AdminLayout`, ainsi qu'au titre de l'onglet et au favicon. `SettingsPage` (admin) appelle `refresh()` après un enregistrement.

Décision de l'humain : « Code fix before the rc » — « Frontend task: retry or handle the failure of /public/settings so the bar's name and icon come back. »

## Problème constaté

Vérifié sur `develop` : l'effet de montage ignore l'échec (`.catch(() => {})`). Un invité dont le premier chargement reçoit un 429 (limite de C-47, partagée par toutes les adresses dans les installations à adresse commune) voit « Carta Cocktail » et l'icône par défaut dans l'en-tête et l'onglet pendant toute la visite, en plus de l'erreur de chargement du menu. Le bouton « Réessayer » du menu (`PublicErrorState`) ne relance que la requête du menu.

## Ce qu'il faut faire

1. `ApiError` garde le `Retry-After` d'un 429 (`retryAfterSeconds`, en secondes ; le limiteur du backend n'envoie jamais la forme date HTTP).
2. `SiteSettingsProvider` : tant que les réglages ne sont pas arrivés, réessayer au plus trois fois, après le `Retry-After` d'un 429 (au moins 1 s) ou 30 s pour une autre erreur. Une réussite, automatique ou par `refresh`, annule le réessai en attente. Pas de boucle : au-delà, seule une action de l'invité relance.
3. Exposer `retryFailedLoad()` (ne fait rien une fois les réglages arrivés) et l'appeler depuis le bouton « Réessayer » de `PublicErrorState`, commun aux trois pages publiques.

## Critères d'acceptation

- [x] Après un 429 au premier chargement, le nom et l'icône du bar reviennent dans l'en-tête, le titre et le favicon sans recharger la page, une fois le `Retry-After` écoulé.
- [x] Le bouton « Réessayer » d'une page publique en erreur recharge aussi les réglages s'ils manquent, et seulement dans ce cas.
- [x] Aucune boucle : au plus quatre requêtes automatiques (le chargement et trois réessais), espacées du délai demandé.
- [x] Un échec de `refresh()` après un premier chargement réussi garde les réglages affichés (comportement existant).
- [x] Budget du bundle public respecté (140 kB).

## Tests à ajouter ou adapter

- `contexts/SiteSettingsContext.test.tsx` : 429 puis succès après le `Retry-After` (nom, icône, titre, favicon) ; 30 s après une erreur réseau ; arrêt après trois réessais ; `retryFailedLoad` charge tout de suite et annule le réessai en attente ; `retryFailedLoad` sans requête une fois les réglages arrivés.
- `services/api.test.ts` : `retryAfterSeconds` d'un 429 (secondes, date HTTP ignorée, en-tête absent).
- `pages/public/HomePage.test.tsx` : 429 sur les réglages et les menus, puis « Réessayer » → menus et nom du bar affichés.
- `test/msw/utils.ts` : `mockRateLimited(method, path, retryAfterSeconds)`.

## Points d'attention

- E-38 (todo) touche aussi `PublicErrorState.tsx` (annonce de l'alerte) : conflit simple à résoudre au merge, le bouton garde son `onClick`.
- Les réglages restent hors React Query : `AppProviders` des tests et `main.tsx` n'ont pas à changer.

## Journal

- 2026-11-12 : tâche créée d'après le manque 4 de la relecture de la PR #174 (décision humaine : correctif avant la rc).
- 2026-11-12 : faite (branche `fix/E-41-site-settings-load-failure`). Réessai automatique borné (3, `Retry-After` ou 30 s) et rechargement par le « Réessayer » des pages publiques. Bundle public mesuré avec `.github/scripts/bundle-budget.mjs` : 132,60 kB avant, 132,88 kB après (budget 140 kB).
- Notes de version : après un refus « Too many requests » au chargement, la carte publique retrouve le nom et l'icône du bar sans recharger la page (après le délai demandé par le serveur, ou au clic sur « Réessayer »).
