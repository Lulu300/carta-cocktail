---
id: C-19
title: "Imports : ne pas créer une catégorie ou une unité qui existe à la casse près"
phase: C
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-07, C-09, C-10]
touches: [backend/src/routes/cocktails.ts, backend/src/routes/bottles.ts, backend/src/services/cocktail/, backend/src/i18n/]
sources: ["02-backend-data-perf.md §2.4"]
branch:
pr:
---

## Contexte

C-07 a rendu `Category.name` et `Unit.abbreviation` uniques en base, et les routes `categories.ts` et `units.ts` refusent un nom ou une abréviation qui existe à la casse près (`assertUniqueIgnoringCase`, `backend/src/utils/uniqueness.ts`). Les imports créent ces lignes par un autre chemin.

## Problème constaté

- Import de cocktail (`cocktails.ts`, résolution `create` des catégories et des unités) et import de bouteilles (`bottles.ts`, `/import/confirm`, résolution `create` des catégories) : `tx.category.create` / `tx.unit.create` sans contrôle.
- Nom identique : l'index unique lève P2002, tout l'import est refusé avec le 409 générique « Cette entrée existe déjà », sans dire quelle catégorie pose problème.
- Nom identique à la casse près (« rhum » quand « Rhum » existe) : la création passe et crée le doublon que les routes interdisent. `scripts/check-integrity.ts` le signale ensuite comme bloquant.

## Ce qu'il faut faire

1. Dans les deux imports, avant de créer une catégorie ou une unité, chercher une ligne existante à la casse près : la réutiliser (comme `use_existing`) ou refuser avec un 409 qui nomme la ligne, selon le choix fait pour l'aperçu.
2. Réutiliser `assertUniqueIgnoringCase` ou une variante qui renvoie la ligne trouvée, sans dupliquer la comparaison.

## Critères d'acceptation

- [ ] Un import qui demande à créer « rhum » quand « Rhum » existe ne crée pas de doublon.
- [ ] Le message d'erreur éventuel nomme la catégorie ou l'unité en cause (i18n en et fr).

## Tests à ajouter ou adapter

- Import de cocktail et import de bouteilles : création d'une catégorie existante à la casse près ; création d'une unité existante à la casse près (import de cocktail).

## Points d'attention

- C-09 (service cocktail) et C-10 (import de bouteilles) réécrivent ces chemins : faire cette tâche après eux, ou l'intégrer à leur PR si elle est encore ouverte.

## Journal

- 2026-10-10 : tâche créée pendant C-07 (les imports contournent le contrôle d'unicité insensible à la casse des routes).
