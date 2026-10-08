---
id: E-08
title: "Assistants d'import : composants communs et bugs du mode lot"
phase: E
lane: frontend
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [E-01, E-03]
touches: [frontend/src/components/import/, frontend/src/i18n/locales/]
sources: ["05-frontend-archi.md §4.4"]
branch:
pr:
---

## Contexte

L'import sert à reprendre des recettes (JSON ou ZIP de plusieurs recettes) et un inventaire de bouteilles (CSV, JSON, ZIP). En mode lot, l'assistant cocktail peut afficher un écran vide ou un récapitulatif faux, et certains champs ne se laissent pas vider. Les deux assistants recopient la même coquille de modale, la même zone de dépôt et la même règle de clé de résolution, ce qui rend chaque correction triple.

## Problème constaté

Bugs, tous vérifiés dans le code :

- **Récapitulatif faux après « Réessayer »** : `ImportCocktailWizard.tsx:168-175` ajoute un échec à `importResults` ; « Réessayer » (`:319`) puis une réussite ajoutent une seconde entrée pour la même recette. Le compteur `success/total` (`:376-379`) dépasse le nombre de recettes.
- **Écran vide** : après une confirmation réussie, `advanceToNextRecipe` (`:134-147`) met `preview` à `null` puis appelle `previewRecipe`, dont le `catch` (`:122-124`) ne change pas d'étape. On reste sur `step === 'confirm'` avec `preview === null` (`:265`) : modale vide, sans message ni bouton.
- **Bouton « Retour » inerte en lot** (non relevé par la revue) : `:260` renvoie vers `'resolve'` quand on est déjà sur `'resolve'` et que `currentIndex > 0`.
- **Champs impossibles à vider** : `resolution?.data?.name || entity.ref.name` dans `ImportEntityRow.tsx:175, 181, 191, 222, 239`.
- **`NaN` envoyé** : `parseInt(e.target.value)` sans repli (`ImportEntityRow.tsx:230`).
- **`existingId` indéfini** : `ImportEntityRow.tsx:42` quand aucune option n'existe.
- **Correspondance jamais affichée** : `ImportStepConfirm.tsx:32-36` calcule `mappedTo` depuis `existingMatch` (faux si l'utilisateur a choisi une autre entité) et `:85` n'affiche que `e.name`.
- **Logique morte** : `ImportStepResolve.tsx:47-61`, `allResolved` vaut presque toujours `true` car `buildAutoResolutions` remplit toutes les entrées.
- **Lecture de fichier** : `ImportStepUpload.tsx:27-42`, pas de `reader.onerror` ; `validateRecipe` (`:21-25`) n'exige que `version === 1` et un nom.
- **Chargements** : `ImportStepResolve.tsx:23-29` recharge 5 listes à chaque montage (donc à chaque recette d'un lot), sans `catch`.
- **Langue forcée** : `ImportBottlesWizard.tsx:316` et `ImportEntityRow.tsx:202` affichent `nameTranslations?.fr` en premier, quelle que soit la langue.

Duplication :

- Coquille, en-tête, indicateur 1-2-3 : `ImportCocktailWizard.tsx:189-238` contre `ImportBottlesWizard.tsx:166-189`.
- Zone de dépôt : `ImportStepUpload.tsx:111-126` contre `ImportBottlesWizard.tsx:194-213`. C'est un `div` cliquable : inaccessible au clavier.
- Clé de résolution (`abbreviation || name` en minuscules) : `ImportCocktailWizard.tsx:31, 43, 55, 67`, `ImportStepResolve.tsx:41-44`, `ImportStepConfirm.tsx:21-23`.
- Données de création par défaut : `ImportCocktailWizard.tsx:35-75` contre `ImportEntityRow.tsx:51-83` ; `ImportBottlesWizard.tsx:30-39` contre `:281-289`.
- `ImportBottlesWizard.tsx` fait 523 lignes.

## Ce qu'il faut faire

1. **`components/import/importResolutions.ts`** (fonctions pures) : `resolutionKey(type, ref)`, `defaultCreateData(type, ref)`, `buildAutoResolutions(preview)` (déplacée depuis le wizard). Les trois fichiers qui recalculent la clé l'importent.
2. **Composants communs** dans `components/import/` :
   - `WizardModal` : `title`, `steps: string[]`, `currentStep: number | null` (null masque l'indicateur), `onClose`, `children`. Basé sur `Modal` (E-03), taille `xl`.
   - `FileDropzone` : `accept: string`, `onFile(file: File)`, `label: string`, `fileName?: string`. Un vrai `<button>` qui ouvre l'`<input type="file">`, plus glisser-déposer.
   - `WizardResult` : `variant: 'success' | 'error' | 'summary'`, `title`, `message?`, `actions: ReactNode`.
3. **Machine d'états de l'assistant cocktail** : `components/import/importCocktailReducer.ts`, avec `useReducer`. État : `step`, `recipes`, `currentIndex`, `preview`, `resolutions`, `results: Record<number, ImportResult>` (indexé par recette, donc « Réessayer » remplace au lieu d'ajouter), `error`. Actions : `LOADED`, `PREVIEW_OK`, `PREVIEW_FAILED`, `CONFIRM_OK`, `CONFIRM_FAILED`, `RETRY`, `SKIP`, `BACK`. `PREVIEW_FAILED` passe toujours à l'étape `error` avec le message et les boutons « Passer » / « Fermer ». `BACK` depuis `resolve` revient à `upload` seulement pour la première recette ; ensuite le bouton est masqué.
4. **`ImportEntityRow`** : `??` au lieu de `||` sur les 5 lignes ; champ numérique vide → `null` et message de validation ; option « Utiliser l'existant » désactivée quand la liste est vide ; libellés de type via `useLocalizedName()`.
5. **`ImportStepConfirm`** : `mappedTo` calculé depuis `resolution.existingId` et la liste des entités, et affiché (« Rhum → Rhum ambré »).
6. **`ImportStepResolve`** : retirer `allResolved` ou le remplacer par une vraie vérification (nom non vide pour chaque `create`). Charger les listes avec les hooks d'E-02 (`useUnits`, `useCategories`, `useBottles`, `useIngredients`, `useCategoryTypes`) : une seule série de requêtes pour tout le lot.
7. **`ImportStepUpload`** : `reader.onerror` → message ; `validateRecipe` vérifie aussi `Array.isArray(cocktail.ingredients)` et `Array.isArray(cocktail.instructions)`. L'import dynamique de `jszip` posé par E-01 reste en place.
8. **`ImportBottlesWizard`** : découper en `BottleImportCategoryStep`, `BottleImportRowsStep`, `BottleImportConfirmStep`, sur `WizardModal`, `FileDropzone` et `WizardResult`. Objectif : orchestrateur sous 200 lignes.
9. Textes : les nouveaux composants et les messages ajoutés passent par `t()` (`cocktails.importWizard.*`, `bottles.importWizard.*`).

## Critères d'acceptation

- [ ] Lot de 3 recettes, échec de la 2ᵉ, « Réessayer » puis succès : le récapitulatif affiche 3 lignes et « 3/3 ».
- [ ] Lot dont l'aperçu de la recette suivante échoue : un écran d'erreur s'affiche avec un bouton, jamais une modale vide.
- [ ] Vider le champ nom d'une entité à créer laisse le champ vide et bloque la confirmation.
- [ ] Aucun `NaN` dans le corps envoyé à `importConfirm` (test).
- [ ] L'écran de confirmation affiche la correspondance choisie pour chaque entité existante.
- [ ] La zone de dépôt s'ouvre au clavier (Tab puis Entrée).
- [ ] Un import de lot de 10 recettes ne déclenche qu'une série de 5 requêtes de listes.
- [ ] `resolutionKey` est défini à un seul endroit.
- [ ] `ImportBottlesWizard.tsx` ≤ 200 lignes.
- [ ] Couverture ≥ 80 % sur les lignes modifiées (les fichiers `ImportCocktailWizard`, `ImportStep*`, `ImportEntityRow` n'ont aucun test aujourd'hui).

## Tests à ajouter ou adapter

- `importResolutions.test.ts` : clé d'unité avec et sans abréviation, données par défaut par type.
- `importCocktailReducer.test.ts` (sans DOM) : chaque transition, dont réessai après échec (une seule entrée par index) et échec d'aperçu en cours de lot.
- `ImportCocktailWizard.test.tsx` (nouveau) : parcours JSON simple ; parcours ZIP de 2 recettes avec `jszip` mocké ; échec puis réessai ; échec d'aperçu → écran d'erreur.
- `ImportEntityRow.test.tsx` : vider un champ, champ numérique vide, liste existante vide.
- `ImportStepConfirm.test.tsx` : affichage de `mappedTo` pour un choix différent de `existingMatch`.
- `ImportBottlesWizard.test.tsx` : adapter aux nouveaux sous-composants ; corriger les 2 avertissements `act(...)` relevés par `04-tests.md §1`.
- `FileDropzone.test.tsx` : clavier, dépôt d'un fichier, filtre `accept`.

## Points d'attention

- Le point 6 suppose E-02 terminée, alors qu'elle n'est pas dans `depends_on`. Si elle ne l'est pas, charger les listes une fois dans l'orchestrateur avec `Promise.all` et un `catch`, et passer les données en props. Ajouter E-02 aux dépendances serait plus simple.
- `EntityResolutionAction.data` reste typé `ImportEntityRef`, dont tous les champs sont optionnels (`types/index.ts:257-268`) ; une union discriminée par type d'entité relève de F-05.
- Le backend de l'import cocktail change avec C-09 (import fiable). Vérifier que les noms de champs de `defaultCreateData` correspondent toujours au contrat.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
