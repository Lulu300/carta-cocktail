---
id: E-10
title: "i18n frontend : ~55 textes en dur, pluriels, garde-fou lint"
phase: E
lane: frontend
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [E-05, E-06, E-07, E-08]
touches: [frontend/src/i18n/locales/, frontend/src/pages/, frontend/src/components/, frontend/eslint.config.js, frontend/package.json, frontend/package-lock.json]
sources: ["05-frontend-archi.md §7", "06-frontend-ux-perf.md §2"]
branch:
pr:
---

## Contexte

L'application est bilingue, mais un admin qui choisit l'anglais voit encore une interface à moitié française, et les compteurs affichent « bouteille(s) » ou « dose/doses ». Les fichiers de traduction sont propres (307 clés de chaque côté, aucune clé manquante) ; le problème est dans le code. Cette tâche passe après les refontes pour ne pas extraire deux fois les mêmes textes, puis ajoute un garde-fou de lint.

## Problème constaté

Inventaire de départ (lignes du code actuel ; elles auront bougé après E-05 à E-08, refaire le `grep`) :

| Fichier | Lignes | Traité par |
|---|---|---|
| `MenuEditPage.tsx`, `MenuBottleEditPage.tsx` | environ 26 textes | E-07 (normalement plus rien à faire) |
| `UnitsPage.tsx` | 86, 99, 157, 163, 166, libellés « Français »/« English » 140, 145 | ici |
| `BottlesPage.tsx` | 199, 214, 347, 455, 456, 463, 466, 470 (« Alcool », « Utilisation », « ml », « € »…) | ici (fichiers extraits par E-05) |
| `CocktailsPage.tsx` | 119, 129, 141, 149, 154 (« Indisponible », « dose/doses », « Stock faible », « Manquant », « autre(s) ») | ici (composants extraits par E-06) |
| `MenusPage.tsx` | 61, 64, 86, 94-95, 108-109 (« Type », « Contenu », « (par défaut) », « Apéritifs », « bouteille(s) ») | ici |
| `IngredientsPage.tsx` | 257 (« Icône (optionnel) »), 242, 247 | ici |
| `CategoriesPage.tsx` | 335 (`placeholder="GARNISH, MIXER..."`), 234, 239, 363, 368 | ici |
| `HomePage.tsx` | 47 (`'bouteille(s)'`) | E-11 |
| `IconPicker.tsx` | 55, 84, 93, 101, 108 | E-09 |
| `LanguageSelector.tsx` | 69 (`aria-label`) | E-09 |
| `App.tsx` | 24 (« Loading... ») | E-01 |
| `MenuPublicPage.tsx` | 130 (« % vol. »), 134 (« ml ») | ici si E-11 ne l'a pas fait |

Autres constats :
- Pluriels faits à la main (`CocktailsPage.tsx:129`, `MenusPage.tsx:108`, `HomePage.tsx:47`) alors qu'i18next gère `_one` / `_other` et que le projet l'utilise déjà (`dashboard.shortageAlert`, `public.servings`).
- `home.cocktailCount` vaut « cocktails » sans pluriel : « 1 cocktails ».
- Clés jamais utilisées : les 18 `*.created/updated/deleted` (branchées par E-05 et E-06), plus `bottles.empty`, `bottles.filterByType`, `bottles.all`, `cocktails.step`, `cocktails.unit`, `common.success`, `cocktails.importWizard.invalidVersion`…
- Aucun garde-fou : `eslint.config.js` n'a aucune règle sur les textes littéraux.

## Ce qu'il faut faire

