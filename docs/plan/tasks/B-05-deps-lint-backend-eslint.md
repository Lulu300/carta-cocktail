---
id: B-05
title: "Lint : ESLint 10 côté frontend, ESLint + Prettier côté backend"
phase: B
lane: deps
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [A-07]
touches: [frontend/package.json, frontend/package-lock.json, frontend/eslint.config.js, backend/package.json, backend/package-lock.json, backend/eslint.config.js, .prettierrc, .prettierignore, .editorconfig]
sources: ["08-dependencies.md §3.4", "07-devops-history.md §3.3", "05-frontend-archi.md §8"]
branch:
pr:
---

## Contexte

ESLint 9 est en fin de vie depuis le 6 août 2026. Le backend n'a ni linter ni formateur : aucune règle n'attrape les promesses non attendues, les variables mortes ou les `any` qui prolifèrent dans les routes. Poser le lint maintenant évite que les gros refactors (C-03, C-04, E-05) se fassent sans garde-fou.

## Problème constaté

- `frontend/package.json` : eslint 9.39, `@eslint/js` 9, `globals` 16, `eslint-plugin-react-refresh` 0.4.26.
- `frontend/eslint.config.js` est déjà en flat config (`defineConfig`, `globalIgnores`) ; l'import par défaut `reactRefresh.configs.vite` reste valable en 0.5.7.
- `backend/package.json` : aucun script `lint`, aucune dépendance ESLint ou Prettier. Pas de `.editorconfig` ni de Prettier à la racine.
- ESLint 10 ajoute à `recommended` : `no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error`.

## Ce qu'il faut faire

1. **Frontend** : `npm install -D eslint@^10 @eslint/js@^10 globals@^17 eslint-plugin-react-refresh@^0.5.7`. Lancer `npm run lint`, corriger les nouvelles erreurs (pas de désactivation de règle sans justification en commentaire).
2. **Backend** :
   - `npm install -D eslint@^10 @eslint/js@^10 typescript-eslint globals@^17` ;
   - créer `backend/eslint.config.js` sur le modèle du frontend : `js.configs.recommended`, `tseslint.configs.recommended`, `globals.node`, ignorer `dist/` et `coverage/` ;
   - script `"lint": "eslint ."` ;
   - corriger les erreurs. Les `any` existants peuvent passer en `warn` pour cette PR (ils disparaîtront avec C-04) : le noter dans `eslint.config.js`.
3. **Formatage** : `.editorconfig` et `.prettierrc` à la racine, reprenant le style actuel (2 espaces, quotes simples, point-virgule, largeur 100 — vérifier sur le code existant). Ajouter `prettier` en devDependency des deux paquets et un script `format:check`. **Ne pas reformater tout le dépôt dans cette PR** : un reformatage massif créerait des conflits avec toutes les tâches en cours. Le prévoir comme commit isolé quand aucune autre branche n'est ouverte, et l'ajouter alors à `.git-blame-ignore-revs`.
4. Mettre à jour `AGENTS.md` (commande `npm run lint` côté backend). L'ajout du lint backend en CI est fait dans D-04.

## Critères d'acceptation

- [ ] ESLint 10 dans les deux paquets, `npm run lint` vert des deux côtés.
- [ ] `backend/eslint.config.js` présent et documenté.
- [ ] `.editorconfig` et `.prettierrc` présents, `npm run format:check` existe (il peut échouer tant que le reformatage n'est pas fait : le dire dans la PR).
- [ ] Aucune règle désactivée globalement sans commentaire.

## Tests à ajouter ou adapter

Aucun. Les tests existants doivent rester verts après les corrections de lint.

## Points d'attention

- Les corrections de lint backend touchent beaucoup de fichiers de routes : ne pas lancer cette tâche en même temps que C-02 ou C-03. `build.mjs --ready` le signale via les fichiers touchés uniquement si on ajoute `backend/src/` à `touches` : l'ajouter si les corrections dépassent quelques lignes.
- Le durcissement des règles frontend (`exhaustive-deps`, `no-floating-promises`) est fait plus tard dans E-14.

## Journal

- 2026-10-08 : tâche créée à partir du rapport de dépendances et de la revue DevOps.
