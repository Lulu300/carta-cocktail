---
id: E-36
title: "Cible navigateurs ramenée à celle de v1.11 (Safari et iOS 16.0)"
phase: E
lane: frontend
criticite: haute
effort: S
status: done
owner: agent
depends_on: [B-06]
touches: [frontend/vite.config.ts, .github/scripts/css-media-ranges.mjs, .github/scripts/css-media-ranges.test.mjs, .github/workflows/ci.yml, frontend/AGENTS.md, docs/plan/README.md, docs/plan/tasks/B-06-deps-vite.md]
sources: ["08-dependencies.md §3.3"]
branch: fix/E-36-browser-target
pr: https://github.com/Lulu300/carta-cocktail/pull/159
---

## Décisions validées (2026-11-05)

- **Cible navigateurs** : on revient sur la décision de B-06. Option retenue par l'humain dans la relecture des notes v1.12.0 (PR #152, écart G5) : « G5: older browsers — Lower the browser target again (undo B-06 at least for the admin). Weighs on the bundle budget. »
- Appliquée à toute l'application (public et admin) : un seul build, et le budget n'en souffre pas (voir Journal).

## Contexte

B-06 (PR #105, Vite 8) a gardé la cible par défaut de Vite 8 : Safari et iOS 16.4, Chrome et Edge 111, Firefox 114. v1.11 (Vite 7) visait Safari et iOS 16.0, Chrome et Edge 107, Firefox 104. La relecture des notes v1.12.0 (PR #152, G5) relève que le changement touche aussi l'admin : une tablette bloquée sous iPadOS 15 ou 16.0 à 16.3 sert d'affichage de carte ou d'admin.

## Problème constaté

Mesuré sur `v1.11.0` et `origin/develop` (28986cd), builds de production comparés :

- **CSS, la vraie régression.** Tailwind 4 écrit ses points de rupture en syntaxe d'intervalle (`@media (width>=40rem)`, `@media not all and (width>=64rem)` pour `max-lg:`). Safari avant 16.4 ne la comprend pas et ignore la règle entière. En v1.11, le minifieur CSS de Vite 7 (esbuild, `cssTarget` safari16) les réécrivait en `min-width`. En Vite 8, le minifieur Lightning CSS suit la cible Safari 16.4 et les laisse : sur Safari et iOS 16.0 à 16.3, tous les styles `sm:`, `md:`, `lg:`, `xl:`, `2xl:` et `max-lg:` sont perdus (barre latérale de l'admin, grilles de la carte publique).
- **Le reste du CSS fonctionnait déjà en v1.11 et fonctionne encore.** Tailwind 4 est « conçu pour Safari 16.4+ », mais depuis 4.1 il ajoute ses propres replis pour les navigateurs plus anciens (blog Tailwind v4.1) : `@property` a son repli dans `@layer properties` sous `@supports ((-webkit-hyphens:none) and (not (margin-trim:inline)))`, vrai pour Safari < 16.4 ; chaque `color-mix()` est sous `@supports (color:color-mix(in lab,red,red))` avec une couleur de repli (0 déclaration sans repli dans les trois builds) ; `oklch()`, `@layer`, `:where()`, `translate`/`scale` datent de Safari 15.4 ou avant. Pas de `:has()`, d'imbrication CSS ni de `@starting-style`. Tailwind est en 4.3.3 dans les deux versions.
- **JavaScript : rien ne casse.** Le build de `develop` avec la cible par défaut et celui avec la cible Safari 16 sont identiques, au nom des fichiers près (Oxc n'avait rien à abaisser). Contrôle syntaxique : chaque chunk retransformé par esbuild en `safari16` ne change pas, sauf la regex `/\p{Diacritic}/gu` (esbuild la passe en `new RegExp` par prudence ; les échappements de propriétés Unicode existent depuis Safari 11.1) et des parenthèses sans effet. Pas de lookbehind ni de bloc `static {}`. API récentes présentes : `URL.canParse` (zod) et `crypto.randomUUID` (react-hook-form), toutes deux testées avant usage.
- **Budget** : chargement initial du menu public 131,94 kB gzip avec les deux cibles (budget 140 kB). Seul le CSS grossit : 9,68 → 10,14 kB gzip (replis hex et `@supports (color:lab(...))` des couleurs `oklch` pour Chrome 107-110 et Firefox 104-112, que v1.11 n'avait pas).

## Ce qu'il faut faire

1. `build.target` de `frontend/vite.config.ts` aux cibles de v1.11 : `['chrome107', 'edge107', 'firefox104', 'safari16']` (`build.cssTarget` suit), avec un commentaire qui dit pourquoi.
2. Contrôle CI du CSS construit : `.github/scripts/css-media-ranges.mjs dist` échoue si une feuille de style contient une media query en syntaxe d'intervalle, avec ses tests `node --test`.
3. Documenter les navigateurs pris en charge dans `frontend/AGENTS.md` et mettre à jour la décision dans `docs/plan/README.md`.

## Critères d'acceptation

- [x] Le CSS construit n'a plus que des `min-width` (aucune `width>=`), comme en v1.11.
- [x] `css-media-ranges.mjs` échoue sur le build de `develop` d'avant la correction (6 requêtes listées) et passe sur le build corrigé.
- [x] Budget du chargement initial inchangé (131,94 kB gzip, budget 140 kB).
- [x] Lint, `tsc -b`, tests et couverture verts.
- [x] Décision de B-06 mise à jour (README du plan, Journal de B-06).

## Tests à ajouter ou adapter

- `.github/scripts/css-media-ranges.test.mjs` : CSS en `min-width` accepté, requêtes d'intervalle refusées (minifiées, à deux bornes, non minifiées, en majuscules), une seule ligne par requête, opérateurs hors `@media` ignorés, dossier sans feuille de style, dossier `assets` absent, usage.
- Étape CI « CSS media queries readable by Safari 16 » après le budget, sur le vrai build.

## Points d'attention

- Pas de test sur un vrai Safari 16.0 à 16.3 (aucun appareil disponible) : la conclusion repose sur l'analyse du build. Sur ces versions, le rendu reste celui de v1.11, dégradé à la marge (Tailwind le dit lui-même : quelques ombres ou couleurs avec opacité peuvent différer, `color-mix` n'existant qu'à partir de 16.2).
- iOS 15 n'est pas couvert, pas plus qu'en v1.11 : la cible de v1.11 était déjà Safari 16.0. Aller plus bas demanderait `@vitejs/plugin-legacy` ou des replis CSS supplémentaires.
- La cible abaisse la syntaxe, pas les API : une API plus récente que Safari 16.0 doit être testée avant usage (rappel dans `frontend/AGENTS.md`).

## Journal

- 2026-11-05 : tâche créée à partir de l'écart G5 de la relecture des notes v1.12.0 (PR #152), décision de l'humain du jour.
- 2026-11-05 : PR #159. Faits établis sur des builds de `v1.11.0` et de `develop` (voir « Problème constaté ») : seule régression, les media queries d'intervalle laissées par Lightning CSS avec la cible Safari 16.4. `build.target` ramené aux cibles de v1.11 pour toute l'application, contrôle CI `css-media-ranges.mjs` et ses tests. Hors `touches` initial : aucun. Pas de constat hors périmètre.
- 2026-11-05 : Notes de version : aucune action requise. Cible navigateurs ramenée à celle de v1.11 (Safari et iOS 16.0, Chrome et Edge 107, Firefox 104) : le relèvement à Safari 16.4 de B-06 (#105) ne sort pas, la ligne correspondante des notes v1.12.0 (#152, « Public menu ») est à retirer. Sans ce correctif, Safari et iOS 16.0 à 16.3 perdaient toute la mise en page responsive, admin comprise.
- 2026-11-05 : relecture de la PR #159 (approuvée), trois suggestions appliquées : `frontend/AGENTS.md` demande de tester toute API plus récente que l'une des cibles (pas seulement Safari 16.0, ex. `toSorted` : Chrome 110, Firefox 115) ; drapeau `i` sur `RANGE_MEDIA_QUERY` avec un test en majuscules ; la décision de B-06 renvoie à E-36.
