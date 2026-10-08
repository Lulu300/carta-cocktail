# Revue 6 - UI/UX, accessibilité, performance front (Carta Cocktail)

Périmètre : frontend/ (lecture seule). Build mesuré vers le scratchpad. Chemins relatifs à `frontend/` sauf mention contraire.

## 0. Chiffres du bundle (vite build, mesuré)

| Fichier | Brut | Gzip |
|---|---|---|
| assets/index-*.js (UNIQUE chunk) | 605,13 kB | 167,7 kB |
| assets/index-*.css | 46,4 kB | 8,3 kB |
| index.html | 0,46 kB | 0,3 kB |

- 128 modules, 1 seul chunk JS. Vite avertit "chunks larger than 500 kB". Aucun `React.lazy` / `import()` dans tout `src/` (grep).
- Un invité qui scanne le QR code de la carte télécharge ~168 kB gzip de JS qui contient : les 12 pages admin, les wizards d'import, `jszip` (~95 kB min / ~30 kB gzip, importé statiquement dans `src/components/import/ImportStepUpload.tsx:3` et `src/services/exportZip.ts:1`), et toute l'admin.
- Estimation : le public pur (react + react-dom + router + i18next + 3 pages) pèserait ~110-120 kB gzip ; les routes publiques seules après split ~ -35 à -45 % de JS.
- Aucune police/image locale : pas de dossier `public/` (donc `/vite.svg` référencé par `index.html:5` et `SiteSettingsContext.tsx:46` n'est pas servi par le build : seul le template Vite le fournit par défaut dans `public/`, ici absent => 404 qui retombe sur `index.html` via `try_files`).

## 1. Performance

### Ce qui NE VA PAS

1. **Aucun code splitting** (`src/App.tsx:1-19`) - Priorité P0, effort S.
   Les 17 pages sont importées statiquement. Proposition : `const AdminLayout = lazy(() => import(...))`, idem pour chaque page admin et `LoginPage`, enveloppées dans un `<Suspense fallback={<Skeleton/>}>`. Mieux : un sous-arbre `routes/admin.tsx` chargé en un seul lazy (`path="/admin/*"`). Garder `PublicLayout`, `HomePage`, `MenuPublicPage`, `CocktailPublicPage` dans le chunk d'entrée. `jszip` devient automatiquement admin-only (seul `ExportCocktailButton`, utilisé aussi côté public, doit rester léger : vérifier qu'il n'importe pas `exportZip.ts` ; sinon `await import('jszip')` au clic).
   Ajouter aussi `build.rollupOptions.output.manualChunks` : `vendor-react`, `vendor-i18n` (cache long terme séparé du code applicatif).

2. **Import dynamique de JSZip absent** (`src/components/import/ImportStepUpload.tsx:3`, `src/services/exportZip.ts:1`) - P0, effort S. `const { default: JSZip } = await import('jszip')` au moment de l'action.

3. **Polices Google via `@import url()` en tête de CSS** (`src/index.css:1`) - P1, effort S/M.
   - `@import` CSS = requête bloquante en chaîne : HTML -> CSS -> googleapis CSS -> woff2. FOIT/FOUT sur mobile 4G.
   - 5 graisses Inter + 3 Playfair chargées alors que 300/700 sont à peine utilisées. Fuite de l'IP invité vers Google (RGPD, cas typique d'une app française hébergée sur un NAS).
   - Proposition : auto-héberger via `@fontsource-variable/inter` + `@fontsource-variable/playfair-display` (ou fichiers woff2 dans `public/fonts` + `<link rel="preload" as="font">` + `font-display: swap`), sous-ensemble latin. Gain : une requête de moins, fonctionne hors-ligne (LAN du bar sans Internet !).
   - Remarque design : Inter est le choix par défaut "générique" ; le serif Playfair donne déjà du caractère, voir section Design.

4. **Images non optimisées** (`src/pages/public/PublicCocktailItem.tsx:44-48`, `CocktailPublicPage.tsx:67-71`) - P0, effort M.
   - Pas de `loading="lazy"`, pas de `decoding="async"`, pas de `width/height` (CLS : le conteneur est en `aspect-video`, donc pas de saut de mise en page, bon point), pas de `srcset`.
   - Le backend sert l'image d'origine telle qu'uploadée via `express.static` (`backend/src/app.ts:35`), sans resize ni WebP/AVIF, sans `Cache-Control` explicite. Une photo de téléphone de 3-6 Mo affichée dans une vignette 400 px : sur une carte de 30 cocktails, c'est potentiellement 100+ Mo.
   - Proposition : (a) `loading="lazy" decoding="async"` immédiat (S) ; (b) au upload, générer avec `sharp` des variantes 480/960 px en WebP et servir `srcset`/`sizes` (M, côté backend) ; (c) `fetchPriority="high"` sur l'image héros de `CocktailPublicPage`.

