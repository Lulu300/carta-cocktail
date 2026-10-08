---
id: F-06
title: "Thème clair optionnel"
phase: F
lane: frontend
criticite: basse
effort: M
status: todo
owner: agent
depends_on: [E-03, E-09]
touches: [frontend/src/index.css, frontend/src/components/, frontend/index.html]
sources: ["06-frontend-ux-perf.md §2"]
branch:
pr:
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

- [ ] Le choix du thème persiste après rechargement.
- [ ] Aucun flash du mauvais thème au chargement.
- [ ] Contraste ≥ 4,5:1 pour le texte normal dans les deux thèmes (axe ou Lighthouse).
- [ ] Les contrôles natifs (select, checkbox) suivent le thème.
- [ ] L'impression de la fiche cocktail est inchangée.

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
