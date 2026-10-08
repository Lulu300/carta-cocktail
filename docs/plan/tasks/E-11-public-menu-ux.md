---
id: E-11
title: "Carte publique : états vide/erreur/chargement, retour sans rechargement, navigation par sections"
phase: E
lane: frontend
criticite: haute
effort: M
status: todo
owner: agent
depends_on: [A-05, E-02, E-03]
touches: [frontend/src/pages/public/, frontend/src/components/layout/PublicLayout.tsx, frontend/src/utils/cocktailSearch.ts, frontend/src/i18n/locales/]
sources: ["06-frontend-ux-perf.md §2", "06-frontend-ux-perf.md §1"]
branch:
pr:
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

- [ ] Décisions du point 0 appliquées.
- [ ] Carte → fiche → retour : aucune requête `GET /api/public/menus/:slug` (onglet Réseau) et position de défilement conservée à ±50 px.
- [ ] Backend arrêté : l'accueil affiche une erreur et « Réessayer », jamais « aucun menu ».
- [ ] Slug inconnu : « menu introuvable » et lien vers l'accueil.
- [ ] Recherche sans résultat : message et bouton d'effacement.
- [ ] « apero » trouve « Apéro » dans une carte de bouteilles.
- [ ] L'ordre des groupes de bouteilles correspond à celui défini dans l'admin.
- [ ] Carte à 3 sections : la barre de sections apparaît, le clic fait défiler, la puce active suit le défilement.
- [ ] Squelettes visibles pendant le chargement, plus de texte « Loading… » sur les pages publiques.
- [ ] Couverture ≥ 80 % sur les lignes modifiées ; `HomePage` (0 test aujourd'hui) testée.

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
