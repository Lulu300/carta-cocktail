---
id: E-23
title: "Erreurs de validation (400) : afficher les champs fautifs à partir de details[]"
phase: E
lane: frontend
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [C-04]
touches: [frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/i18n/locales/, frontend/src/pages/admin/]
sources: ["01-backend-routes.md §R2"]
branch:
pr:
---

## Contexte

Depuis C-04, le backend valide toutes les entrées avec zod. Une requête invalide reçoit une 400 de la forme `{ error: "Erreur de validation", details: [{ path, code, message }] }`, par exemple `path: "body.ingredients.0.quantity"`, `code: "too_small"`. Le champ `message` vient de zod et reste en anglais.

## Problème constaté

- `frontend/src/services/api.ts` garde le corps de la réponse dans `ApiError.body`, mais aucune page ne lit `details` : l'admin ne voit que « Erreur de validation », sans savoir quel champ corriger.
- Cas concrets après C-04 :
  - formulaire cocktail : quantité 0 saisie ou champ vidé, ligne sans bouteille, catégorie ou ingrédient choisi (« -- ») ;
  - import de bouteilles : un fichier fait à la main avec une ligne hors bornes (capacité vide, pourcentage > 100, prix négatif) est refusé en entier à la confirmation, sans indiquer la ligne (jusqu'à C-10).
- E-05 et E-15 lisent `details` seulement pour les 409 de suppression ; E-06 valide le formulaire cocktail côté client, mais ne traite pas une 400 renvoyée par le serveur.

## Ce qu'il faut faire

1. `services/api.ts` : exposer les issues d'une 400 de validation (`ApiError.validationIssues(): { path: string; code: string }[]`, vide si absentes ou mal formées).
2. Un helper partagé qui transforme une issue en message traduit : le champ à partir du dernier segment non numérique de `path` (clés `validation.fields.<champ>`), la règle à partir de `code` (`invalid_type`, `too_small`, `too_big`, `invalid_value`, `custom`…, clés `validation.codes.<code>`), et la position d'une ligne quand `path` contient un index (« ligne 2 »). Repli sur le message générique si le champ ou le code est inconnu.
3. Afficher ces messages là où une 400 de validation peut arriver aujourd'hui : formulaire cocktail (sur la ligne concernée quand c'est possible), assistant d'import de bouteilles (numéro de ligne), et le toast ou message d'erreur des autres formulaires admin.
4. Clés i18n en et fr. Ne jamais afficher le `message` anglais de zod tel quel.

## Critères d'acceptation

- [ ] Une 400 avec `details: [{ path: 'body.ingredients.1.quantity', code: 'too_small' }]` affiche un message traduit qui nomme la quantité de la ligne 2.
- [ ] Une 400 sans `details`, ou avec des `details` mal formés, garde le message générique actuel.
- [ ] Un `path` ou un `code` inconnu n'affiche pas de clé i18n brute.
- [ ] L'import de bouteilles refusé en 400 indique la ligne et le champ fautifs.

## Tests à ajouter ou adapter

- `api.test.ts` : `validationIssues()` sur une 400 avec `details`, sans `details`, avec un corps non JSON.
- Test unitaire du helper : champ connu ou inconnu, code connu ou inconnu, `path` avec et sans index.
- `CocktailFormPage.test.tsx` et `ImportBottlesWizard.test.tsx` : API mockée qui renvoie une 400 avec `details` → message affiché.

## Points d'attention

- Le format de `details` vient de `backend/src/validation/validate.ts` (C-04) : `path` est `params.`, `query.` ou `body.` suivi du chemin zod joint par des points.
- Coordonner avec E-06 (formulaire cocktail) et E-04 (toasts) pour ne pas afficher l'erreur à deux endroits.
- F-05 partagera les schémas zod avec le frontend : les clés de champ doivent suivre les noms des schémas.

## Journal

- 2026-10-11 : tâche créée par C-04 (décision humaine sur la question 3 de C-04) : le frontend n'affiche pas les `details` des 400 de validation.
