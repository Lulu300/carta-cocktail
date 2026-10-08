---
id: A-03
title: "PUT /cocktails/:id : ne plus vider la recette (transaction, mise à jour partielle)"
phase: A
lane: backend
criticite: critique
effort: S
status: done
owner: agent
depends_on: []
touches: [backend/src/routes/cocktails.ts, backend/src/routes/cocktails.test.ts]
sources: ["01-backend-routes.md §C2", "02-backend-data-perf.md §4.3"]
branch: fix/A-03-cocktail-put-transaction
pr: 34
---

## Contexte

Un `PUT /api/cocktails/:id` qui ne contient pas `ingredients` vide la recette. Une erreur en cours de route (unité inconnue, cocktail inexistant) laisse le cocktail sans ingrédients ni instructions. L'UI actuelle envoie toujours le formulaire complet, donc le bug ne se voit pas encore. Il frappera dès qu'un bouton de disponibilité, un script ou un futur écran enverra une mise à jour partielle.

## Problème constaté

`backend/src/routes/cocktails.ts:505-556` :
- l.512-513 : `deleteMany` sur les ingrédients et les instructions, **sans condition**. La recréation n'a lieu que si `ingredients` (l.523) ou `instructions` (l.539) est fourni. `PUT { isAvailable: false }` efface donc la recette.
- l.509 et l.521 : `tags: tagsString` est toujours écrit, avec `tags ?? ''`. Un PUT sans `tags` efface les tags.
- Pas de transaction : si `prisma.cocktail.update` (l.515) échoue (clé étrangère invalide sur `unitId`, `text` non textuel, id inexistant donnant P2025), les suppressions sont déjà faites. Le client reçoit 500 et la recette est perdue.
- Id inexistant : les `deleteMany` passent, l'`update` lève P2025, réponse 500 au lieu de 404.
- Le mapping ingrédients/instructions est écrit deux fois : POST (l.473-492) et PUT (l.523-546).
- Tests existants (`backend/src/routes/cocktails.test.ts:127-155` et `467-503`) : ils envoient soit `name` seul sur un cocktail sans ingrédients, soit un payload complet. Aucun ne vérifie que la recette est conservée.
- Le front (`frontend/src/pages/admin/CocktailFormPage.tsx:138-158`) envoie toujours `tags`, `ingredients` et `instructions` : pas de régression attendue côté UI.

## Ce qu'il faut faire

1. Vérifier l'existence : `findUnique({ where: { id }, select: { id: true } })`. Absent : 404 `errors.notFound`.
2. Construire `data` champ par champ et n'écrire que ce qui est fourni (`!== undefined`) :
   - `tags` seulement si `tags !== undefined` (tableau joint par `,`, chaîne telle quelle, `null` donne `''`) ;
   - `ingredients` seulement si `Array.isArray(ingredients)`, en écriture imbriquée `{ deleteMany: {}, create: [...] }` ;
   - `instructions` sur le même modèle.
3. Une seule écriture imbriquée Prisma est atomique, pas besoin d'enchaîner plusieurs appels :
   ```ts
   const cocktail = await prisma.cocktail.update({
     where: { id },
     data: {
       ...(name && { name }),
       ...(description !== undefined && { description }),
       ...(notes !== undefined && { notes }),
       ...(tags !== undefined && { tags: toTagsString(tags) }),
       ...(isAvailable !== undefined && { isAvailable }),
       ...(Array.isArray(ingredients) && {
         ingredients: { deleteMany: {}, create: ingredients.map(mapIngredient) },
       }),
       ...(Array.isArray(instructions) && {
         instructions: { deleteMany: {}, create: instructions.map(mapInstruction) },
       }),
     },
     include: cocktailIncludes,
   });
   ```
   Si l'implémentation garde plusieurs appels, les placer dans `prisma.$transaction(async (tx) => ...)`.
4. Extraire `mapIngredient` et `mapInstruction` en fonctions locales, utilisées par POST et PUT. Garder la logique actuelle (`text: inst.text || inst`) : la validation viendra avec C-04.
5. Erreurs Prisma traitées localement en attendant C-03 : P2025 donne 404, P2003 (clé étrangère) donne 400 `errors.validationError`, le reste 500.

Hors périmètre : validation par schéma (C-04) ; couche service, DELETE, upload et cycle de vie des images (C-09).

## Critères d'acceptation

- [x] `PUT { isAvailable: false }` sur un cocktail complet : ingrédients, instructions, tags et bouteilles préférées inchangés.
- [x] `PUT { name }` sans `tags` : tags conservés. `PUT { tags: [] }` : tags vidés.
- [x] `PUT { ingredients: [] }` vide explicitement les ingrédients et garde les instructions.
- [x] `PUT` avec un `unitId` inexistant : 400, recette intacte en base.
- [x] `PUT` sur un id inexistant : 404.
- [x] Le formulaire d'édition de l'UI fonctionne comme avant (création, édition, ajout et suppression d'ingrédients).

## Tests à ajouter ou adapter

`backend/src/routes/cocktails.test.ts`, bloc `PUT /api/cocktails/:id` :
- Fixture : cocktail créé via `POST /api/cocktails` avec deux ingrédients (dont un `CATEGORY` avec `preferredBottleIds`), deux instructions et les tags `['rhum', 'frais']`.
- `PUT { isAvailable: false }` : 200, `ingredients.length === 2`, `instructions.length === 2`, `tags === 'rhum,frais'`, `preferredBottles` présents.
- `PUT { name: 'X' }` : tags conservés.
- `PUT { tags: [] }` : `tags === ''`.
- `PUT { ingredients: [{ ..., unitId: 99999 }] }` : 400, puis GET : les deux ingrédients d'origine sont là.
- `PUT /api/cocktails/99999 { name: 'X' }` : 404.
- `PUT { ingredients: [] }` : zéro ingrédient, instructions conservées.

## Points d'attention

- Le front envoie `description: description || undefined` et `notes: notes || undefined` (`CocktailFormPage.tsx:140-141`) : vider ces champs dans l'UI ne les vide pas en base. Bug préexistant, non aggravé ici. À traiter dans E-06 (envoyer `null`).
- Ne pas changer la forme de la réponse (`parseNameTranslations(cocktail)` avec `cocktailIncludes`) : le front l'utilise.
- Vérifier que la violation de clé étrangère sous SQLite remonte bien en P2003 avec Prisma 6. Sinon, adapter le mapping et le test.
- C-09 déplacera ce handler dans un service : garder le changement petit.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : traitée dans la PR #34 (branche `fix/A-03-cocktail-put-transaction`). Un seul `prisma.cocktail.update` avec écritures imbriquées `{ deleteMany: {}, create }` seulement si le tableau est fourni, `tags` écrit seulement s'il est fourni, P2025 → 404, P2003 → 400. `mapIngredient`, `mapInstruction` et `toTagsString` sont partagés par POST et PUT. Écart : pas de `findUnique` préalable, car l'`update` lève déjà P2025 pour un id absent (testé). P2003 confirmé sous SQLite/Prisma 6 (unité et bouteille préférée inconnues). UI : `CocktailFormPage` est le seul appelant et envoie toujours `tags`, `ingredients` et `instructions` en tableaux, donc comportement inchangé (vérifié par lecture du code, pas de test manuel). 9 tests ajoutés, couverture des lignes modifiées 100 %.
