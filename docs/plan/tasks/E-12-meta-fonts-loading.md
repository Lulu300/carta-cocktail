---
id: E-12
title: "Méta et chargement : titres de page, theme-color, favicon, polices auto-hébergées"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: []
touches: [frontend/index.html, frontend/src/contexts/SiteSettingsContext.tsx, frontend/src/hooks/usePageTitle.ts, frontend/package.json, frontend/package-lock.json, frontend/src/index.css, frontend/src/main.tsx, frontend/src/pages/public/HomePage.tsx, frontend/src/pages/public/MenuPublicPage.tsx, frontend/src/pages/public/CocktailPublicPage.tsx]
sources: ["06-frontend-ux-perf.md §4", "06-frontend-ux-perf.md §1"]
branch:
pr:
---

## Contexte

Les premières secondes d'une visite sont soignées nulle part : écran blanc puis noir, logo Vite dans l'onglet, nom « Carta Cocktail » qui clignote avant le vrai nom du bar, polices chargées depuis Google en chaîne. L'onglet affiche le même titre sur toutes les pages, ce qui rend l'historique et le partage illisibles. Le bar peut aussi tourner sur un réseau local sans Internet : les polices Google n'y arrivent jamais.

## Problème constaté

- `frontend/index.html:2` : `<html lang="en">` (A-08 le rend dynamique, ne pas refaire ici).
- `frontend/index.html:5` et `SiteSettingsContext.tsx:46` : favicon `/vite.svg`. Il n'existe pas de dossier `frontend/public/`, le fichier n'est pas servi. La regex de cache de `nginx.conf.template:31` capte `.svg` sans `try_files` : c'est un vrai 404, pas un repli sur `index.html` comme l'écrit la revue.
- Pas de `<meta name="theme-color">`, `color-scheme`, `description`, ni `<noscript>`. `#root` vide et `body` sans fond jusqu'à l'arrivée du CSS : flash blanc.
- `SiteSettingsContext.tsx:10` : nom par défaut « Carta Cocktail » affiché avant la réponse, puis remplacé. `:29-33` duplique `refresh` (`:20-27`).
- `SiteSettingsContext.tsx:37` : `document.title = siteName` partout, jamais de titre propre à la page.
- `frontend/src/index.css:1` : `@import url('https://fonts.googleapis.com/…Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@400;600;700…')`. Requêtes en chaîne (HTML → CSS → CSS Google → woff2), 8 graisses, adresse IP de l'invité transmise à Google.

## Ce qu'il faut faire

1. **Polices** : installer `@fontsource-variable/inter` et `@fontsource-variable/playfair-display`, les importer dans `main.tsx` (`import '@fontsource-variable/inter';`). Supprimer la ligne 1 d'`index.css`. Mettre à jour le `@theme` :
   ```css
   --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
   --font-serif: 'Playfair Display Variable', ui-serif, Georgia, serif;
   ```
   Les paquets Fontsource utilisent `font-display: swap` et découpent par `unicode-range` : le navigateur ne télécharge que le sous-ensemble latin. Si l'humain choisit une autre police de corps (voir E-03), installer le paquet correspondant à la place d'Inter.
2. **`index.html`** :
   - `<meta name="theme-color" content="#0f0f1a">`, `<meta name="color-scheme" content="dark">`, `<meta name="description" content="…">` (texte neutre, le nom du bar n'est pas connu ici).
   - Favicon par défaut en data URI : `href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍸</text></svg>"` (encodé).
   - `<body style="background:#0f0f1a;color:#f3f4f6">`, petit indicateur de chargement en CSS pur dans `#root` (React le remplace au montage), et `<noscript>` avec un message court en français et en anglais.
3. **`SiteSettingsContext`** :
   - L'effet initial appelle `refresh()` au lieu de dupliquer le code.
   - Mettre les réglages en cache dans `localStorage` (`siteSettings`) : lecture au démarrage pour le premier rendu, écriture après chaque réponse. Encadrer lecture et écriture d'un `try/catch`.
   - Exposer `isLoaded: boolean`. Tant que rien n'est chargé ni en cache, `siteName` vaut `''` : les en-têtes affichent un espace réservé de même hauteur plutôt que « Carta Cocktail ».
   - Le favicon de repli devient le même data URI 🍸 que dans `index.html`.
4. **`hooks/usePageTitle.ts`** :
   ```ts
   export function usePageTitle(...parts: (string | null | undefined)[]): void
   // usePageTitle(cocktail?.name, menu?.name) -> "Mojito · Carte d'été · Nom du bar"
   ```
   Lit `siteName` dans le contexte, filtre les parties vides, joint avec « · », remet le titre du site au démontage. `SiteSettingsContext` ne touche plus `document.title` que si aucune page n'a posé de titre (ou supprimer cette ligne et appeler `usePageTitle()` dans `HomePage`).
5. Appeler `usePageTitle` dans `HomePage`, `MenuPublicPage` (`menu?.name`), `CocktailPublicPage` (`cocktail?.name`, nom du menu si disponible). Les titres de l'admin ne sont pas dans cette tâche.

## Critères d'acceptation

- [ ] Sur `/menu/:slug`, l'onglet Réseau ne montre aucune requête vers `fonts.googleapis.com` ni `fonts.gstatic.com`.
- [ ] Le site s'affiche avec ses polices sur un poste sans accès Internet (test en coupant le réseau externe, backend local).
- [ ] Plus aucune requête vers `/vite.svg`.
- [ ] Barre d'adresse mobile sombre (Chrome Android, Safari iOS).
- [ ] Rechargement de `/menu/:slug` : pas de flash blanc, pas de clignotement du nom du site lors des visites suivantes.
- [ ] Titre de l'onglet sur une fiche : « <cocktail> · <menu> · <site> ».
- [ ] Lighthouse mobile sur `/menu/:slug` : LCP mesuré avant et après, noté dans le Journal.

## Tests à ajouter ou adapter

- `hooks/usePageTitle.test.tsx` : parties vides ignorées, ordre, restauration au démontage, mise à jour quand `siteName` change.
- `contexts/SiteSettingsContext.test.tsx` (existe) : lecture du cache `localStorage` au premier rendu, écriture après la réponse, `localStorage` qui lève une exception, favicon de repli en data URI, un seul appel `getSettings` au montage.
- Tests des pages publiques : `document.title` attendu après chargement.

## Points d'attention

- `index.css` est aussi modifié par E-03 (tokens) et E-09 (focus) : conflit simple sur le bloc `@theme`, à résoudre au rebase.
- Les trois pages publiques sont aussi touchées par A-05 et E-11. Les appels à `usePageTitle` tiennent en une ligne : fusion facile, mais pas de parallèle avec E-11.
- F-02 (PWA) dépend de cette tâche pour `theme-color` et le favicon ; les icônes PNG 192/512 et le manifest sont dans F-02, pas ici.
- `localStorage` de `setup.ts` n'est pas vidé entre les tests (`04-tests.md §5.5`). Appeler `localStorage.clear()` dans les `beforeEach` des tests de cette tâche.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
