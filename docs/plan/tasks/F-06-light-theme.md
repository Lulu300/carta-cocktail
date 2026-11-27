---
id: F-06
title: "Thème clair optionnel"
phase: F
lane: frontend
criticite: basse
effort: M
status: done
owner: agent
depends_on: [E-03, E-09]
touches: [frontend/src/index.css, frontend/src/components/, frontend/index.html, frontend/public/theme-init.js, frontend/vite.config.ts, .github/scripts/bundle-budget.mjs]
sources: ["06-frontend-ux-perf.md §2"]
branch: feature/F-06-light-theme
pr: 292
---

## Contexte

L'application est uniquement sombre. C'est cohérent pour un bar le soir, mais en terrasse en plein jour le texte gris sur bleu nuit se lit mal sur un téléphone. Un thème clair optionnel n'est faisable qu'une fois les couleurs centralisées (E-03) et les contrastes corrigés (E-09).

## Problème constaté

- Couleurs codées en dur partout : 214 occurrences de `#0f0f1a` ou `#1a1a2e` dans `frontend/src` (la revue compte 176 classes `bg-[...]`, `06-frontend-ux-perf.md §2`).
- `frontend/src/index.css:4-7` : `@theme` ne définit que les polices, aucun jeton de couleur (E-03 les ajoute).
- Pas de `prefers-color-scheme`, pas de `<meta name="color-scheme">` (`frontend/index.html:1-13`). E-12 ajoute `color-scheme: dark` et `theme-color`.
- Les styles d'impression (`index.css`, bloc `@media print`) sont déjà clairs : ils montrent que le contenu tient sur fond blanc.

## Ce qu'il faut faire

Choix à valider avant de commencer :
- périmètre : carte publique seule, ou admin aussi ;
- valeur par défaut : sombre (identité du bar), ou suivre le système (`prefers-color-scheme`) ;
- qui choisit : chaque invité (bouton, mémorisé en `localStorage`), ou l'admin pour tout le site (réglage dans `SiteSettings`, migration de schéma en plus).

Étapes, en supposant un choix par visiteur avec sombre par défaut :
1. Vérifier qu'après E-03 aucune couleur en dur ne reste dans les composants (`grep -rn '#0f0f1a\|#1a1a2e' frontend/src` vide).
2. Dans `index.css`, garder les jetons sombres dans `@theme` et les surcharger pour le clair :
   ```css
   :root[data-theme="light"] {
     --color-bg: #faf7f2;
     --color-surface: #ffffff;
     --color-accent: #b45309;
     color-scheme: light;
   }
   ```
3. Ajouter un composant `ThemeToggle` (dans `components/ui/`) placé dans `PublicLayout` (et `AdminLayout` si retenu), avec `aria-pressed` et libellé traduit.
4. Dans `index.html`, un petit script en ligne qui lit `localStorage` et pose `data-theme` avant le premier rendu, pour éviter un flash sombre. Mettre à jour `theme-color` au changement.
5. Vérifier les contrastes WCAG AA des deux thèmes (texte, liens, badges, états désactivés).

## Critères d'acceptation

- [x] Le choix du thème persiste après rechargement.
- [x] Aucun flash du mauvais thème au chargement.
- [x] Contraste ≥ 4,5:1 pour le texte normal dans les deux thèmes (axe ou Lighthouse).
- [x] Les contrôles natifs (select, checkbox) suivent le thème.
- [x] L'impression de la fiche cocktail est inchangée.

## Tests à ajouter ou adapter

- Test Vitest du `ThemeToggle` : bascule de `data-theme`, persistance, `aria-pressed`.
- Si F-04 existe : capture Playwright de la carte publique dans les deux thèmes.

## Points d'attention

- `touches` complété avec `frontend/index.html` (script anti-flash). E-12 modifie aussi ce fichier.
- Un script en ligne dans `index.html` est bloqué par la CSP `script-src 'self'` de D-02. Ajouter son hash (`'sha256-...'`) à la CSP, ou le sortir dans un fichier `public/theme-init.js` chargé en synchrone.
- L'ambre `#fbbf24` sur blanc ne passe pas AA : le thème clair a besoin d'un accent plus foncé.
- Les photos de cocktails ont souvent un fond sombre : vérifier le rendu des cartes en thème clair avant de valider les couleurs.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-11-27 : décisions de l'humain pour les trois choix à valider : périmètre = la carte publique seule (l'admin reste sombre) ; thème par défaut = sombre ; choix par chaque visiteur, bouton mémorisé dans `localStorage` (clé `theme`), sans réglage admin ni migration.
- 2026-11-27 : implémentation. Jetons clairs sous `:root[data-theme='light']` (`index.css`), accent `amber-800` (`amber-700` donnait 4,37:1 sur les pastilles teintées). Nouveaux jetons `fg-soft`, `fg-strong`, `accent-pale` pour remplacer les `text-gray-300`, `text-white`, `text-amber-200` des pages publiques ; badges de disponibilité sur les jetons `danger`, `warning`, `success`. `text-accent/80` des titres de la fiche devient `text-accent` (3,6:1 sinon). Script anti-flash `public/theme-init.js` (fichier synchrone, CSP inchangée), ajouté au précache (`vite.config.ts`) et exigé par `bundle-budget.mjs`. `theme-color` suit le thème. `PublicLayout` pose `data-theme` sur `<html>` tant qu'il est monté et le retire en le quittant : l'admin et `/login` restent sombres (le script ignore ces chemins). `touches` complété.
- 2026-11-27 : vérifié sur un build avec Chrome sans interface (puppeteer-core, axe-core, sur le serveur servi avec la CSP de nginx) : carte et fiche à 390 et 1280 px dans les deux thèmes, 0 violation `color-contrast` ; persistance après rechargement ; premier rendu clair avec le script d'entrée retenu 1,5 s ; impression identique dans les deux thèmes ; bundle public 138,1 kB gzip (budget 140).
- 2026-11-27 : relecture de la PR : les badges de disponibilité (visibles par l'admin connecté) restaient sous 4,5:1 en clair. Jetons `success` et `warning` clairs en `green-800` et `yellow-800`, et nouveaux jetons `danger-bg`, `warning-bg`, `success-bg` (identiques dans les deux thèmes) pour la teinte de fond, ce qui garde le thème sombre inchangé. Vérifié avec axe sur la carte d'un admin connecté (0, 2 et 8 portions, puce « indisponible »), 390 et 1280 px, deux thèmes : 0 violation.
- 2026-11-27 : Notes de version : nouveauté, un bouton soleil dans l'en-tête de la carte publique bascule entre thème sombre (par défaut) et thème clair, choix mémorisé par navigateur ; l'admin reste sombre ; aucune action requise.
