---
id: E-10
title: "i18n frontend : ~55 textes en dur, pluriels, garde-fou lint"
phase: E
lane: frontend
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: [E-05, E-06, E-07, E-08, E-30]
touches: [frontend/src/i18n/locales/, frontend/src/pages/, frontend/src/components/, frontend/src/utils/localization.ts, frontend/src/utils/formatPrice.ts, frontend/src/i18n/bundles.test.ts, frontend/AGENTS.md, frontend/eslint.config.js, frontend/package.json, frontend/package-lock.json]
sources: ["05-frontend-archi.md §7", "06-frontend-ux-perf.md §2"]
branch: feature/E-10-frontend-i18n-strings
pr: https://github.com/Lulu300/carta-cocktail/pull/134
---

## Décisions validées (2026-10-12)

- **Budget du chargement public** : la branche dépasse le budget de 90 octets (140,09 kB pour 140 kB). Le budget n'est pas relevé. E-30 scinde d'abord les locales en paquets public et admin et sera mergée avant E-10. E-10 est ensuite rebasée sur `develop`, ses clés réparties dans les fichiers scindés, puis le budget remesuré avant l'ouverture de la PR.
- **Pluriels écrits dans le texte** (« {{count}} bouteille(s) importée(s) », 14 clés admin) : hors E-10, confiés à E-31.

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

- [x] `npm run lint` passe avec `i18next/no-literal-string` actif en `error`.
- [ ] En anglais, aucune chaîne française visible sur `/admin/*` (parcours manuel de chaque page, captures dans la PR si possible).
- [x] « 1 bottle », « 2 bottles », « 1 bouteille », « 0 bouteille », « 1 cocktail » s'affichent correctement.
- [x] `en.json` et `fr.json` ont exactement les mêmes clés (test).
- [x] Chaque clé utilisée dans le code existe (test ou script).
- [x] Nombre de textes en dur noté avant et après dans le Journal.

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
- 2026-10-12 : revue de la PR #107 (E-07) : `i18n/index.ts` importe `en.json` et `fr.json` en entier, donc toutes les chaînes admin des deux langues partent dans le premier chargement de la carte publique (~37 kB de JSON brut ; les clés `menus.*` d'E-07 ont pris +1 kB gzip). Marge du budget de 140 kB après E-07 et Vite 8 : 2,7 kB. Scinder les locales en paquets public et admin (`i18n.addResourceBundle` depuis le chunk admin) ou ne charger que la langue active : à traiter ici ou dans une nouvelle tâche E si le périmètre devient trop gros.
- 2026-10-12 : relecture d'E-09 (PR #128) : emplacements actuels de textes en dur relevés par la relecture (une partie de ceux du tableau pour `BottlesPage.tsx` a changé de fichier depuis E-05) : `BottlesPage.tsx:91` (« Alcool »), `components/admin/bottles/BottleFormModal.tsx:102` (« Alcool % (vol.) ») et `:121` (« Utilisation »), `IngredientsPage.tsx:254` (« Icône (optionnel) »), `components/ui/UnitConverter.tsx:76` (« Unité originale »). Recompter avant de commencer.
- 2026-10-12 : inventaire refait (`grep` de l'étape 1, hors tests). Avant : 20 lignes, dont 16 textes réels (4 faux positifs : `Promise<void>`, `assignRef<T>`) ; la règle `i18next/no-literal-string` en `jsx-text-only` relevait 19 erreurs. S'y ajoutaient les textes en dur hors JSX : en-têtes de colonnes, `label`, `hint`, libellés de type de carte, « bouteille(s) », « dose/doses », « Français »/« English ». Après : 8 lignes, les 4 faux positifs et 4 `placeholder` sans langue (`0.00`, `40`, `GARNISH, MIXER...`, `admin@carta.local`) ; 0 erreur de lint. Ajouts hors `touches` : `utils/localization.ts` (`LANGUAGE_NAMES`), `utils/formatPrice.ts` (prix via `Intl.NumberFormat`), `i18n/locales.test.ts`. `home.*Count` deviennent `menus.*Count` (partagés par l'accueil et la liste admin) ; `public.capacityMl`, `public.alcoholPercentage` et `menus.bottles.abv` deviennent `units.ml` et `units.abv`. 18 clés mortes supprimées, dont `cocktails.importWizard.invalidVersion` et `summary` notées au Journal d'E-14. Budget du chargement public : 140,09 kB pour 140 kB (139,94 kB avant) ; les deux locales partent dans le chunk `api`. Question posée à l'humain avant de pousser.
- 2026-10-12 : décision de l'humain (voir « Décisions validées ») : budget dépassé de 90 octets, E-30 (scission des locales public/admin) passe d'abord, E-10 attend son merge pour se rebaser. Les 14 messages au pluriel écrit dans le texte (17 lignes de `grep` en comptant `dashboard.shortageAlert`, corrigé ici) partent dans la nouvelle tâche E-31.
- 2026-10-13 : faite dans la PR #134. Rebase sur `develop` après E-30 (#133). Clés réparties selon `bundles.test.ts` : `units.ml`, `units.abv`, `menus.cocktailCount`, `menus.bottleCount`, `public.originalUnit` et `public.convertTo` dans le paquet public (pages publiques et `UnitConverter`), les autres dans le paquet admin. Le `locales.test.ts` d'E-10 faisait doublon avec `bundles.test.ts` (aplatissement, parité en/fr, lecture des sources) : ses contrôles restants y sont ajoutés (chaque `_one` a son `_other`, aucun message vide, chaque `t('…')` littéral existe dans un paquet, clés construites à l'exécution limitées à une liste de modèles, pluriels réels avec i18next) et le fichier est supprimé. `frontend/AGENTS.md` (ajouté à `touches`) cite `LANGUAGE_NAMES` pour l'ajout d'une langue et la règle de lint. Inventaire après rebase : 9 lignes, les 4 `placeholder` sans langue et 5 faux positifs (dont `lazyWithAdminMessages` d'E-30). Budget du premier chargement : 131,83 kB gzip pour 140 kB (131,80 kB sur `develop` après E-30). Le parcours manuel de `/admin/*` en anglais (critère non coché) reste à faire à la relecture : seuls la règle de lint et le `grep` des accents le couvrent.
