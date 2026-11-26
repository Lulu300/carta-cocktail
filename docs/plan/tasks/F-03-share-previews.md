---
id: F-03
title: "Aperçus de partage (Open Graph) pour les liens de carte"
phase: F
lane: infra
criticite: basse
effort: M
status: done
owner: agent
depends_on: [A-05]
touches: [frontend/nginx.conf.template, backend/src/routes/public.ts]
sources: ["06-frontend-ux-perf.md §4"]
branch: feature/F-03-share-previews
pr: 266
---

## Contexte

Un lien de carte envoyé sur WhatsApp, iMessage ou Messenger s'affiche sans titre ni image. Les robots qui génèrent ces aperçus n'exécutent pas le JavaScript : ils ne voient que `index.html`, identique pour toutes les URL. Un aperçu avec le nom du bar, le nom de la carte et une photo rend le lien plus engageant.

## Problème constaté

- `frontend/index.html:1-13` : ni `description`, ni balises Open Graph ou Twitter, titre fixe « Carta Cocktail ».
- `frontend/nginx.conf.template:25-28` : toute URL inconnue renvoie le même `index.html` (`try_files ... /index.html`).
- Les routes publiques concernées sont `/menu/:slug` et `/menu/:slug/cocktail/:id` (`frontend/src/App.tsx:35-36`).
- `backend/src/routes/public.ts:31` (`GET /menus/:slug`) et `:206` (`GET /cocktails/:id`) renvoient du JSON, pas de HTML.

## Ce qu'il faut faire

Choix à valider avant de commencer :
- **Option A, route backend + aiguillage nginx (recommandée).** nginx repère les robots d'aperçu par `User-Agent` (`map $http_user_agent $is_preview_bot`, liste : `facebookexternalhit`, `WhatsApp`, `Twitterbot`, `Slackbot`, `TelegramBot`, `Discordbot`, `LinkedInBot`, `Applebot`...). Pour eux seulement, `/menu/...` est proxifié vers une route backend qui renvoie une page HTML minimale avec les balises OG. Les humains reçoivent la SPA inchangée. Pas de dépendance au backend pour l'affichage normal.
- **Option B, SSI nginx.** `index.html` contient un `<!--# include virtual="/api/public/og?path=$uri" -->` et nginx active `ssi on` sur `/menu/`. Marche pour tous les clients sans liste de robots, mais chaque chargement de carte appelle le backend, et `index.html` (hors `touches`) doit changer.

Étapes pour l'option A :
1. `backend/src/routes/public.ts` : `GET /api/public/share/menu/:slug` et `GET /api/public/share/menu/:slug/cocktail/:id`. Renvoyer `text/html` avec `og:title` (cocktail ou carte, puis nom du bar), `og:description`, `og:image` (URL absolue de la photo, ou du premier cocktail illustré de la carte), `og:url`, `og:type=website`, `twitter:card=summary_large_image`, plus un lien vers l'URL humaine.
2. Échapper toutes les valeurs insérées (noms et descriptions viennent de l'admin et des imports) : réutiliser un échappement HTML testé, jamais de concaténation brute.
3. Respecter les règles d'A-05 : menu non public, élément masqué ou cocktail hors menu → 404, sans fuite d'information.
4. URL absolues : variable d'environnement `PUBLIC_BASE_URL` si définie, sinon `X-Forwarded-Proto` + `Host`.
5. `nginx.conf.template` : `map` des robots et `location ~ ^/menu/` qui proxifie vers `/api/public/share$uri` quand `$is_preview_bot`, sinon `try_files` habituel.

## Critères d'acceptation

- [x] `curl -A "WhatsApp/2.23" http://localhost/menu/<slug>` renvoie les balises `og:*` de la carte.
- [x] `curl http://localhost/menu/<slug>` (navigateur) renvoie toujours la SPA.
- [x] Un menu non public ou un slug inconnu renvoie 404 aux robots.
- [x] Un nom de cocktail contenant `<script>` ressort échappé.
- [ ] L'outil de debug de partage de Facebook ou l'aperçu WhatsApp affiche titre et image. (Demande une URL publique : à vérifier sur une instance en ligne.)

## Tests à ajouter ou adapter

- `backend/src/routes/public.test.ts` : balises présentes, échappement, 404 pour menu privé et cocktail hors menu, `og:image` absolue avec et sans `PUBLIC_BASE_URL`.
- Smoke D-08 : un `curl -A WhatsApp` sur une carte publique créée par le script.

## Points d'attention

- `og:image` : WhatsApp et iMessage gèrent mal le WebP. Si F-01 ne garde que du WebP, prévoir une variante JPEG pour les aperçus.
- Derrière un reverse proxy TLS, `$scheme` vaut `http` dans le conteneur nginx (`nginx.conf.template:13`). Sans `PUBLIC_BASE_URL`, les URL seraient en `http://`. Documenter la variable dans D-09.
- Langue des aperçus : les robots n'envoient pas d'`Accept-Language` utile. Décider d'une langue par défaut (celle du bar).
- La liste de `User-Agent` vieillit. La garder courte, dans un seul `map`, commentée.
- Si la carte doit rester confidentielle (lien partagé à des clients seulement), ajouter `<meta name="robots" content="noindex">` sur ces pages.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-11-26 : PR #266. Option A : `map` des robots d'aperçu dans `nginx.conf.template` (`rewrite ... last` vers `/api/public/share/menu/...`), routes `GET /api/public/share/menu/:slug` et `/share/menu/:slug/cocktail/:id` (`services/sharePreview.ts`, `utils/html.ts`), règles invité seulement (404 pour carte non publiée, élément masqué, cocktail hors de cette carte), image = photo du cocktail ou du premier cocktail illustré visible de la carte. URL absolues : `PUBLIC_BASE_URL`, sinon `X-Forwarded-Proto` + `X-Forwarded-Host` (nouveau, `$http_host`, garde le port). Applebot laissé hors liste (robot de recherche ; iMessage envoie `facebookexternalhit`). Vérifié dans le projet compose `carta-f-03` (smoke étendu, `curl` avec les User-Agent WhatsApp et iMessage, Chrome sans interface sur la SPA). Amélioration possible : variante JPEG pour `og:image` si F-01 ne garde que du WebP.
- 2026-11-26 : Notes de version : un lien de carte ou de cocktail partagé dans une messagerie (WhatsApp, iMessage, Slack, Telegram, Discord…) affiche un aperçu avec le titre, la description et la photo. Aucune action requise. Derrière un reverse proxy HTTPS, renseigner la nouvelle variable facultative `PUBLIC_BASE_URL=https://<domaine>` dans `.env` (les compose de v1.17.0 et avant ne la transmettent pas : nouveau fichier, ou ligne `- PUBLIC_BASE_URL=…` dans `environment` du backend) ; une valeur qui n'est pas une adresse `http` ou `https` empêche le backend de démarrer. `breaking: false`.
