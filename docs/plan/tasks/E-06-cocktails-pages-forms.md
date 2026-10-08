---
id: E-06
title: "Cocktails : liste découpée, formulaire avec react-hook-form + zod"
phase: E
lane: frontend
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [E-02, E-03, E-04]
touches: [frontend/src/pages/admin/CocktailsPage.tsx, frontend/src/pages/admin/CocktailFormPage.tsx, frontend/src/components/admin/cocktails/, frontend/src/queries/, frontend/package.json, frontend/package-lock.json]
sources: ["05-frontend-archi.md §H4", "05-frontend-archi.md §4.2", "05-frontend-archi.md §6"]
branch:
pr:
---

## Décisions validées (2026-10-08)

- **Bouteilles préférées** (décision C-08) : dans la liste et la fiche admin des cocktails, afficher un avertissement « aucune bouteille préférée disponible » quand une ligne `CATEGORY` renvoie `preferredAvailable: false`. Si C-08 n'est pas encore mergée, ignorer ce point et le signaler dans la PR.

## Contexte

Le formulaire de cocktail est l'écran le plus utilisé de l'admin et le moins testé (34 % de couverture, 19,8 % des branches). Il accepte des lignes d'ingrédient sans source, peut rester vide en mode édition et écrase la saisie en cours. La liste des cocktails duplique tout son rendu entre la vue grille et la vue liste.

## Problème constaté

- `CocktailFormPage.tsx:63-88` : le cocktail n'est chargé que si `allUnits.length > 0`, avec `allUnits` en dépendance. Sans unité en base, le formulaire d'édition reste vide. Tout `setAllUnits` relance le `GET` et écrase la saisie. Pas d'annulation si `id` change.
- `App.tsx:57-58` : `/admin/cocktails/new` et `/admin/cocktails/:id` rendent le même composant au même endroit ; React le réutilise et l'état d'un formulaire peut passer dans l'autre.
- Aucune validation métier : lignes avec `bottleId`, `categoryId` ou `ingredientId` à `null` envoyées (`:146-148`), `unitId: 0` si aucune unité (`:97`), `quantity` à 0 accepté.
- `key={idx}` sur des lignes supprimables (`:266`, `:359`).
- `URL.createObjectURL` jamais révoqué (`:231`).
- 13 `useState` pour le formulaire (`:32-47`), mises à jour par copie de tableau (`:102-125`).
- `CocktailsPage.tsx` (442 lignes) : vues grille (`:267-344`) et liste (`:346-428`) qui dupliquent actions, image, tags et badge. Tags découpés à la main 4 fois (`:36`, `:49`, `:317`, `:399`) plus `CocktailFormPage.tsx:137, 204`. Suppression via `confirm()` (`:79`), erreurs d'export en `console.error` seul (`:104`).
- Textes en dur dans le badge de disponibilité : `CocktailsPage.tsx:119` (« Indisponible ») et suivants, pluriel fait à la main (« dose/doses », « autre(s) »).

## Ce qu'il faut faire

1. Dépendances : `react-hook-form`, `@hookform/resolvers`, `zod`.
2. **Schéma** `components/admin/cocktails/cocktailFormSchema.ts` :
   ```ts
   const ingredientRow = z.discriminatedUnion('sourceType', [
     z.object({ sourceType: z.literal('BOTTLE'), bottleId: z.number().int().positive(), quantity: z.number().positive(), unitId: z.number().int().positive() }),
     z.object({ sourceType: z.literal('CATEGORY'), categoryId: z.number().int().positive(), preferredBottleIds: z.array(z.number()), quantity: z.number().positive(), unitId: z.number().int().positive() }),
     z.object({ sourceType: z.literal('INGREDIENT'), ingredientId: z.number().int().positive(), quantity: z.number().positive(), unitId: z.number().int().positive() }),
   ]);
   export const cocktailFormSchema = z.object({
     name: z.string().trim().min(1),
     description: z.string(), notes: z.string(), tags: z.string(), isAvailable: z.boolean(),
     ingredients: z.array(ingredientRow),
     instructions: z.array(z.object({ text: z.string() })),
   });
   export function toCocktailInput(values: CocktailFormValues): CocktailInput;   // tags découpés, instructions vides retirées
   export function fromCocktail(c: Cocktail): CocktailFormValues;
   ```
   Messages d'erreur via clés i18n (`validation.required`, `validation.positive`, `validation.sourceRequired`). Garder les règles alignées sur le schéma backend de C-04 : F-05 remplacera ce fichier par le schéma partagé.
