---
id: D-14
title: "Budget de bundle en CI : pas d'admin ni de jszip dans le chargement public, plafond gzip"
phase: D
lane: ci
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: [E-01]
touches: [.github/workflows/ci.yml, .github/scripts/bundle-budget.mjs]
sources: ["06-frontend-ux-perf.md §0", "06-frontend-ux-perf.md §1"]
branch: chore/D-14-bundle-budget-ci
pr: "#65"
---

## Contexte

E-01 a fait passer le JS chargé par un invité sur `/menu/:slug` de 178,83 kB à 118,84 kB gzip. Les pages admin, la page de connexion et `jszip` sont chargés à la demande. Rien n'empêche aujourd'hui une régression : un import statique d'une page admin dans `App.tsx`, ou un `import JSZip from 'jszip'` dans un composant public, remettrait ce code dans le chunk d'entrée sans qu'aucun test échoue.

## Problème constaté

- La CI frontend (`.github/workflows/ci.yml`, job `frontend`) lance `npm run build` mais ne regarde ni la taille ni le contenu des chunks produits.
- Les tests de E-01 (`App.test.tsx`) vérifient le comportement de `lazy()` dans jsdom, pas le découpage réel fait par Rollup.
- Le contrôle de E-01 (Playwright contre `vite preview`) était un script jetable, non commité.

## Ce qu'il faut faire

1. Script `.github/scripts/bundle-budget.mjs`, sans dépendance (Node 20+, `node:zlib`) :
   - lire `frontend/dist/index.html` et relever le chunk d'entrée (`<script type="module" src>`) et les `<link rel="modulepreload">` : c'est tout le JS chargé avant la première navigation ;
   - lire le manifeste Vite (`frontend/dist/.vite/manifest.json`, produit par `vite build --manifest`) et parcourir les imports **statiques** (`imports`) depuis l'entrée `index.html`. Échouer si un module atteint vient de `src/pages/admin/`, `src/pages/auth/`, `src/components/layout/AdminLayout.tsx`, `src/components/import/` ou `node_modules/jszip/` ;
   - échouer aussi si le texte `JSZip` apparaît dans un de ces fichiers (filet de sécurité indépendant du manifeste) ;
   - calculer la taille gzip de chaque fichier (`zlib.gzipSync`, niveau 9, proche de la sortie de `vite build`), afficher un tableau et échouer au-dessus du seuil, passé en argument (`node bundle-budget.mjs frontend/dist 130`).
   - Ne pas chercher les noms de fichiers des pages admin dans le chunk d'entrée : il contient légitimement les chemins des `import()` dynamiques (`CocktailsPage-*.js`).
2. `ci.yml`, job `frontend` : produire le manifeste (`npx vite build --manifest` à la place de l'étape `Build`, ou option ajoutée au script `build`) puis appeler le script après le build.
3. Seuil : 120 kB gzip à la sortie de E-01. E-02 ajoute environ 12 kB (TanStack Query dans `main.tsx`) : fixer le seuil sur la mesure du moment avec une marge d'environ 5 %, et le noter dans le Journal. Comme pour la couverture (B-02, B-10), on ne le relève qu'avec une raison écrite dans la PR.

## Critères d'acceptation

- [x] La CI échoue si une page admin, `LoginPage`, un assistant d'import ou `jszip` se retrouve dans le chargement initial (vérifié en ajoutant temporairement un import statique de `DashboardPage` dans `App.tsx` sur une branche de test).
- [x] La CI échoue si l'entrée et les chunks préchargés dépassent le seuil gzip.
- [x] Le tableau des tailles apparaît dans les logs du job frontend.
- [x] Le script a des tests (`node --test`) sur un `dist/` factice : cas conforme, chunk admin statique, `JSZip` présent, seuil dépassé.

## Tests à ajouter ou adapter

- `.github/scripts/bundle-budget.test.mjs` (ou le dossier de tests prévu par B-02 pour `delta-coverage.mjs`) avec un `index.html`, un manifeste et des chunks factices.

## Points d'attention

- **Conflit de parallélisme** : B-02 (`.github/scripts/`, `.github/workflows/ci.yml`) et D-04 (`.github/workflows/ci.yml`) modifient les mêmes fichiers. Ne pas lancer D-14 en même temps que l'une d'elles : l'enchaîner après B-02, ou la regrouper avec D-04 si les deux sont prêtes ensemble. Reprendre la convention de tests des scripts que B-02 aura posée.
- B-06 (Vite 8, Rolldown) peut changer le format du manifeste ou de `manualChunks` : relancer le script sur le build de B-06.
- Le seuil porte sur le chargement de `/menu/:slug` (entrée + vendors préchargés), pas sur la somme de tous les chunks.

## Journal

- 2026-10-09 : tâche créée à la demande de la revue de la PR #43 (E-01).
- 2026-10-11 : fait (PR #65). Écart avec « Ce qu'il faut faire » : le manifeste Vite liste des chunks, pas des modules ; un import statique de `DashboardPage` dans `App.tsx` fusionne la page dans le chunk d'entrée sans laisser de trace dans le manifeste (vérifié). Le script lit donc les modules de chaque chunk dans ses source maps, produites en CI seulement par `npm run build -- --sourcemap hidden` (JS émis identique au build normal, md5 vérifié ; ni `frontend/package.json`, ni `vite.config.ts`, ni l'image Docker ne changent). Pas de manifeste. Filet `JSZip` textuel conservé. L'étape backend « Delta coverage script tests » devient « CI script tests » (même commande, lance aussi les nouveaux tests).
- 2026-10-11 : mesure sur `develop` (40a44c8), gzip niveau 9, 1 kB = 1000 octets : entrée 25,35 kB + `vendor-react` 82,54 kB + `vendor-i18n` 18,40 kB = 126,29 kB (Vite affiche 126,47 kB avec son niveau gzip par défaut). Seuil : 126,29 × 1,05 = 132,60, arrondi à **133 kB** (+5,3 %). CSS non compté. Vérifié localement : l'import statique de `DashboardPage` fait échouer le script (129,21 kB, sous le seuil : seul le contrôle des modules l'attrape), un `import JSZip` statique aussi (modules, texte et seuil).
- 2026-10-11 : Notes de version : aucun changement visible, CI seulement.
- 2026-10-11 : rebase sur `develop` après #67 (version affichée dans l'admin) : entrée 85,10 kB brut / 25,37 kB gzip (+0,02 kB), total **126,31 kB**. 126,31 × 1,05 = 132,63 : le seuil reste **133 kB**. Revue : test sans faux positif sur les noms des chunks dynamiques, code de sortie vérifié pour un argument manquant, commentaire sur l'hypothèse `build.modulePreload` (réglage par défaut de Vite).
- 2026-10-11 : seuil relevé de 133 à 140 kB par E-11 (PR #68) : les pages publiques chargent `useQuery` de TanStack (environ 2,9 kB, auparavant dans un chunk admin), les squelettes, les états d'erreur, la navigation par sections et les primitives d'E-03. Mesure : 132,74 kB (entrée 31,80 + `vendor-react` 82,55 + `vendor-i18n` 18,40) ; 132,74 × 1,05 = 139,38, arrondi à 140 kB.