1. Refaire l'inventaire : `grep -rnE ">[^<{]*[A-Za-zÀ-ÿ]{3,}[^<{]*<|placeholder=\"[^\"]+\"|aria-label=\"[^\"]+\"|title=\"[^\"]+\"" src --include=*.tsx` hors tests. Noter le nombre dans le Journal.
2. Extraire chaque texte vers une clé, dans le namespace de la page (`units.conversionFactor`, `bottles.alcohol`…). Écrire les deux langues.
3. Pluriels avec `count` :
   ```json
   "home.bottleCount_one": "{{count}} bottle", "home.bottleCount_other": "{{count}} bottles",
   "cocktails.doses_one": "{{count}} dose",   "cocktails.doses_other": "{{count}} doses"
   ```
   En français, i18next classe 0 et 1 dans `_one` : « 0 bouteille ». Remplacer `home.cocktailCount` par `home.cocktailCount_one/_other`.
4. Unités (« ml », « € », « % vol. ») : passer par `Intl.NumberFormat(i18n.language, { style: 'unit', unit: 'milliliter' })` ou par une clé avec interpolation (`"units.ml": "{{value}} ml"`). Pour le prix, `Intl.NumberFormat(..., { style: 'currency', currency: 'EUR' })`.
5. Noms de langue « Français » / « English » : une seule constante `LANGUAGE_NAMES` (ce sont des endonymes, ils ne se traduisent pas), utilisée par `TranslationFields` (E-05) et `LanguageSelector`.
6. Supprimer les clés mortes qui ne sont plus utilisées après E-05 à E-08. Garder celles qu'une tâche ouverte prévoit d'utiliser.
7. Garde-fou : ajouter `eslint-plugin-i18next` et dans `eslint.config.js` :
   ```js
   { files: ['src/**/*.tsx'], ignores: ['src/**/*.test.tsx', 'src/test/**'],
     plugins: { i18next }, rules: { 'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }] } }
   ```
   Autoriser explicitement les symboles (`✕`, `▲`, `→`, emojis) via l'option `words.exclude`.
8. Test de parité des clés (voir plus bas).

## Critères d'acceptation

- [ ] `npm run lint` passe avec `i18next/no-literal-string` actif en `error`.
- [ ] En anglais, aucune chaîne française visible sur `/admin/*` (parcours manuel de chaque page, captures dans la PR si possible).
- [ ] « 1 bottle », « 2 bottles », « 1 bouteille », « 0 bouteille », « 1 cocktail » s'affichent correctement.
- [ ] `en.json` et `fr.json` ont exactement les mêmes clés (test).
- [ ] Chaque clé utilisée dans le code existe (test ou script).
- [ ] Nombre de textes en dur noté avant et après dans le Journal.

## Tests à ajouter ou adapter

- Nouveau `src/i18n/locales.test.ts` : même ensemble de clés aplaties dans `en` et `fr` ; chaque clé `_one` a sa `_other` ; aucune valeur vide. Le dossier `src/i18n/**` est exclu de la couverture mais le test s'exécute quand même.
- Test « clés utilisées » : parcourir `src/**/*.tsx` (hors tests) avec `import.meta.glob('../**/*.tsx', { query: '?raw' })`, extraire les `t('…')` littéraux et vérifier qu'ils existent dans `en.json`. Ignorer les clés construites dynamiquement (`nav.${key}`) en les listant.
- Les tests de page assertent des clés grâce au mock de `setup.ts` (`t = key => key`) : mettre à jour les assertions des textes déplacés vers des clés.

## Points d'attention

- Les messages d'erreur du backend suivent `Accept-Language`. Si A-10 n'a pas ajouté cet en-tête dans `api.ts`, un admin en anglais sur un navigateur français reçoit des erreurs en français. Hors périmètre ici, à vérifier.
- Le mock global de `react-i18next` (`setup.ts:17-24`) ignore les pluriels et l'interpolation. Le test de parité compense en partie ; une vraie instance i18next dans les tests est une option d'E-13.
- 19 clés ont la même valeur dans les deux langues (« Cocktails », « Description »…). C'est normal, ne rien faire.
- `src/pages/` et `src/components/` couvrent presque tout le front : cette tâche ne peut tourner en parallèle d'aucune autre tâche frontend.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