5. **Cache nginx : Cache-Control `immutable` appliqué aussi à `/uploads/`** (`nginx.conf.template:19-23`, `nginx.conf:32-36`) - P1, effort S.
   - La regex `\.(js|css|png|jpg|...)$` est dans un `location ~*` ; or `location ^~ /uploads/` a priorité (préfixe `^~` gagne sur regex), donc les uploads sont proxifiés SANS cache : chaque visite retélécharge toutes les images (pas d'ETag/Cache-Control côté Express static à part ETag/Last-Modified par défaut, ce qui donne au mieux du 304).
   - À l'inverse, la regex `png|jpg|...|ico` + `immutable 1y` s'applique à `/favicon.ico`, `/vite.svg` non hashés : un changement futur ne sera jamais vu. Seul `/assets/*` (hashé) devrait être `immutable`.
   - `index.html` n'a pas de `Cache-Control: no-cache` : après déploiement, un client peut garder un `index.html` périmé qui référence des chunks supprimés (problème aggravé le jour où le lazy loading sera ajouté, erreur "Failed to fetch dynamically imported module").
   - Proposition :
     ```nginx
     location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; try_files $uri =404; }
     location = /index.html { add_header Cache-Control "no-cache"; }
     location ^~ /uploads/ { proxy_pass ...; proxy_cache ou expires 30d; add_header Cache-Control "public, max-age=2592000"; }
     ```
     Pour les uploads, idéalement nommer les fichiers avec hash (ou `?v=updatedAt`) pour pouvoir passer en `immutable`.

6. **Pas de compression** (`nginx.conf*` : aucune directive `gzip`) - P0, effort S.
   Aucun `gzip on;` : l'image `nginx:alpine` n'active pas gzip par défaut. Les 605 kB de JS partent non compressés (-72 % possible). Proposition : `gzip on; gzip_vary on; gzip_min_length 1024; gzip_types text/css application/javascript application/json image/svg+xml;` ; brotli via module ou précompression au build (`vite-plugin-compression`) + `gzip_static on`/`brotli_static on`.
   Aussi absents : headers de sécurité (CSP, X-Content-Type-Options, Referrer-Policy) côté nginx.

7. **Pas de cache de données / dédoublonnage des appels** - P2, effort M.
   Chaque navigation liste -> détail -> retour refait `publicApi.getMenu` (`MenuPublicPage.tsx:59-62`) : le menu complet (cocktails + ingrédients imbriqués) est rechargé et la page repasse par l'écran "Loading..." ; la position de scroll est perdue au retour (`CocktailPublicPage.tsx:55` utilise `navigate(...)` au lieu de `navigate(-1)`). Sur mobile c'est le défaut d'UX n°1 de la carte publique. `SiteSettingsContext.tsx:29-33` appelle `getSettings` et le `refresh` fait un second code path identique. Proposition : TanStack Query/SWR (ou petit cache module-level `Map<slug, Promise>`), `navigate(-1)` quand l'historique provient de la carte, `<ScrollRestoration/>` (data router) ou sauvegarde manuelle du scrollY.
   Pas d'annulation de requête / race condition : `useEffect` sans `AbortController` ni flag `cancelled` (`MenuPublicPage.tsx:59`, `CocktailPublicPage.tsx:21`) : en changeant vite de slug, la réponse de l'ancien peut écraser la nouvelle.

8. **Recherche / filtrage côté client recalculés à chaque rendu** (`MenuPublicPage.tsx:94-229`) - P2, effort S.
   - Tout le filtrage, groupement (`groupMenuBottles`), `normalize()` (NFD + regex) de chaque cocktail se refait à chaque frappe, sans `useMemo`, ni debounce/`useDeferredValue`. `matchesCocktailSearch` (`utils/cocktailSearch.ts:34-52`) reconstruit et normalise la chaîne de recherche complète (nom, description, instructions, ingrédients...) de chaque cocktail à chaque touche. Pour 50-100 cocktails c'est OK, mais sur un vieux téléphone la frappe peut saccader.
   - Proposition : pré-calculer un index `Map<cocktailId, string>` via `useMemo([menu, i18n.language])`, appliquer `useDeferredValue(searchQuery)`. Le filtre des bouteilles (`MenuPublicPage.tsx:102`) n'est pas insensible aux accents, contrairement à celui des cocktails : incohérent ("apéro" vs "apero"). Réutiliser `normalize`.
   - `getAvailability` fait un `find` par carte (`MenuPublicPage.tsx:112-114`) : O(n*m) ; passer par une `Map` (admin seulement, donc P3).
   - Les composants de liste (`PublicCocktailItem`) ne sont pas `memo`isés ; le re-render à chaque frappe de tous les items est évitable (`React.memo`, `key` stable déjà OK).
   - Les fonctions `renderGroupedBottles` / `renderCocktails` sont des closures de rendu dans le composant (pas des composants), ce qui évite le remount, correct, mais le composant fait 387 lignes avec trois logiques (data, filtre, rendu) : extraire en hooks `useMenuFilter` + composants `BottleGroupRow`, `SectionBlock`.

9. **Toutes les listes admin chargent tout et paginent côté client** (`hooks/usePagination.ts`) - P3 : acceptable pour un seul admin/bar. À surveiller seulement.

10. **Fuite CSS d'impression** : le build émet un warning (`index.css`, bloc `@media print`) : sélecteur `.print\\:hidden` mal échappé (double backslash) => la règle `print:hidden` custom est invalide, et le `display:none` pour `header, nav` s'applique quand même (ok), mais la règle `.print\\:hidden` est ignorée. Déjà couvert par la variante Tailwind `print:hidden`, donc supprimer la règle custom. P3, effort S.

### Ce qui VA BIEN

- Dépendances runtime minimales : seulement 7 (react, react-dom, router, i18next x3, jszip). Pas de lib UI/icônes/animation. Excellent pour la taille.
- Tailwind v4 : CSS final 8,3 kB gzip, très bien (purge automatique).
- Les locales (25 kB brut les deux) sont embarquées statiquement ; acceptable vu la taille, mais seul le fr/en actif pourrait être chargé (gain ~6 kB, P3).
- `useMemo` utilisé correctement sur les listes admin lourdes (CategoriesPage, BottlesPage...). `useLocalizedName` mémoïsé avec `useCallback`.
- `useClickOutside` écoute aussi `touchstart` (bon pour le tactile) et nettoie ses listeners.
- Vite 7 + React 19 + Tailwind 4 : toolchain moderne, build en 0,7 s.

## 2. Design visuel / cohérence

### Ce qui VA BIEN

- Direction artistique cohérente et reconnaissable : fond bleu nuit (`#0f0f1a`/`#1a1a2e`), accent ambre, titres en serif Playfair. Ambiance "bar/speakeasy" adaptée à l'usage, sans le piège du dégradé violet générique. Bon contraste titre ambre sur fond sombre (~11:1).
- Hiérarchie du menu public claire : h1 serif ambre, sections h2 serif, cartes avec image 16:9, hover bordure ambre. Toggle grille/liste (`MenuPublicPage.tsx:272-298`) avec `aria-pressed` : bonne idée.
- Vue liste vs grille bien pensée (`PublicCocktailItem.tsx`), états "indisponible" (opacité + grayscale + curseur), `line-clamp`.
- Styles d'impression dédiés pour la fiche recette format bristol (`index.css`, `CocktailPublicPage.tsx` avec variantes `print:`) : détail soigné et rare.
- Drapeaux en SVG inline (pas d'emoji drapeau cassé sous Windows).
- Page 404/erreur menu avec emoji cocktail : sympathique.

### Ce qui NE VA PAS

1. **Absence de design system : classes Tailwind dupliquées partout** - P1, effort M.
   Comptage (hors tests) : `bg-[#1a1a2e]` x68, `bg-[#0f0f1a]` x108, `bg-amber-400 hover:bg-amber-500` x31, `focus:outline-none` x79, 12 overlays modaux `fixed inset-0 z-50 ...` copiés-collés (CategoriesPage:218/283, IngredientsPage:212, MenuEditPage:350/372, UnitsPage:124, MenuBottleEditPage:405, BottlesPage:420, MenusPage:138, ImportCocktailWizard:190, ImportBottlesWizard:167, MenuPublicPage:364), 91 `<input|select|textarea>` avec la même longue chaîne de classes.
   Les hex sont en dur : impossible de changer le thème sans 176+ remplacements.
   Proposition :
   - `@theme` dans `src/index.css` : `--color-surface: #1a1a2e; --color-bg: #0f0f1a; --color-accent: #fbbf24;` -> classes `bg-surface`, `bg-bg`, `text-accent`.
   - Composants dans `components/ui/` : `Button` (variants primary/secondary/ghost/danger, tailles), `Input`/`Select`/`Textarea` + `Field` (label+erreur+hint, génère `id`/`htmlFor`), `Card`, `Modal` (portal, focus trap, Esc), `Badge`, `EmptyState`, `Skeleton`, `ConfirmDialog`, `Spinner`.
   - Migration incrémentale : commencer par `Modal` et `Button` (gain le plus fort), puis `Field`.

2. **Chaque `<label>` n'est pas lié à son champ** : 64 `<label>` / 0 `htmlFor` (grep), voir accessibilité.

3. **Typographie** : Inter est la police de corps par défaut ; pour un site de carte de bar, une sans humaniste moins banale (ex. "Outfit", "DM Sans", "Jost") ou un second serif léger pour le texte descriptif renforcerait l'identité. Choix de goût, P3.

4. **Page d'accueil sobre** (`HomePage.tsx:28-76`) : simple liste de cartes texte. Pas d'image/emoji par menu, libellé codé en dur `'bouteille(s)'` non traduit (`HomePage.tsx:47`, aussi `MenusPage.tsx:108`). Propositions : vignette (mosaïque des 3 premières photos du menu), icône par type de menu (🍸 / 🥃 / 🍷), compteur pluralisé via i18n (`t('home.bottleCount', { count })`).

5. **Fiche cocktail** (`CocktailPublicPage.tsx`) : titres `<h2>` avec `text-lg ... text-sm` simultanés (classes contradictoires, `text-sm` gagne) ; bouton retour `←` texte seul (`:54-59`), pas de `<Link>` (donc ni clic droit/ouverture nouvel onglet, ni préchargement) ; CTA "Exporter"/"Imprimer" mis en avant pour des invités alors que ce n'est pas leur besoin principal - pour une carte consultée par des invités, privilégier : tags, ingrédients, instructions lisibles, éventuellement "cocktail précédent/suivant". Le `p-8` est trop généreux sur 360 px (la carte `max-w-2xl px-4` + `p-8` => 296 px de contenu utile) : `p-5 sm:p-8`.

6. **Navigation sur la carte publique** : pas de barre de sections collante / ancres. Sur un menu à 6 sections et 40 cocktails, ajouter une barre horizontale de chips sections (scroll-spy) sticky sous le header serait le plus gros gain d'UX mobile (P1, M). La recherche n'est pas sticky non plus. Le header sticky (`PublicLayout.tsx:14`) prend déjà ~65 px.

7. **Dark mode** : l'app est dark-only (fixe, `bg-[#0f0f1a]` partout), pas de `prefers-color-scheme`, pas de `<meta name="color-scheme">` ni `theme-color`. Cohérent pour un bar le soir, mais en plein jour à la terrasse la lisibilité (gris 400 sur 1a1a2e) est moindre. Si un mode clair est voulu, il faut d'abord centraliser les couleurs (voir point 1). Au minimum ajouter `<meta name="color-scheme" content="dark">` et `theme-color` pour la barre d'URL mobile (P2, S) : sans cela les scrollbars et les contrôles natifs (select, checkbox, date) restent clairs sur fond sombre.

8. **États de chargement/erreur/vide pauvres** - P1, effort S/M.
   - Chargement = texte brut "Loading..."/`t('common.loading')` centré (`HomePage.tsx:20-26`, `MenuPublicPage.tsx:87-89`, `CocktailPublicPage.tsx:37-39`). `App.tsx:24` : "Loading..." en dur non traduit. Aucun `animate-pulse`/skeleton/spinner dans toute l'app (grep). Proposition : skeleton de cartes (aspect-video + 2 lignes) pour la carte publique : perception de vitesse bien meilleure.
   - Erreur : `HomePage` n'a PAS de `catch` (`:14-18` : `.finally` seul) => échec réseau = liste vide, affiche "aucun menu" (mensonge) ; `MenuPublicPage` confond 404 et erreur réseau ("menu introuvable") sans bouton "Réessayer".
   - Vide : recherche sans résultat dans la carte publique n'affiche rien du tout (`MenuPublicPage.tsx:303-360` : aucun message "aucun résultat pour ..."), page blanche sous la barre de recherche. P1, S.
   - Pas de bouton retour accueil sur la page d'erreur.

9. **Feedback utilisateur : aucun toast** (grep toast = 0) ; **11 `confirm()`/`alert()` natifs** pour les suppressions (CategoriesPage:99,144,149, SettingsPage:110, IngredientsPage:80, MenuEditPage:105, CocktailsPage:79, UnitsPage:68, MenuBottleEditPage:185, BottlesPage:181, MenusPage:40) - P1, effort M. Proposition : `ConfirmDialog` stylé (accessible, bouton danger rouge, texte avec nom de l'élément) + `ToastProvider` (succès/erreur API, "Annuler" pour les suppressions). Deux de ces confirmations sont en français en dur (`MenuEditPage.tsx:105`, `MenuBottleEditPage.tsx:185`).

10. **Textes en dur non i18n** (violation de la règle "UI traduite") : `IconPicker.tsx:55,84,101,108` (fr), `LanguageSelector.tsx:69` (`aria-label="Change language"`), `App.tsx:24`, `HomePage.tsx:47`, `MenusPage.tsx:108`, `MenuBottleEditPage.tsx:185,308,353,360`. Les placeholders emoji "OK" non traduits.

11. **Nombre de couleurs de gris** : `text-gray-500` x70 (contraste ~3,6:1 sur `#1a1a2e` - échec WCAG AA pour texte normal ; placeholders et "0 cocktail(s)" de `HomePage.tsx:63`, `text-xs`), `text-gray-600` x8 sur fond sombre (~2,4:1, échec net, ex. `Pagination.tsx:59`). Remonter à `text-gray-400` minimum pour le texte porteur d'information.

## 3. Accessibilité

### Ce qui VA BIEN

- Boutons de bascule avec `aria-pressed`, bouton d'effacement de la recherche avec `aria-label` (`MenuPublicPage.tsx:264`).
- Utilisation de vrais `<button>`/`<a>`/`Link` (pas de div cliquables), listes `<ul>/<ol>` sémantiques sur la fiche recette, `h1` unique par page.
- `MultiSelectDropdown` utilise de vraies cases `<input type=checkbox>` dans des `<label>` : accessibles au clavier par défaut, avec filtre en `autoFocus`.
- Tests présents pour les composants UI.

### Ce qui NE VA PAS

1. **`<html lang="en">` fixe** (`index.html:2`) et jamais mis à jour : aucun `document.documentElement.lang` (grep : 0 occurrence). Pour un public francophone, les lecteurs d'écran prononcent en anglais, la césure/`hyphens` et la correction orthographique du navigateur sont erronées. Fix (P1, S) : dans `src/i18n/index.ts`, `i18n.on('languageChanged', l => document.documentElement.lang = l.split('-')[0])` + appel initial.
   Bug connexe : la détection (`i18next-browser-languagedetector`) renvoie souvent `fr-FR` / `en-US`. `LanguageSelector.tsx:41` compare `lang.code === i18n.language` => pour `en-US` le sélecteur affiche FR (fallback `languages[0]`) alors que l'UI est en anglais ; et `getLocalizedName` (`utils/localization.ts:9`) cherche `t['fr-FR']` => retombe sur `en` : un invité au navigateur en `fr-FR` verra les noms de catégories/ingrédients en anglais alors que les chaînes UI sont bien en français. Fix : `supportedLngs: ['fr','en'], nonExplicitSupportedLngs: true, load: 'languageOnly'` (ou `i18n.resolvedLanguage`) (P0 fonctionnel, S).

2. **Labels non associés** : 64 `<label>` / 0 `htmlFor` / 91 champs (grep). Les labels sont des sœurs `<label className="block ...">` non liées (ex. `pages/auth/LoginPage.tsx:51,63`). Cliquer le label ne focalise pas le champ ; lecteur d'écran : champ sans nom. Fix via composant `Field` (`useId`) - P1, M. Champs de recherche (`MenuPublicPage.tsx:240`, `SearchInput.tsx:22`) sans `aria-label` : le placeholder seul ne suffit pas. Ajouter `type="search"` + `inputMode`/`enterKeyHint="search"`.

3. **Focus invisible** : `focus:outline-none` x79, `focus-visible` x0, `ring-` seulement x10. Les champs compensent par `focus:border-amber-400` (acceptable mais faible : bordure 1 px, contraste de focus insuffisant WCAG 2.4.7/1.4.11) ; mais les boutons, liens, cartes (`PublicCocktailItem`), onglets et pagination n'ont AUCUN indicateur de focus personnalisé (outline natif conservé là où pas supprimé : ok) - alors que les boutons du dropdown de langue et du `MultiSelectDropdown` (`:39`) n'ont pas de style de focus alternatif => invisible. Proposition : règle globale `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }` dans `index.css` et retirer les `focus:outline-none` isolés (P1, S).

4. **Modales sans sémantique ni gestion du focus** (12 occurrences listées plus haut) : pas de `role="dialog"`, `aria-modal`, `aria-labelledby`, pas de focus trap, pas de fermeture par `Escape` (grep `Escape` : 0 résultat), focus non restitué, scroll de fond non verrouillé. Exemple public : `MenuPublicPage.tsx:363-384` (overlay cliquable seulement ; bouton de fermeture sans `aria-label`). Fix : composant `Modal` basé sur `<dialog>` natif (`showModal()` donne focus trap, Esc, `aria-modal`, backdrop gratuits) - P1, M.

5. **Dropdowns sans pattern ARIA ni clavier** :
   - `MultiSelectDropdown.tsx:36-50` : bouton sans `aria-expanded` / `aria-haspopup` / `aria-controls`, pas de fermeture `Escape` ni de retour du focus au bouton, boutons "retirer tag" sans `aria-label` (`:60`, icône seule).
   - `LanguageSelector.tsx:66-101` : `aria-label` présent mais en anglais en dur, pas de `aria-expanded`, pas de `role="menu"/menuitemradio` ou `aria-current`, pas d'Escape, pas de navigation flèches.
   - `LocationAutocomplete.tsx` / `CategoryFilterInput.tsx` : combobox sans `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, navigation flèches haut/bas/Enter absente (seulement souris) ; bouton clear sans `aria-label`.
   - `IconPicker.tsx:60-74` : grille de 50 emojis sans `aria-label` (seulement `title`), `aria-pressed` manquant sur l'emoji sélectionné, texte d'aide en français en dur ; pas de flèches. Le `title` n'est pas un nom accessible fiable pour un emoji. Fix : `aria-label` traduit + `aria-pressed`.
   Proposition : `Listbox`/`Combobox` maison de ~60 lignes ou `@headlessui/react` (~25 kB) / `@radix-ui` (chargés uniquement dans le chunk admin après lazy).

6. **Images** : `alt={cocktail.name}` (`PublicCocktailItem.tsx:46`, `CocktailPublicPage.tsx:69`) - le nom du cocktail est répété juste à côté dans `<h2>` => lecteur d'écran lit deux fois ; pour une image décorative adjacente au titre, `alt=""` est préférable dans la carte (le lien est déjà nommé par le h2). Les emojis de remplacement (🍸) sans `role="img"` / `aria-hidden`.

7. **Carte cliquable "indisponible"** (`PublicCocktailItem.tsx:29-38`) : `onClick` + `preventDefault` mais le lien reste focusable et annoncé comme lien ; ajouter `aria-disabled="true"`, `tabIndex={-1}` et un texte visuellement caché "indisponible". Aussi `opacity-50 grayscale` sur toute la carte réduit le contraste du texte sous 3:1 : le badge "indisponible" lui-même (rouge 400 sur fond à 50 %) est quasi illisible.

8. **Pas de `aria-live`** pour les résultats de recherche ("12 résultats") ni pour les erreurs/chargements.

9. **Lien d'évitement et landmarks** : pas de "skip to content", `<main>` OK dans `PublicLayout.tsx:38` mais `<nav>` absent côté public. `AdminLayout.tsx:94` : bouton hamburger sans `aria-label`/`aria-expanded` ; sidebar mobile (`:42-45`) fermée est hors écran via `-translate-x-full` mais reste focusable (utiliser `inert` ou `invisible`) ; overlay `div` cliquable sans Escape. Emojis des items de nav (📊 🏷️...) non marqués `aria-hidden`.

10. **Pagination** (`Pagination.tsx:42-88`) : boutons `««`, `«`, `»`, `»»` sans `aria-label` (lus "guillemet"), page courante sans `aria-current="page"`, pas de `<nav aria-label>`.

11. **Cibles tactiles** : `px-2 py-1 text-sm` pour pagination, boutons ✕ (icône 16 px sans padding, `SearchInput.tsx:30-38`), bouton "x" de la recherche publique ~20 px : en dessous du minimum de 44x44 (WCAG 2.5.5 / 24x24 en AA 2.5.8). Impact fort sur mobile.

12. **Animations** : `transition-all duration-300`, `group-hover:scale-105` sans `motion-reduce:` ; ajouter `motion-reduce:transition-none motion-reduce:transform-none`. Par ailleurs `hover:` seul sur mobile = états collants au toucher : envelopper dans `@media (hover:hover)` (Tailwind 4 le fait par défaut pour `hover:`, ok).

## 4. PWA / SEO / méta

### Ce qui VA BIEN
- Titre et favicon dynamiques depuis `SiteSettings` (`SiteSettingsContext.tsx:36-50`) : favicon emoji en SVG data-URI, astuce élégante et légère. `viewport` correct.

### Ce qui NE VA PAS
1. **Titre jamais spécifique à la page** (`SiteSettingsContext.tsx:37` : `document.title = siteName` seulement). Onglet/partage/historique affichent toujours "Carta Cocktail" que l'on soit sur "Carte des cocktails" ou sur "Mojito". Proposition : petit hook `usePageTitle(title)` -> `"Mojito - Carte d'été - Nom du bar"` (P1, S).
2. **Pas de manifest ni PWA** (aucun `manifest.webmanifest`, service worker, `theme-color`, `apple-touch-icon`) : un invité ne peut pas "Ajouter à l'écran d'accueil" avec icône propre, et la carte n'est pas consultable hors-ligne (wifi saturé dans un bar !). Proposition : `vite-plugin-pwa` (workbox) : précache du shell + `StaleWhileRevalidate` sur `/api/public/*` et `CacheFirst` sur `/uploads/*` ; manifest `display: standalone`, `theme_color #0f0f1a`, icônes 192/512 (P2, M). Gros gain réel pour une carte consultée en salle.
3. **SEO / partage social** : SPA pure sans prérendu : pas de `<meta name="description">`, pas d'Open Graph (`og:title`, `og:image` = photo du cocktail), pas de `robots`. Les liens de carte partagés sur WhatsApp/iMessage n'ont donc ni titre ni aperçu image (les crawlers n'exécutent pas le JS). Options : (a) route backend/nginx `/menu/:slug` qui injecte les balises OG (SSR minimal via template `index.html`, M) ; (b) prérendu statique. Si la carte est publique sur Internet, ajouter aussi `<meta name="robots">` selon le choix du bar et un JSON-LD `Menu`/`Recipe` (P3).
4. **`index.html:5`** : favicon par défaut `/vite.svg` (logo Vite) : un visiteur voit le logo Vite tant que l'API settings n'a pas répondu, et en permanence si `siteIcon` vide (le fichier n'existe d'ailleurs pas dans `public/`). Remplacer par un favicon 🍸 inline (`href="data:image/svg+xml,..."`) (P2, S).
5. **Flash de contenu par défaut** : `defaultSettings.siteName = 'Carta Cocktail'` s'affiche dans le header avant l'arrivée de la réponse API, puis bascule vers le vrai nom (layout shift + clignotement de marque). Garder l'invité sans nom jusqu'au chargement, ou mettre en cache `siteSettings` dans `localStorage` pour un premier rendu immédiat (P2, S).
6. **Pas de `<noscript>`** ni de loader initial dans `index.html` (`#root` vide = écran noir blanc pendant le chargement des 605 kB). Ajouter un petit spinner CSS/fond `#0f0f1a` inline dans `<body style>` pour éviter le flash blanc avant l'application du CSS (P2, S).
7. **Route 404** : toute URL inconnue redirige silencieusement vers `/` (`App.tsx:65`) : mauvais pour SEO (soft-404) et pour l'utilisateur ; préférer une vraie page 404.

## 5. Autres constats (cohérence / robustesse UX)

- `ProtectedRoute` (`App.tsx:22-27`) : message "Loading..." en dur, sans traduction ni design.
- `AdminLayout.tsx:30-32` : l'appel `shortagesApi.list()` est refait à CHAQUE changement de route (`[location.pathname]`) : requêtes inutiles ; le déclencher au montage + après mutations (ou polling lent / contexte partagé).
- `PublicLayout.tsx:21-35` : le lien "Login"/"Dashboard" est affiché en permanence aux invités. Pour un menu consulté en salle, le bouton "Connexion" visible est du bruit ; le masquer (route `/login` toujours accessible) ou le déplacer en pied de page discret (P2, S). Il n'y a pas de footer (AGENTS.md mentionne "header/footer").
- Page publique : `MenuPublicPage.tsx:76-85` les erreurs `console.error` en production sans remontée.
- `key={index}` pour les tags (`PublicCocktailItem.tsx:85`) : OK car statique, mais `tags.split(',')` est recalculé à chaque rendu ; négligeable.
- `PublicCocktailItem.tsx:93-103` : affiche TOUS les ingrédients en pastilles dans la carte (jusqu'à 8-10 chips) en plus des tags et de la description : carte très dense ; limiter à 4 + "+N", ou n'afficher que les spiritueux principaux. Améliore beaucoup le scan visuel sur mobile.
- Sécurité UI (à relayer à l'autre revue) : la recherche publique inclut `cocktail.notes` (`utils/cocktailSearch.ts:46`) et l'API publique renvoie `notes` à tout le monde (`backend/src/routes/public.ts:137` pour l'export public, et les `include` du détail) : les notes internes réservées à l'admin (UI `CocktailPublicPage.tsx:84` ne les affiche que si `user`) peuvent être lues via l'API ou déduites par la recherche (un invité tape un mot et la carte apparaît). A exclure côté backend et de l'index de recherche.
- Tests : les composants UI testés existent, mais aucun test d'accessibilité automatisé (`vitest-axe`/`jest-axe`) ; ajouter un test axe sur les 3 pages publiques serait peu coûteux (S).

## 6. Plan d'action priorisé

| # | Action | Priorité | Effort | Gain |
|---|---|---|---|---|
| 1 | gzip/brotli nginx + `index.html` no-cache + `immutable` limité à `/assets/` + cache uploads | P0 | S | -70 % transfert JS/CSS |
| 2 | `React.lazy` par route admin + `import('jszip')` dynamique + `manualChunks` | P0 | S | ~-40 % JS pour l'invité |
| 3 | Images : `loading="lazy" decoding="async"` + redimensionnement WebP/`srcset` au upload (sharp) | P0 | S puis M | Poids page divisé par 10+ |
| 4 | Corriger langue `fr-FR`/`en-US` (`supportedLngs`/`resolvedLanguage`) + `document.documentElement.lang` | P0 | S | Bug fonctionnel + a11y |
| 5 | Message "aucun résultat", gestion erreur HomePage, skeletons, retour `navigate(-1)` + restauration du scroll | P1 | S/M | UX mobile majeure |
| 6 | Tokens `@theme` + composants `Button`, `Field/Input`, `Card`, `Modal(<dialog>)`, `ConfirmDialog`, `Toast` | P1 | M/L | Cohérence, a11y, maintenance |
| 7 | Focus visible global, `htmlFor` via `Field`, ARIA dropdowns (Escape, flèches, `aria-expanded`), `aria-label` boutons icônes/pagination | P1 | M | WCAG AA |
| 8 | Contrastes `text-gray-500/600` -> 400 ; cibles tactiles >= 44 px | P1 | S | Lisibilité |
| 9 | Titres de page dynamiques (`usePageTitle`) + `theme-color` + `color-scheme` + favicon par défaut | P1 | S | Polish |
| 10 | Barre de sections collante (chips) + header public allégé + masquer "Connexion" | P1 | M | Navigation carte |
| 11 | Auto-hébergement des polices (fontsource, `font-display: swap`) | P1 | S/M | LCP, vie privée, hors-ligne |
| 12 | PWA (`vite-plugin-pwa`) : manifest + cache API/images | P2 | M | Hors-ligne, "Ajouter à l'écran d'accueil" |
| 13 | OG tags / prérendu pour partage de liens | P2 | M/L | Aperçus WhatsApp |
| 14 | Mémoïser l'index de recherche + `useDeferredValue` + `React.memo(PublicCocktailItem)` ; recherche bouteilles insensible aux accents | P2 | S | Fluidité sur vieux mobiles |
| 15 | Home enrichie (vignettes, icônes par type, pluriels i18n), ingrédients limités à "+N" dans les cartes | P2 | S/M | "Plus joli" |
| 16 | i18n des textes en dur (IconPicker, LanguageSelector, HomePage, MenuBottleEditPage...) | P2 | S | Conformité |
| 17 | Mode clair optionnel (après centralisation des couleurs), tests axe | P3 | M | Confort plein jour |
