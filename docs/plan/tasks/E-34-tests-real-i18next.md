---
id: E-34
title: "Tests frontend : vraie instance i18next avec les paquets public et admin"
phase: E
lane: frontend
criticite: basse
effort: M
status: done
owner: agent
depends_on: [E-13]
touches: [frontend/src/test/, frontend/src/**/*.test.tsx, frontend/src/**/*.test.ts, frontend/AGENTS.md]
sources: ["04-tests.md §5.1"]
branch: test/E-34-tests-real-i18next
pr:
---

## Contexte

Cette tâche reprend l'étape 8 d'E-13, laissée en option et sortie de la tâche par décision de l'humain (2026-10-13, relecture de la PR #140 : « Créer une tâche »). Les tests frontend ne voient jamais les textes affichés. Un mock global de `react-i18next` renvoie la clé : `t('units.title')` donne `units.title`. Un pluriel faux, une interpolation oubliée ou une clé absente des fichiers de traduction ne cassent donc aucun test. Depuis E-30, les messages sont scindés en deux paquets, `locales/public/` et `locales/admin/`. Une vraie instance de test doit charger les deux, comme l'application une fois la partie admin chargée (voir la ligne du Journal d'E-13 du 2026-10-13).

## Problème constaté

- `frontend/src/test/setup.ts:19-27` remplace `react-i18next` pour tous les tests :
  - `useTranslation` renvoie `t: (key) => key` et `i18n.language: 'en'`, avec un `changeLanguage` factice ;
  - `Trans` rend ses enfants ;
  - `initReactI18next` est un objet vide.
- 13 fichiers de test redéfinissent ce mock (`grep -rln "vi.mock('react-i18next'" frontend/src` en compte 14, `setup.ts` compris). 11 d'entre eux passent par `src/test/translateWithValues.ts`, qui écrit les valeurs à la suite de la clé (`menus.bottleCount(5)`) pour vérifier les comptes et les pluriels sans les vraies phrases ; un douzième fichier, `queries/deletionImpact.test.ts`, s'en sert sans redéfinir le mock.
- Certains de ces mocks n'exportent pas `initReactI18next`. Les fichiers qui chargent la vraie configuration i18n ne peuvent donc pas être importés par ces tests. Essai lors de la relecture de la PR #140 : `test-utils.tsx` important les contextes fait échouer au chargement `IconPicker`, `LanguageSelector`, `LiveResultCount` et `Pagination`. Pour cette raison, `src/test/feedback.tsx` (toasts) et `src/test/appProviders.tsx` (vrais providers) vivent à part de `src/test/test-utils.tsx`, au lieu d'être des options de `render`.
- La configuration réelle (`src/i18n/index.ts`) charge le paquet `public` et détecte la langue : `querystring`, `localStorage`, `sessionStorage`, puis `navigator`. `src/i18n/admin.ts` ajoute le paquet `admin` avec `addResourceBundle` (fusion profonde, car des espaces de noms comme `common` sont partagés entre les deux paquets).
- `src/i18n/bundles.test.ts` vérifie déjà la répartition des clés entre les deux paquets. Il ne vérifie pas qu'une clé appelée par un composant existe.

## Ce qu'il faut faire

1. Dans `setup.ts`, retirer le mock global de `react-i18next`. Charger la vraie instance avec `import '../i18n'` puis `import '../i18n/admin'`, et forcer l'anglais avant chaque test (`await i18n.changeLanguage('en')`). `setup.ts` vide `localStorage` après chaque test, mais le détecteur de langue peut y écrire.
2. Faire échouer un test qui affiche une clé absente des deux paquets, par exemple avec `saveMissing` et un `missingKeyHandler` qui collecte les clés, contrôlées en `afterEach` comme les requêtes sans handler d'E-13.
3. Remplacer les assertions sur les clés (`'units.title'`, `'menus.bottleCount(5)'`) par les textes anglais. Un pluriel se vérifie avec ses deux formes (`1 bottle` et `5 bottles`).
4. Supprimer `translateWithValues.ts` et les mocks locaux de `react-i18next`. N'en garder un que si un test en a besoin, avec un commentaire qui dit pourquoi. `LanguageSelector` peut changer de langue pour de bon et vérifier les textes français.
5. Réévaluer la séparation de `feedback.tsx` et `appProviders.tsx` : sans mock incomplet, une option de `render` dans `test-utils.tsx` (par exemple `{ appProviders: true }`) devient possible, comme l'avait demandé la relecture de la PR #140.
6. Mettre à jour les conventions de test de `frontend/AGENTS.md` (« i18n mock » dans la description de `setup.ts`).

## Critères d'acceptation

- [ ] `grep -rn "vi.mock('react-i18next'" frontend/src` : 0 résultat, ou seulement des cas commentés.
- [ ] `translateWithValues.ts` n'existe plus.
- [ ] Une clé absente des deux paquets, affichée par un composant, fait échouer le test qui l'affiche (essai local, non committé).
- [ ] Les tests lisent les textes anglais. Au moins un test par forme plurielle (`_one` / `_other`) des messages affichés par les pages testées.
- [ ] `npx vitest run --silent=false` : aucun avertissement `act(...)`, aucune ligne `[MSW]`, aucun avertissement i18next.
- [ ] Couverture globale sans baisse ; durée de `npm test` notée avant et après dans le Journal.

## Tests à ajouter ou adapter

- La quasi-totalité des `*.test.tsx` (assertions sur les textes).
- Un test du filet des clés manquantes dans `src/test/` (le seul endroit où une clé inventée est permise).
- `LanguageSelector.test.tsx` : changement réel de langue, textes français.

## Points d'attention

- La tâche touche presque tous les `*.test.tsx`. Elle entre en conflit avec toute tâche frontend qui ajoute ou modifie des tests. La lancer quand peu de PR frontend sont ouvertes.
- E-33 touche aussi `frontend/AGENTS.md` (et la configuration de Vitest). Ne pas lancer les deux en même temps.
- E-31 change des messages à pluriel du paquet `admin` : si elle passe avant, ses textes sont ceux à vérifier ; si elle passe après, elle met à jour les assertions de cette tâche.
- Les textes anglais peuvent changer sans que le comportement change. Viser des assertions par rôle et par nom accessible plutôt que des phrases longues, et ne pas reproduire un fichier de traduction entier dans les tests.

## Journal

- 2026-10-13 : tâche créée à partir de l'étape 8 d'E-13, sur décision de l'humain lors de la relecture de la PR #140 (« Créer une tâche »).
- 2026-11-26 : faite. `setup.ts` charge la vraie instance (paquets public et admin) et repasse en anglais après chaque test ; une clé absente des paquets fait échouer le test qui l'affiche (`src/test/missingKeys.ts`, test dans `missingKeys.test.ts`). Les assertions lisent les textes anglais ; `translateWithValues.ts` et les mocks de `react-i18next` sont supprimés, sauf `LanguageSelectorFallback.test.tsx` (valeurs de `i18n.language` que l'instance réelle ne produit jamais, commenté). Les tests en français changent la langue pour de bon. `bundles.test.ts` lit les fichiers de messages bruts (i18next fusionne le paquet admin dans les objets JSON importés) et `feedback.tsx` / `appProviders.tsx` restent à part : seules les pages qui en ont besoin les importent. Durée de `npm test` : 9,2 s avant, 9,4 s après (1560 tests, aucun retiré). Sonde : une clé retirée de `admin/en.json` fait échouer 21 tests de `UnitsPage`, une clé retirée de `admin/fr.json` fait échouer `bundles.test.ts`.
