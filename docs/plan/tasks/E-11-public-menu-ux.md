---
id: E-11
title: "Carte publique : états vide/erreur/chargement, retour sans rechargement, navigation par sections"
phase: E
lane: frontend
criticite: haute
effort: M
status: done
owner: agent
depends_on: [A-05, E-02, E-03]
touches: [frontend/src/pages/public/, frontend/src/components/layout/PublicLayout.tsx, frontend/src/components/layout/PublicLayout.test.tsx, frontend/src/utils/cocktailSearch.ts, frontend/src/i18n/locales/, frontend/src/queries/, frontend/src/test/, docs/plan/tasks/C-08-availability-rewrite.md, docs/plan/tasks/E-20-not-found-page.md, .github/workflows/ci.yml, docs/plan/tasks/D-14-bundle-budget-ci.md]
sources: ["06-frontend-ux-perf.md §2", "06-frontend-ux-perf.md §1"]
branch: feature/E-11-public-menu-ux
pr: "#68"
---

## Décisions validées (2026-10-08)

- **Lien « Connexion »** : retiré de l'en-tête et déplacé dans un pied de page discret, avec le nom du site. `/login` reste accessible.
- **Exporter / Imprimer** : conservés pour tous, en style secondaire sous la recette.
- **Disponibilité affichée** : un cocktail est grisé si l'interrupteur `isAvailable` est coupé **ou** si le stock ne permet aucune portion (champ `available` fourni par C-08).

## Contexte

La carte publique est le produit vu par les invités, sur téléphone, souvent avec un réseau de bar saturé. Aujourd'hui, revenir d'une fiche cocktail recharge toute la carte et remonte en haut de page, une recherche sans résultat laisse une page blanche, et une panne réseau s'affiche comme « aucun menu ». Sur une carte de 6 sections et 40 cocktails, rien n'aide à se déplacer.

## Problème constaté

- **Erreur affichée comme vide** : `HomePage.tsx:14-18` n'a qu'un `.finally`, un échec réseau donne « aucun menu disponible ». `MenuPublicPage.tsx:61` et `CocktailPublicPage.tsx:23` confondent 404 et erreur réseau (« menu introuvable »), sans bouton « Réessayer » ni lien vers l'accueil.
- **Chargement** : texte brut `t('common.loading')` (`HomePage.tsx:20-26`, `MenuPublicPage.tsx:87-89`, `CocktailPublicPage.tsx:37-39`). Aucun squelette dans l'application.
- **Recherche sans résultat** : `MenuPublicPage.tsx:303-360` ne rend rien quand le filtre vide toutes les sections.
- **Retour** : `CocktailPublicPage.tsx:54-59` est un `<button>` qui fait `navigate('/menu/' + slug)` : nouvelle entrée d'historique, rechargement complet du menu (`MenuPublicPage.tsx:59-62`), position de défilement perdue. Pas de clic droit ni d'ouverture dans un nouvel onglet.
- **Courses** : `MenuPublicPage.tsx:59` et `CocktailPublicPage.tsx:21` n'ignorent pas une réponse arrivée après un changement de `slug` ou d'`id`.
- **Ordre des bouteilles ignoré** (non relevé par la revue) : `groupMenuBottles` trie les groupes par nom (`MenuPublicPage.tsx:44`) alors que l'API renvoie les bouteilles triées par `position` (`backend/src/routes/public.ts:61`). L'ordre choisi par l'admin dans `MenuBottleEditPage` n'a aucun effet pour l'invité.
- **Recherche** : tout est recalculé à chaque frappe sans `useMemo` (`MenuPublicPage.tsx:94-229`) ; la recherche de bouteilles (`:95-104`) est sensible aux accents, contrairement à celle des cocktails (`utils/cocktailSearch.ts`) ; `getAvailability` fait un `find` par carte (`:112-114`).
- **Navigation** : aucune barre de sections, recherche non collante ; l'en-tête collant (`PublicLayout.tsx:14`) fait environ 65 px.
- **En-tête** : le lien « Connexion » (`PublicLayout.tsx:28-35`) est affiché en permanence aux invités. Pas de pied de page.
- **Cartes denses** : tous les ingrédients en pastilles (`PublicCocktailItem.tsx:93-103`), 8 à 10 pastilles sur certaines cartes.
- **Fiche cocktail** : `p-8` trop large sur 360 px (`CocktailPublicPage.tsx:75`) ; titres `h2` avec `text-lg` et `text-sm` à la fois (`:86, 96, 138`) ; boutons « Exporter » et « Imprimer » mis en avant (`:157-170`) alors que l'invité vient lire la recette.
- **Textes** : `HomePage.tsx:47` (`'bouteille(s)'`), `MenuPublicPage.tsx:130, 134` (« % vol. », « ml »).
- La fenêtre des emplacements (`MenuPublicPage.tsx:363-384`) est une modale maison sans Échap.

