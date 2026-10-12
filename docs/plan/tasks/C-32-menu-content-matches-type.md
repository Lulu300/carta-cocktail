---
id: C-32
title: "Menus : refuser des cocktails dans une carte de bouteilles"
phase: C
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-06]
touches: [backend/src/routes/menus.ts, backend/src/routes/menus.test.ts, backend/src/i18n/]
sources: []
branch:
pr:
---

## Contexte

C-06 a figé le type d'une carte non système après sa création (décision « Type figé ») pour qu'une carte de bouteilles ne contienne jamais de cocktails, ni une carte de cocktails de bouteilles. Côté bouteilles, `assertBottlesAllowed` refuse déjà une bouteille dans une carte `COCKTAILS`. L'autre sens reste ouvert. Relevé à la revue de la PR #99 (point 7).

## Problème constaté

- `routes/menus.ts`, `PUT /menus/:id` : le champ `cocktails` est accepté quel que soit le type de la carte. Une carte `APEROS` ou `DIGESTIFS`, système ou personnelle, peut donc recevoir des cocktails par l'API. Comportement antérieur à C-06, non corrigé par cette tâche pour rester dans son périmètre.
- Le frontend n'envoie `cocktails` que depuis `MenuEditPage` (cartes `COCKTAILS`) : défaut latent, accessible par l'API seulement.
- La carte publique d'une carte de bouteilles n'affiche pas ces cocktails, mais ils comptent dans `_count.cocktails` et rendent le cocktail accessible aux invités (`buildPublicCocktailWhere` regarde toute carte publique).

## Ce qu'il faut faire

1. `PUT /menus/:id` : `cocktails` non vide sur une carte dont le type n'est pas `COCKTAILS` → 400 avec une clé i18n dédiée (ex. `errors.cocktailNotAllowedInMenu`), avant toute écriture. Une liste vide reste acceptée (elle vide la carte), comme pour `assertBottlesAllowed`.
2. Placer la vérification à côté de `assertBottlesAllowed` (même règle « contenu conforme au type »), sans dupliquer la lecture du type.
3. Clés en/fr.
4. Mesurer sur le jeu d'essai si des cartes de bouteilles contiennent déjà des cocktails (`SELECT COUNT(*) FROM MenuCocktail mc JOIN Menu m ON m.id = mc.menuId WHERE m.type <> 'COCKTAILS';`). S'il y en a, décider avec l'humain s'il faut les retirer par une migration de données.

## Critères d'acceptation

- [ ] Une carte `APEROS` ou `DIGESTIFS` ne peut pas recevoir de cocktails par `PUT /menus/:id` (400, composition inchangée).
- [ ] Une carte `COCKTAILS` se comporte comme avant.

## Tests à ajouter ou adapter

- `menus.test.ts` : `cocktails` sur la carte apéritifs et sur une carte personnelle `DIGESTIFS` → 400 et aucune ligne `MenuCocktail` ; `cocktails: []` sur une carte de bouteilles → 200 ; carte `COCKTAILS` inchangée.

## Points d'attention

- Les cocktails déjà présents dans une carte de bouteilles (s'il y en a) ne sont pas retirés par ce contrôle : voir l'étape 4.

## Journal

- 2026-10-12 : tâche créée à partir de la revue de la PR #99 (C-06, point 7).
