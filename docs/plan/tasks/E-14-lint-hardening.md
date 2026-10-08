---
id: E-14
title: "Lint et TypeScript plus stricts, code mort supprimé"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [B-05, E-05, E-06]
touches: [frontend/eslint.config.js, frontend/tsconfig.app.json, frontend/package.json, frontend/src/]
sources: ["05-frontend-archi.md §8", "05-frontend-archi.md §5"]
branch:
pr:
---

## Contexte

La plupart des bugs relevés par la revue frontend (promesses rejetées sans `catch`, accès à un tableau hors limites, `!` sur une relation absente) auraient été signalés par des règles de lint ou de compilation existantes. Une fois les grosses refontes passées (E-05, E-06), cette tâche active ces règles pour que les mêmes erreurs ne reviennent pas, et supprime le code mort de `api.ts`.

## Problème constaté

- `frontend/eslint.config.js:10-21` : presets `recommended` seulement, pas de lint typé, `ecmaVersion: 2020` alors que `tsconfig.app.json` cible `ES2022`.
- `npm run lint` (`package.json`) n'a pas `--max-warnings=0` : un avertissement ne fait pas échouer la CI. Il y en a un aujourd'hui : directive inutile `SettingsPage.tsx:49` (vérifié avec `npx eslint src`).
- **Constat de la revue à corriger** : la revue écrit que `exhaustive-deps` n'est peut-être pas active. Elle l'est, en `warn`, via `reactHooks.configs.flat.recommended` (vérifié dans `eslint-plugin-react-hooks` 7.0.1). Si le motif `useEffect(() => { load(); }, [])` ne déclenche rien, c'est que ces fonctions `load` ne capturent que des valeurs stables (imports et `setState`) : la règle a raison de ne pas les signaler. Vérifié en isolant le motif dans un fichier de test.
- Pas de `@typescript-eslint/no-floating-promises` : cette règle aurait signalé tous les cas de `05-frontend-archi.md §H2`.
- 13 assertions non nulles `!` hors tests : `main.tsx:10`, `ImportBottlesWizard.tsx:270`, `CocktailFormPage.tsx:65, 158`, `MenuBottleEditPage.tsx:24, 40, 47`, `BottlesPage.tsx:34`, `MenuPublicPage.tsx:24, 32, 36, 166`, `PublicCocktailItem.tsx:24`. Plusieurs disparaîtront avec E-05 à E-08 et E-11.
- `tsconfig.app.json:20-25` : pas de `noUncheckedIndexedAccess`.
- Méthodes de `api.ts` jamais appelées : `categories.get` (`:68`), `bottles.get` (`:86`), `ingredients.get` (`:140`), `units.get` (`:154`), `menuBottles.listByMenu/create/delete` (`:209-215`), `menuSections.listByMenu` (`:222`), `availability.getCocktail` (`:254`). `menuSections.reorder` (`:229`) sera utilisée par E-07.

## Ce qu'il faut faire

1. Commencer par lister l'état réel : `npx eslint src` et `npx tsc --noEmit -p tsconfig.app.json` avec chaque nouvelle option activée localement, et noter le nombre d'erreurs par règle dans le Journal. Si le total dépasse environ 80, activer les règles une par une, un commit par règle.
2. `eslint.config.js` :
   ```js
   languageOptions: {
     ecmaVersion: 'latest',
     globals: globals.browser,
     parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
   },
   linterOptions: { reportUnusedDisableDirectives: 'error' },
   rules: {
     'react-hooks/exhaustive-deps': 'error',
     '@typescript-eslint/no-floating-promises': 'error',
     '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
     '@typescript-eslint/no-non-null-assertion': 'error',
   },
   ```
   Limiter le lint typé à `src/**/*.{ts,tsx}` ; `vite.config.ts` et `vitest.config.ts` relèvent de `tsconfig.node.json`. Les fichiers de test peuvent garder `no-non-null-assertion: off`.
3. `package.json` : `"lint": "eslint . --max-warnings=0"`.
4. `tsconfig.app.json` : `"noUncheckedIndexedAccess": true`. Corriger chaque accès signalé (`rows[index]`, `groups.get(key)`, `recipes[nextIndex]`…) par une garde explicite, pas par `!`.
5. Corriger les violations dans `src/` : `void` explicite seulement pour les appels volontairement non attendus (`void navigate(...)`), sinon `await` dans un `try/catch` ou mutation TanStack. `main.tsx:10` : garde `if (!root) throw new Error('#root introuvable')`.
6. Supprimer la directive inutile `SettingsPage.tsx:49` (initialiser `email` depuis `user` directement, comme le propose la revue).
7. Supprimer les méthodes mortes de `api.ts` qui ne sont toujours pas appelées au moment de la tâche (refaire le `grep`) et leurs tests dans `api.test.ts`.
8. Si A-10 ne l'a pas fait : helper `downloadBlob(blob, filename)` partagé par `bottles.exportFile`, `backup.exportBackup` et `exportZip.ts`, avec `URL.revokeObjectURL` différé (`setTimeout(..., 0)`), et `request()` qui renvoie `undefined` sur un 204.

## Critères d'acceptation

- [ ] `npm run lint` échoue dès le premier avertissement (`--max-warnings=0`) et passe sur `develop`.
- [ ] Les quatre règles du point 2 sont actives en `error`.
- [ ] `noUncheckedIndexedAccess: true` et `npx tsc --noEmit` passe.
- [ ] Aucun `!` d'assertion non nulle dans `src/` hors tests.
- [ ] Les méthodes de `api.ts` non appelées sont supprimées ; `grep` de chaque nom supprimé ne renvoie rien.
- [ ] Une promesse non attendue ajoutée volontairement dans une page (essai local, non committé) fait échouer le lint.
- [ ] Le temps de `npm run lint` est noté avant et après (le lint typé est plus lent).

## Tests à ajouter ou adapter

- `services/api.test.ts` : retirer les tests des méthodes supprimées ; si `downloadBlob` est ajouté, le tester (nom de fichier depuis `Content-Disposition` avec et sans guillemets, révocation différée avec `vi.useFakeTimers()`).
- Les corrections de garde (`noUncheckedIndexedAccess`) touchent des branches : ajouter un test pour chaque nouvelle branche non couverte, pour tenir les 80 % sur les lignes modifiées.
- Aucun test pour la configuration elle-même : la CI qui exécute `npm run lint` et `tsc` suffit.

## Points d'attention

- `touches` contient `src/` entier : les corrections de lint peuvent toucher n'importe quel fichier. Lancer cette tâche quand aucune autre tâche frontend n'est ouverte. Il est conseillé d'attendre aussi E-07 et E-08, qui réécrivent les fichiers les plus concernés (`MenuBottleEditPage`, `ImportBottlesWizard`).
- B-05 met ESLint et `typescript-eslint` à jour ; partir de sa configuration. E-10 ajoute `eslint-plugin-i18next` dans le même fichier : conflit facile à résoudre.
- `no-misused-promises` avec `checksVoidReturn` complet signale chaque `onClick={async () => …}`. L'option `attributes: false` évite ce bruit ; à revoir si l'équipe veut être plus stricte.
- Une règle qui interdit les couleurs en dur (`no-restricted-syntax` sur `/\[#[0-9a-fA-F]{6}\]/` dans `className`) serait utile après E-03, E-09 et E-11. L'ajouter ici seulement si `grep -rn "\[#" src` ne renvoie plus rien.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