## Ce qu'il faut faire

### 0. Décisions (validées le 2026-10-08)

- Lien « Connexion » : retiré de l'en-tête, déplacé dans un pied de page discret.
- Boutons « Exporter » / « Imprimer » : style secondaire, sous la recette.
- Disponibilité : utiliser `available` (C-08) pour griser un cocktail. Si C-08 n'est pas encore mergée, garder `isAvailable` et le signaler dans la PR.

### 1. Données et cache

- Utiliser TanStack Query si E-02 est fusionnée (le `QueryClientProvider` est déjà dans le chunk d'entrée) : `usePublicMenu(slug)` (`['public', 'menu', slug]`, `staleTime: 5 min`), `usePublicCocktail(id)`, `usePublicMenus()`, dans `pages/public/queries.ts`. Sinon, un petit cache module `Map<string, Promise<Menu>>` dans le même fichier, avec la même API de hooks.
- Distinguer `ApiError` 404 (« menu introuvable » + lien accueil) des autres erreurs (« impossible de charger la carte » + « Réessayer »).

### 2. Retour sans rechargement

- `PublicCocktailItem` passe `state={{ fromMenu: true }}` à son `<Link>`.
- `CocktailPublicPage` : `<Link to={'/menu/' + slug}>` par défaut ; si `location.state?.fromMenu`, `onClick` fait `event.preventDefault(); navigate(-1)`.
- `pages/public/useScrollRestoration.ts` : enregistre `window.scrollY` dans `sessionStorage` sous `location.key` au départ, le restaure quand les données de la carte sont rendues.

### 3. États

- Composants `pages/public/MenuSkeleton.tsx` (4 cartes `aspect-video` + 2 lignes, avec `Skeleton` d'E-03) et `CocktailSkeleton.tsx`.
- Recherche vide : `EmptyState` « Aucun résultat pour « {{query}} » » et bouton « Effacer la recherche ». Région `aria-live="polite"` qui annonce le nombre de résultats.

### 4. Recherche et rendu

- Extraire `pages/public/useMenuFilter.ts` : index `Map<id, string>` normalisé et mémoïsé sur `[menu, i18n.language]`, `useDeferredValue(query)`, même normalisation pour bouteilles et cocktails (exporter `normalize` depuis `cocktailSearch.ts`). Disponibilités dans une `Map<cocktailId, CocktailAvailability>`.
- `PublicCocktailItem` en `React.memo`.
- `groupMenuBottles` garde l'ordre d'arrivée (position) au lieu de trier par nom ; l'ordre des groupes suit la première bouteille de chaque groupe. Réutiliser `bottleGroupKey` de `utils/bottleGrouping.ts` si E-05 l'a créé.
- Extraire `SectionBlock.tsx` et `BottleGroupRow.tsx` ; viser moins de 200 lignes pour `MenuPublicPage.tsx`.

### 5. Navigation par sections

- `pages/public/SectionNav.tsx`, affiché si la carte a au moins 2 sections (ou 2 catégories pour les bouteilles) : barre horizontale de puces, collante sous l'en-tête (`sticky top-[var(--header-h)]`), défilement horizontal, clic → `scrollIntoView` sur l'ancre `id="section-<id>"`, section active suivie par `IntersectionObserver` et marquée `aria-current="true"`.
- Barre de recherche collante avec la barre de sections sur mobile.

### 6. Détails

- Pastilles d'ingrédients limitées à 4, puis « +N ».
- Fiche : `p-5 sm:p-8`, titres `h2` cohérents, boutons d'action en `Button variant="secondary"`.
- Fenêtre des emplacements sur `Modal` (E-03).
- `PublicLayout` : appliquer la décision du point 0, ajouter un pied de page minimal (nom du site, lien de connexion si (b)).
- Textes listés plus haut en i18n avec pluriels (`home.bottleCount_one/_other`).

## Critères d'acceptation

- [x] Décisions du point 0 appliquées. *(Grisé sur `isAvailable` seul : C-08 n'est pas faite, décision humaine du 2026-10-11, signalé dans la PR et dans le Journal de C-08.)*
- [x] Carte → fiche → retour : aucune requête `GET /api/public/menus/:slug` (onglet Réseau) et position de défilement conservée à ±50 px. *(Tests unitaires, plus un contrôle dans Chrome headless via Playwright, API simulée par `page.route`, sans backend : 0 requête au retour, défilement 2576 px avant et après, y compris avec `history.scrollRestoration = 'manual'`.)*
- [x] Backend arrêté : l'accueil affiche une erreur et « Réessayer », jamais « aucun menu ». *(Tests, plus le même contrôle Playwright avec les requêtes coupées.)*
- [x] Slug inconnu : « menu introuvable » et lien vers l'accueil.
- [x] Recherche sans résultat : message et bouton d'effacement.
- [x] « apero » trouve « Apéro » dans une carte de bouteilles.
- [x] L'ordre des groupes de bouteilles correspond à celui défini dans l'admin. *(Bouteilles dans un bloc, et blocs de catégories d'une carte sans sections selon leur première bouteille : décision humaine du 2026-10-11.)*
- [x] Carte à 3 sections : la barre de sections apparaît, le clic fait défiler, la puce active suit le défilement. *(Tests avec un `IntersectionObserver` simulé, plus le contrôle Playwright.)*
- [x] Squelettes visibles pendant le chargement, plus de texte « Loading… » sur les pages publiques. *(Le texte reste en `sr-only` dans la zone `role="status"`, pour les lecteurs d'écran.)*
- [x] Couverture ≥ 80 % sur les lignes modifiées ; `HomePage` (0 test aujourd'hui) testée. *(Delta 100 %, 232/232 lignes.)*

## Tests à ajouter ou adapter

- Nouveau `HomePage.test.tsx` : liste, vide, erreur avec « Réessayer », pluriels.
- `MenuPublicPage.test.tsx` : 404 contre erreur réseau ; recherche vide ; recherche sans accent ; ordre des groupes de bouteilles respecté ; `SectionNav` rendue seulement à partir de 2 sections.
- `CocktailPublicPage.test.tsx` : le retour est un lien (`getByRole('link')`) ; avec `state.fromMenu`, le clic appelle `navigate(-1)`.
- `useMenuFilter.test.ts`, `useScrollRestoration.test.ts`, `SectionNav.test.tsx` (mock d'`IntersectionObserver`, absent de jsdom).
- `cocktailSearch.test.ts` : `normalize` exporté.

## Points d'attention

- A-05 modifie `MenuPublicPage.tsx`, `CocktailPublicPage.tsx` et `cocktailSearch.ts` (champs privés retirés, `notes` exclues de la recherche). Partir de sa version.
- E-02 n'est pas dans `depends_on`. Avec TanStack disponible, le cache est gratuit ; sinon le cache module suffit. Ajouter E-02 aux dépendances simplifierait la tâche.
- E-09 touche aussi `pages/public/` : pas en parallèle. Les correctifs d'accessibilité de `PublicCocktailItem` reviennent à celle des deux qui passe en second.
- E-12 ajoute `usePageTitle` dans les trois pages publiques : conflit de fusion mineur à prévoir.
- Une vraie page 404 à la place de la redirection vers `/` (`App.tsx:67`) n'est couverte par aucune tâche ; elle demande de toucher `App.tsx`.
- Les emplacements des bouteilles (`MenuPublicPage.tsx:139-155`) sont visibles des invités. Vérifier avec A-05 si c'est voulu.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
- 2026-10-11 : faite dans la PR #68 (`feature/E-11-public-menu-ux`). Hooks publics ajoutés dans `queries/public.ts`, sur le modèle d'E-02, plutôt que dans un `pages/public/queries.ts` séparé. Les clés passent par `qk` et incluent le lecteur (`admin` / `guest`), parce que le serveur ajoute des champs privés pour l'admin. Un invité garde la carte 5 min ; un admin la revalide toujours en arrière-plan (`staleTime: 0`), puisque les pages admin n'invalident pas les requêtes publiques. `useCocktailsAvailability` accepte `enabled`, ce qui ajoute `queries/` aux `touches`. Les aides de test partagées (jeux de données de carte, simulation d'`IntersectionObserver`, `t` qui affiche les valeurs) sont dans `src/test/`, ajouté aussi aux `touches`. Grisé sur `isAvailable` seul (C-08 non faite, ligne ajoutée à son Journal). Les emplacements des bouteilles restent publics et s'ouvrent dans la `Modal` d'E-03. Les blocs de catégories d'une carte de bouteilles sans sections restent triés par nom ; seul l'ordre des bouteilles dans un bloc suit l'admin (question posée dans la PR). Le bouton de retour est un vrai lien, et seul un clic simple venant de la carte fait `navigate(-1)` (un clic avec Ctrl/Cmd ouvre un nouvel onglet). `useScrollRestoration` sert aux trois pages publiques : nouvelle navigation en haut de page, retour à la position enregistrée. La barre de vue grille/liste reste hors de la zone collante, pour économiser de la hauteur sur mobile. Poids de `/menu/:slug` (JS gzip, entrée + vendors préchargés) : 126,47 → 132,98 kB (+6,5 kB). Environ 2,9 kB viennent de l'observateur de TanStack (`useQuery`), qui était dans un chunk admin. Ce chiffre est à reprendre pour le seuil de D-14. Couverture globale avant / après : statements 63,94 → 68,02 %, branches 55,48 → 59,15 %, functions 56,68 → 62,70 %, lines 65,75 → 69,67 %. Contrôle dans Chrome headless (Playwright, API simulée, 360×740) : 0 requête de carte au retour, défilement conservé au pixel près, barre de sections, 404, erreur réseau de l'accueil. Nouvelle tâche E-20 (vraie page 404).
- 2026-10-11 : Notes de version : aucune action requise. Côté invités : squelettes de chargement, erreurs avec « Réessayer », retour d'une fiche vers la carte sans rechargement et à la même position, barre de sections collante, recherche de bouteilles insensible aux accents. Le lien « Connexion » passe dans le pied de page.
- 2026-10-11 : décisions humaines sur les questions de la PR, et rebase sur `develop` (656d038 : #65 D-14, #66 C-16, #67 version affichée). (1) Les blocs de catégories d'une carte de bouteilles sans sections suivent maintenant la position de leur première bouteille, et non plus le nom (test dans `useMenuFilter.test.ts`). (2) `staleTime: 0` pour l'admin validé tel quel. (3) Seuil du budget relevé de 133 à **140 kB** dans `.github/workflows/ci.yml` (fichier et tâche D-14 ajoutés aux `touches`). Mesure avec `.github/scripts/bundle-budget.mjs` après `npm run build -- --sourcemap hidden` (gzip niveau 9) : entrée 31,80 kB + `vendor-react` 82,55 kB + `vendor-i18n` 18,40 kB = **132,74 kB**, contre 126,31 kB sur `develop` (entrée 25,35 → 31,80 kB). Calcul : 132,74 × 1,05 = 139,38, arrondi à 140 kB. Pourquoi : les pages publiques utilisent maintenant `useQuery` de TanStack (environ 2,9 kB, qui était dans un chunk admin), plus les squelettes, les états d'erreur, la navigation par sections et les primitives d'E-03 (`Modal`, `Button`, `EmptyState`, `Skeleton`). Couverture globale après rebase : statements 68,08 %, branches 59,23 %, functions 62,74 %, lines 69,74 % ; delta 100 %.
