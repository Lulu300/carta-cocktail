---
id: E-46
title: "Message traduit pour le 413 de nginx (fichier au-delà de sa limite)"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [E-45]
touches: [frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/i18n/locales/public/]
sources: []
branch: ""
pr: ""
---

## Contexte

Relevé pendant E-45. nginx (`frontend/nginx.conf.template`) refuse lui-même un envoi au-delà de `client_max_body_size` : 20 Mo pour `/api/`, 210 Mo pour la restauration. Il répond 413 avec une page HTML. Le backend a des limites plus basses (photo 5 Mo, import de bouteilles 10 Mo, sauvegarde 200 Mo) et répond un 413 JSON traduit, mais seulement quand le fichier passe nginx.

## Problème constaté

Une photo de plus de 20 Mo ou une sauvegarde de plus de 210 Mo n'atteint pas le backend : `send()` (`frontend/src/services/api.ts`) ne trouve pas de champ `error` et l'admin lit « HTTP 413 ». E-45 garde ce texte pour les 4xx non JSON, car « le serveur ne répond pas » y serait faux. Le frontend ne vérifie pas la taille avant l'envoi.

## Ce qu'il faut faire

1. Dans `send()`, à l'endroit où E-45 choisit le message, donner un message traduit (en, fr) à un 413 sans `error`, par exemple « The file is too large. ». Le 413 JSON du backend garde son message.
2. Ou vérifier la taille dans le frontend avant l'envoi (photo, import, sauvegarde) avec les limites du backend. À décider ; la première option suffit pour ne plus afficher de texte brut.

## Critères d'acceptation

- [ ] Un 413 HTML de nginx donne un message traduit, statut gardé.
- [ ] Le 413 JSON du backend garde son message.
- [ ] Budget du bundle public respecté (140 kB).

## Tests à ajouter ou adapter

- `services/api.test.ts` : le test d'E-45 « 413 non JSON » attend le nouveau message ; 413 JSON avec `error` inchangé.

## Points d'attention

- Les autres 4xx non JSON (400, 414, 431 de nginx pour une requête malformée) ne sont pas atteignables depuis l'interface.

## Journal

- 2026-11-12 : tâche créée pendant E-45 (PR #180).
