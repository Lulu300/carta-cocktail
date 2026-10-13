---
id: E-32
title: "Convertisseur d'unités : quantités au format numérique de la langue"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [E-10]
touches: [frontend/src/utils/unitConverter.ts, frontend/src/utils/unitConverter.test.ts, frontend/src/components/ui/UnitConverter.tsx, frontend/src/components/ui/UnitConverter.test.tsx]
sources: []
branch:
pr:
---

## Contexte

La fiche cocktail publique (`CocktailPublicPage`) affiche chaque quantité avec `UnitConverter`, qui propose les autres unités convertibles. E-10 a fait passer les volumes en ml et les degrés par le formateur d'i18next (`{{value, number}}`), mais le convertisseur écrit ses nombres lui-même, au format anglais. Relevé par la relecture de la PR #134 (E-10).

## Problème constaté

- `frontend/src/utils/unitConverter.ts`, `formatQuantity` : `toFixed(1)`, `toFixed(2)` puis `parseFloat(...).toString()`. En français, le menu de conversion affiche « 3.33 cs » ou « 1.69 oz » au lieu de « 3,33 cs » et « 1,69 oz ».
- `UnitConverter.tsx` affiche aussi la quantité d'origine brute (`{quantity} {unitAbbr}`, lignes 36 et 85).
- Piège : `handleUnitSelect` relit la chaîne formatée (`setSelectedQuantity(parseFloat(formatted))`). Une chaîne « 3,33 » donnerait 3. Il faut garder le nombre (`conv.quantity`, déjà renvoyé par `getAllConversions`) et ne formater qu'à l'affichage.

## Ce qu'il faut faire

1. Séparer le calcul de l'affichage. `getAllConversions` renvoie le nombre arrondi à la précision voulue (même règles qu'aujourd'hui : 1 décimale sous 1 ml, entier ou 1 décimale pour le ml, 2 décimales au plus sinon). Le composant le formate avec `Intl.NumberFormat(i18n.language, { maximumFractionDigits })`, ou avec le formateur d'i18next (`t('…', { value })` sur une clé `{{value, number}}`).
2. Formater de la même façon la quantité d'origine et la quantité choisie.
3. Ne plus relire une chaîne formatée pour retrouver un nombre.

## Critères d'acceptation

- [ ] En français, le convertisseur affiche « 3,33 cs » et « 1,69 oz » ; en anglais, « 3.33 cs » et « 1.69 oz ».
- [ ] Choisir une unité puis revenir à l'unité d'origine donne les mêmes quantités qu'avant, dans les deux langues.
- [ ] Couverture ≥ 80 % sur les lignes modifiées.

## Tests à ajouter ou adapter

- `unitConverter.test.ts` : précision des nombres renvoyés, sans formatage.
- `UnitConverter.test.tsx` : affichage en français et en anglais (mock de `react-i18next` avec `i18n.language`), sélection d'une unité dont la quantité a des décimales.

## Points d'attention

- `UnitConverter` est dans le premier chargement de la carte publique : une clé ajoutée va dans le paquet public (`bundles.test.ts` le vérifie), et le budget de 140 kB doit rester respecté.

## Journal

- 2026-10-13 : tâche créée par E-10, à partir de la relecture de la PR #134.
