---
id: F-02
title: "PWA : carte consultable hors-ligne et installable"
phase: F
lane: frontend
criticite: basse
effort: M
status: todo
owner: agent
depends_on: [E-01, E-12, B-06]
touches: [frontend/vite.config.ts, frontend/public/, frontend/package.json, frontend/package-lock.json, frontend/nginx.conf.template]
sources: ["06-frontend-ux-perf.md §4"]
branch:
pr:
---

## Contexte

Le wifi d'un bar plein est souvent saturé. Un invité qui a ouvert la carte une fois doit pouvoir la rouvrir sans réseau, et l'habitué doit pouvoir l'ajouter à son écran d'accueil avec une vraie icône. Aujourd'hui l'application n'a ni manifest ni service worker.

## Problème constaté

- Aucun `manifest.webmanifest`, aucun service worker, aucune icône (`frontend/index.html:1-13`).
- `frontend/public/` n'existe pas. `index.html:5` et `SiteSettingsContext.tsx:46` référencent `/vite.svg`, absent du build : la requête retombe sur `index.html` via `try_files` (E-12 corrige le favicon).
- `frontend/vite.config.ts:6` : seulement `react()` et `tailwindcss()`.
- Pas de `theme-color` ni d'`apple-touch-icon` (E-12 ajoute `theme-color`).

## Ce qu'il faut faire

1. Attendre E-01 (routes admin en lazy, sinon tout l'admin part dans le précache), E-12 (favicon, `theme-color`, polices locales) et B-06 (version de Vite définitive).
2. Ajouter `vite-plugin-pwa` (version compatible avec la Vite de B-06).
3. Créer `frontend/public/` avec `pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`, `apple-touch-icon.png` (180 px). Partir d'un visuel 🍸 sur fond `#0f0f1a`.
4. Configurer le plugin dans `vite.config.ts` :
   - `registerType: 'autoUpdate'` ;
   - manifest : `name` « Carta Cocktail », `display: 'standalone'`, `start_url: '/'`, `theme_color` et `background_color` `#0f0f1a`, les icônes ;
   - `workbox.globPatterns` limité au shell public (exclure les chunks admin et jszip) ;
   - `navigateFallback: '/index.html'` avec `navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//, /^\/admin/]` ;
   - `runtimeCaching` : `NetworkFirst` (timeout 3 s) sur `/api/public/`, `CacheFirst` avec expiration (200 entrées, 30 jours) sur `/uploads/`. Aucun cache pour les autres routes `/api/`.
5. Désactiver le plugin dans Vitest si nécessaire (`vitest.config.ts`).

## Critères d'acceptation

- [ ] Lighthouse (onglet PWA ou « Installable ») ne signale pas d'erreur sur `/`.
- [ ] Après une visite de `/menu/<slug>` et d'une fiche cocktail, la carte et ses photos s'affichent en mode avion.
- [ ] Les réponses de `/api/cocktails`, `/api/auth/*` et `/api/settings` ne sont jamais servies depuis le cache.
- [ ] Après un déploiement, le nouveau service worker prend la main au rechargement suivant.
- [ ] Le précache ne contient aucun chunk admin (vérifier `dist/sw.js`).

## Tests à ajouter ou adapter

- Test de build : après `npm run build`, vérifier la présence de `dist/manifest.webmanifest` et `dist/sw.js`, et l'absence des chunks admin dans la liste de précache (petit script Node ou test Vitest sur `dist/`).
- Test manuel documenté dans la PR (Chrome DevTools > Application, mode hors ligne).
- F-04 pourra ajouter un parcours Playwright hors ligne.

## Points d'attention

- Choix à valider avant de commencer : `NetworkFirst` (données fraîches, plus lent sans réseau) ou `StaleWhileRevalidate` (instantané, mais un cocktail indisponible peut apparaître disponible quelques minutes) pour `/api/public/`.
- `touches` complété avec `frontend/nginx.conf.template` : `sw.js` doit être servi avec `Cache-Control: no-cache`, et `manifest.webmanifest` avec le type `application/manifest+json` si `mime.types` ne le connaît pas.
- La CSP de D-02 couvre le service worker (`worker-src` hérite de `default-src 'self'`). À vérifier si D-02 est mergé avant.
- Un service worker mal configuré peut servir une ancienne version indéfiniment. Garder `autoUpdate` et prévoir la procédure de désinscription dans D-09.
- L'admin connecté ne doit pas lire des données en cache : l'exclusion des routes `/api/` non publiques est obligatoire.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
