---
id: E-23
title: "Erreurs de validation (400) : afficher les champs fautifs à partir de details[]"
phase: E
lane: frontend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-04]
touches: [frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/utils/validationMessage.ts, frontend/src/utils/validationMessage.test.ts, frontend/src/components/ui/ToastStore.ts, frontend/src/components/ui/ToastStore.test.ts, frontend/src/i18n/admin.ts, frontend/src/i18n/bundles.test.ts, frontend/src/i18n/locales/, frontend/src/components/import/ImportBottlesWizard.tsx, frontend/src/components/import/ImportBottlesWizard.test.tsx, frontend/src/test/msw/utils.ts, frontend/src/pages/admin/, backend/src/routes/units.test.ts]
sources: ["01-backend-routes.md §R2"]
branch: feature/E-23-validation-error-details
pr: "#195"
---

## Contexte

Depuis C-04, le backend valide toutes les entrées avec zod. Une requête invalide reçoit une 400 de la forme `{ error: "Erreur de validation", details: [{ path, code, message }] }`, par exemple `path: "body.ingredients.0.quantity"`, `code: "too_small"`. Le champ `message` vient de zod et reste en anglais.

## Problème constaté

- `frontend/src/services/api.ts` garde le corps de la réponse dans `ApiError.body`, mais aucune page ne lit `details` : l'admin ne voit que « Erreur de validation », sans savoir quel champ corriger.
- Cas encore atteignable (vérifié le 2026-11-24) : un nom fait seulement d'espaces passe l'attribut `required` du navigateur, puis `RequiredText` (trim + min 1) le refuse (`body.name`, `too_small`). Cela vaut pour tous les formulaires admin (bouteilles, catégories, unités, ingrédients, menus, types).
- Cas cités à la création de la tâche et réglés depuis par d'autres tâches :
  - formulaire cocktail : E-06 (#102) puis C-21 valident côté client la quantité et la source de chaque ligne, avec le même assouplissement que le backend pour les défauts déjà enregistrés. Une 400 n'y arrive plus que si la recette enregistrée a changé entre-temps (autre onglet) ;
  - import de bouteilles : depuis C-10 (#113), la prévisualisation écarte les lignes hors bornes avec les mêmes schémas que la confirmation, et E-08 (#119) les affiche. La confirmation renvoie le `payload` de la prévisualisation sans le modifier : son 400 n'est plus atteignable depuis l'assistant.

## Ce qu'il faut faire

Périmètre retenu par l'humain (option B, 2026-11-24) : un seul message partagé, sans affichage par ligne dans le formulaire cocktail.

1. `services/api.ts` : `ApiError.validationIssues(): { path: string; code: string }[]`, vide pour un autre statut qu'une 400, sans `details` ou avec des `details` d'une autre forme (ceux de C-33 restent lisibles dans `body`).
2. Un helper du chunk admin (`utils/validationMessage.ts`) qui transforme la première issue nommable en message traduit : le champ à partir du dernier segment non numérique de `path` (clés `validation.fields.<champ>`), la règle à partir de `code` (clés `validation.codes.<code>`, « obligatoire » pour un texte requis vide), la ligne quand `path` contient un index (« Ligne 2, Quantité : … »). Repli sur le message du backend si le champ ou le code est inconnu.
3. L'utiliser dans tous les toasts d'erreur et dans l'écran d'erreur de l'assistant d'import de bouteilles. Pas d'affichage par ligne dans le formulaire cocktail : sa validation client le fait déjà.
4. Clés i18n en et fr, dans le bundle admin. Ne jamais afficher le `message` anglais de zod.

## Critères d'acceptation

- [x] Une 400 avec `details: [{ path: 'body.ingredients.1.quantity', code: 'too_small' }]` affiche un message traduit qui nomme la quantité de la ligne 2.
- [x] Une 400 sans `details`, ou avec des `details` mal formés, garde le message générique actuel.
- [x] Un `path` ou un `code` inconnu n'affiche pas de clé i18n brute.
- [x] L'import de bouteilles refusé en 400 indique la ligne et le champ fautifs (testé avec une API mockée, voir Problème constaté).
- [x] Un nom fait d'espaces refusé par le backend affiche « Nom : obligatoire » au lieu de « Erreur de validation ».
- [x] Le premier chargement public ne contient ni le helper ni ses messages ; budget du bundle public mesuré.

## Tests à ajouter ou adapter

- `api.test.ts` : `validationIssues()` sur une 400 avec `details`, sans `details`, avec des `details` d'une autre forme, avec un corps non JSON, sur une 409.
- `utils/validationMessage.test.ts` : champ connu ou inconnu, code connu ou inconnu, `path` avec et sans index, texte requis vide, français, toast une fois les messages admin chargés, chaque champ et code connu traduit en en et fr.
- `ToastStore.test.ts` : le describer enregistré passe avant le message de l'erreur.
- `UnitsPage.test.tsx` (nom fait d'espaces), `CocktailFormPage.test.tsx` (ligne 2 refusée à la mise à jour) et `ImportBottlesWizard.test.tsx` : API mockée qui renvoie une 400 avec `details` → message affiché.
- `backend/src/routes/units.test.ts` : un nom fait d'espaces renvoie `details: [{ path: 'body.name', code: 'too_small' }]`, la forme que lit le frontend.

## Points d'attention

- Le format de `details` vient de `backend/src/validation/validate.ts` (C-04) : `path` est `params.`, `query.` ou `body.` suivi du chemin zod joint par des points.
- `ToastStore` fait partie du premier chargement public. Il ne connaît que `setErrorDescriber()` ; `i18n/admin.ts` y enregistre le helper avec les messages admin. `bundles.test.ts` interdit les clés construites à l'exécution dans le premier chargement : le helper ne peut pas y être importé.
- F-05 partagera les schémas zod avec le frontend : les clés de champ suivent les noms des schémas (`KNOWN_FIELDS`). Un nouveau champ de formulaire s'ajoute à cette liste et aux deux fichiers de messages.
- C-38 affichera les `details` d'une autre forme (`unknownReference`, `importUnresolved`) : `validationIssues()` les ignore, `body` les garde.

## Journal

- 2026-10-11 : tâche créée par C-04 (décision humaine sur la question 3 de C-04) : le frontend n'affiche pas les `details` des 400 de validation.
- 2026-10-12 : C-33 (PR #127) ajoute deux 400 dont les `details` n'ont pas la forme zod `{ path, code, message }` : `errors.unknownReference` → `[{ line, field, id }]` (POST/PUT d'un cocktail) et `errors.importUnresolved` → `[{ line, kind, name }]` (confirmation d'import). C-38 (qui dépend de cette tâche) les affiche : prévoir dans `ApiError` un accès aux `details` qui ne suppose pas la forme zod.
- 2026-11-24 : question au coordinateur avant de coder : les deux cas concrets de la tâche n'arrivent plus au serveur depuis E-06/C-21 et C-10/E-08 ; seul le nom fait d'espaces reste atteignable. Décision humaine, mot pour mot : Q1 « One shared message (B) » — « read the 400's details once and turn them into a translated message ('Name: required') used by every toast and by the import wizard (which names the row). No per-line display in the cocktail form, already validated client-side. Smallest change; the public bundle barely grows. » ; Q2 « First field only » — « e.g. 'Name: required'. The admin fixes it and saves again. ». Q3 (recommandation de l'auteur) : `validationIssues()` dans `api.ts`, la traduction dans un module admin. Criticité passée de moyenne à basse : un seul cas atteignable, et un cas limite.
- 2026-11-24 : faite (PR #195, branche `feature/E-23-validation-error-details`). `ToastStore` reçoit le helper par `setErrorDescriber()`, enregistré par `i18n/admin.ts` avec les messages admin, au lieu de l'importer : le helper (chunk `validationMessage`) et ses messages (chunk `admin`) restent hors du premier chargement. Bundle public mesuré avec `.github/scripts/bundle-budget.mjs` : 133,43 kB avant, 133,37 kB après (budget 140 kB ; le découpage a fusionné le chunk `i18n` dans `api`). Fichiers ajoutés à `touches` : `ToastStore.ts`, `i18n/admin.ts`, `utils/validationMessage.ts`, `ImportBottlesWizard.tsx`, `test/msw/utils.ts` (`mockValidationError`), `bundles.test.ts` (modèles de clés) et `backend/src/routes/units.test.ts` (forme des `details` d'un nom vide).
- Notes de version : quand le serveur refuse une saisie (par exemple un nom fait seulement d'espaces), le message d'erreur de l'admin nomme le champ et la règle, et la ligne s'il y a lieu (« Name: required », « Row 2, Quantity: value too small ») au lieu de « Validation error ».