3. **Monter un formulaire neuf par cocktail** sans toucher `App.tsx` : `CocktailFormPage` devient une coquille qui lit `id` et rend `<CocktailForm key={id ?? 'new'} id={id ? Number(id) : undefined} />`.
4. **Chargement indépendant** : `useCocktail(id)` (clé `qk.cocktail(id)`, `enabled: id !== undefined`) et les listes `useCategories`, `useBottles`, `useIngredients`, `useUnits` d'E-02. `useForm({ resolver: zodResolver(cocktailFormSchema), values: cocktail ? fromCocktail(cocktail) : undefined, resetOptions: { keepDirtyValues: true } })`. Le chargement des unités ne déclenche plus rien sur le cocktail. Un 404 affiche un état d'erreur avec lien vers la liste.
5. **Lignes** : `useFieldArray` pour `ingredients` et `instructions`, `key={field.id}`. Extraire `components/admin/cocktails/IngredientRowFields.tsx` (sélecteur de source, sélecteur d'entité selon la source, quantité, unité, bouteilles préférées) et `InstructionsFields.tsx`. Changer la source remet à zéro les champs propres à la source (comportement actuel de `:106-111`).
6. **Image** : `components/admin/cocktails/ImagePicker.tsx`, qui révoque l'URL précédente et l'URL courante au démontage.
7. **Soumission** : `useCreateCocktail` / `useUpdateCocktail` / `useUploadCocktailImage` dans `queries/cocktails.ts`. Bouton désactivé pendant `formState.isSubmitting`. Garder la logique anti-doublon livrée par A-09 (après une création réussie, ne plus pouvoir recréer si l'upload échoue). Succès : toast puis retour à la liste ; échec d'upload : toast d'erreur et rester sur `/admin/cocktails/:id`. Invalider `qk.cocktails`, `qk.cocktail(id)`, `qk.availability`.
8. **Création d'ingrédient en ligne** (`:127-133`) : réutiliser la mutation de création d'ingrédient d'E-05 si elle existe, sinon l'ajouter dans `queries/ingredients.ts`.
9. **Liste** : extraire dans `components/admin/cocktails/` : `CocktailThumbnail`, `CocktailActions`, `AvailabilityBadge`, `AvailabilityWarnings`, `CocktailCard`, `CocktailListItem`, `TagList` (+ `parseTags(tags: string | null): string[]`), et `useSelection<T>()` → `{ selected: Set<T>, toggle, setAll(ids), clear, isSelected }`. Remplacer `confirm()` par `useConfirm`, les `console.error` par `toast.error`. Garder la sélection filtrée corrigée par A-09.
10. Les composants extraits reçoivent les textes en dur tels quels ; E-10 les traduit et pose les pluriels.

## Critères d'acceptation

- [ ] Avertissement « aucune bouteille préférée disponible » affiché quand `preferredAvailable === false` (si C-08 est mergée).
- [ ] Avec une base sans unité, `/admin/cocktails/:id` affiche le cocktail (nom, description, instructions).
- [ ] Modifier un champ puis attendre un rechargement des listes en arrière-plan : la saisie n'est pas écrasée.
- [ ] Passer de `/admin/cocktails/3` à `/admin/cocktails/new` vide le formulaire.
- [ ] Une ligne d'ingrédient sans source ou avec quantité ≤ 0 bloque l'envoi et affiche l'erreur sur la ligne ; aucune requête ne part.
- [ ] Supprimer la 2ᵉ ligne d'ingrédients sur 3 conserve les valeurs saisies de la 3ᵉ.
- [ ] Double clic sur « Enregistrer » en création : un seul `POST /api/cocktails`.
- [ ] `CocktailsPage.tsx` ≤ 200 lignes, `CocktailFormPage.tsx` ≤ 150 lignes, plus de `split(',')` dans les deux pages.
- [ ] Plus de `confirm(` ni de `console.error` dans les deux pages.
- [ ] Couverture de `CocktailFormPage` et des composants extraits ≥ 80 % (34 % aujourd'hui).

## Tests à ajouter ou adapter

- `cocktailFormSchema.test.ts` : chaque source valide et invalide, `toCocktailInput` (tags, instructions vides retirées, champs des autres sources à `null`), `fromCocktail` sur un cocktail complet.
- `CocktailFormPage.test.tsx` à réécrire : chargement en édition sans unités ; ajout et suppression de lignes ; changement de source ; validation qui bloque l'envoi ; création puis navigation ; échec d'upload → toast et pas de seconde création ; passage `:id` → `new`. Supprimer le test sur la classe CSS de grille (`CocktailFormPage.test.tsx:93`), qui teste l'implémentation.
- `CocktailsPage.test.tsx` : suppression via `alertdialog`, échec d'export → toast, sélection puis export.
- `TagList.test.tsx` / `parseTags` : chaîne vide, espaces, `null`. `useSelection.test.ts`.

## Points d'attention

- `queries/` est partagé avec E-05 : pas en parallèle. Ajouter E-05 aux dépendances est conseillé.
- Le contrat `Cocktail.tags: string` en lecture contre `CocktailInput.tags: string[]` en écriture reste asymétrique ; `parseTags` le masque côté front, F-05 le corrigera.
- A-03 change le `PUT /cocktails/:id` côté backend (transaction, mise à jour partielle). Vérifier que le front envoie toujours la recette complète, sinon une mise à jour partielle pourrait vider des lignes.
- `react-hook-form` et `zod` ne doivent pas arriver dans le chunk public : vérifier après build qu'ils sont dans le chunk de `CocktailFormPage` (E-01).

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
