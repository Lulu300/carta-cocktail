---
id: E-28
title: "Primitive ui/Alert pour les blocs d'erreur et d'avertissement"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [E-08]
touches: [frontend/src/components/ui/Alert.tsx, frontend/src/components/ui/Alert.test.tsx, frontend/src/components/import/, frontend/src/pages/auth/LoginPage.tsx, frontend/src/pages/admin/ShortagesPage.tsx, frontend/src/pages/admin/DashboardPage.tsx]
sources: []
branch:
pr:
---

## Contexte

E-03 a créé les primitives de `components/ui/` (`Button`, `Badge`, `Field`, `Modal`…). Il n'existe pas de primitive pour un bloc de message coloré (erreur, avertissement, succès). Chaque écran recopie ses classes Tailwind. Relevé par la relecture de la PR #119 (E-08).

## Problème constaté

- Le bloc d'erreur rouge `bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm` est recopié dans 8 fichiers (`grep -rn "bg-red-500/10 border border-red-500/30" frontend/src`, hors tests) :
  - `components/import/ImportStepResolve.tsx`, `ImportStepUpload.tsx`, `BottleImportRowErrors.tsx`, `ImportBottlesWizard.tsx`, `BottleImportConfirmStep.tsx` ;
  - `pages/auth/LoginPage.tsx`, `pages/admin/ShortagesPage.tsx`, `pages/admin/DashboardPage.tsx`.
- Les blocs orange (avertissement) et verts (succès) des assistants d'import suivent le même schéma.
- Le `role` varie d'un fichier à l'autre (`alert`, rien). Les couleurs ne passent pas par les jetons du thème (`danger`, `warning`, `success`).

## Ce qu'il faut faire

1. `components/ui/Alert.tsx` : `tone: 'danger' | 'warning' | 'success' | 'info'`, `title?`, `children`. Couleurs tirées des jetons du thème, comme `Badge`. `role="alert"` pour `danger`, `role="status"` sinon.
2. Remplacer les 8 blocs rouges, puis les blocs orange et verts des assistants d'import.

## Critères d'acceptation

- [ ] `grep -rn "bg-red-500/10 border border-red-500/30" frontend/src` ne trouve plus rien hors tests.
- [ ] Le rendu des écrans concernés est inchangé (mêmes couleurs, à la nuance des jetons près).
- [ ] Couverture ≥ 80 % sur les lignes modifiées.

## Tests à ajouter ou adapter

- `Alert.test.tsx` : rôle selon le ton, titre facultatif.
- Tests existants des pages et des assistants : inchangés (ils cherchent le texte, pas les classes).

## Points d'attention

- E-09 (accessibilité) touche aussi `pages/` : enchaîner.

## Journal

- 2026-10-12 : tâche créée par E-08, à partir de la relecture de la PR #119.
