---
id: E-33
title: "Vitest : même sortie de test sous un agent et ailleurs"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: []
touches: [frontend/vitest.config.ts, frontend/AGENTS.md, backend/vitest.config.ts, backend/AGENTS.md]
sources: []
branch:
pr:
---

## Contexte

Relevé par la relecture de la PR #139 (E-13, 1/2). Vitest 5 choisit son reporter selon l'environnement. Quand `std-env` détecte un agent IA (`isAgent`), il prend le reporter `minimal`, qui n'affiche pas la console des tests verts. Un agent qui vérifie « aucun avertissement `act(...)` » ou « aucune requête MSW non prévue » avec `npm test` voit donc une sortie vide, alors que la CI affiche ces messages. Pendant E-13, 14 avertissements `act` sont passés inaperçus en local pour cette raison.

Décision de l'humain (2026-10-13) : la PR #139 ajoute tout de suite une ligne dans `frontend/AGENTS.md` (« sous un agent, lancer `npx vitest run --silent=false` pour voir la console »). Cette tâche-ci règle la configuration, pour que la sortie ne dépende plus de qui lance les tests.

## Problème constaté

- `frontend/node_modules/vitest/dist/chunks/defaults.*.js` (Vitest 5.0.3), ligne 67 : `reporters: [isAgent ? "minimal" : "default", ...process.env.GITHUB_ACTIONS === "true" ? ["github-actions"] : []]`.
- `frontend/vitest.config.ts` et `backend/vitest.config.ts` ne fixent ni `reporters` ni `silent` : les deux paquets suivent cette valeur par défaut (le backend est aussi en Vitest 5).
- Conséquence : `npm test` sous un agent masque les `console.error` et `console.warn` des tests verts (avertissements `act`, messages `[MSW]`, erreurs React). La même commande dans un terminal ou en CI les affiche.

## Ce qu'il faut faire

1. Dans les deux `vitest.config.ts`, fixer `test.reporters` à `['default']`, plus `'github-actions'` quand `process.env.GITHUB_ACTIONS === 'true'`, pour garder les annotations de la CI que la valeur par défaut ajoute aujourd'hui. Commenter le pourquoi (la valeur par défaut change sous un agent).
2. Vérifier sous un agent que `npm test` affiche la console des tests verts : par exemple, sur `develop` avant la (2/2) d'E-13, les 14 avertissements `act` de `SettingsPage.test.tsx` et `SiteSettingsContext.test.tsx`.
3. Mettre à jour `frontend/AGENTS.md` : la ligne ajoutée par la PR #139 (`npx vitest run --silent=false`) n'a plus lieu d'être, la retirer ou la remplacer par une phrase sur le reporter fixé. Ajouter la même phrase dans `backend/AGENTS.md` si elle est utile.

## Critères d'acceptation

- [ ] Sous un agent, `npm test` affiche la console des tests verts, dans `frontend/` comme dans `backend/`.
- [ ] Dans un terminal, la sortie de `npm test` est inchangée.
- [ ] En CI, les annotations `github-actions` restent présentes (vérifier sur la PR).
- [ ] `frontend/AGENTS.md` ne mentionne plus `--silent=false` comme contournement, ou le décrit comme facultatif.

## Tests à ajouter ou adapter

- Aucun test automatique : contrôle manuel de la sortie sous un agent et dans un terminal, à noter dans le Journal.

## Points d'attention

- Ne pas lancer en parallèle de la (2/2) d'E-13 : elle touche aussi `frontend/AGENTS.md` (et `frontend/src/test/`). Faire E-33 avant ou après, et vérifier que la ligne de #139 est toujours là au moment de la retirer.
- Ne pas toucher `silent` sans raison : le but est la même sortie partout, pas plus de bruit en CI.

## Journal

- 2026-10-13 : tâche créée à partir de la relecture de la PR #139 (E-13, 1/2) et de la décision de l'humain (« Les deux » : ligne dans `frontend/AGENTS.md` tout de suite, tâche séparée pour la configuration).
