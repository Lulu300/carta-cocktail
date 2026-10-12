---
id: B-14
title: "Reformatage Prettier du dépôt en un commit isolé"
phase: B
lane: deps
criticite: basse
effort: S
status: todo
owner: mixed
depends_on: [B-05]
touches: [backend/, frontend/, .git-blame-ignore-revs, AGENTS.md, backend/AGENTS.md, frontend/AGENTS.md]
sources: []
branch:
pr:
---

## Contexte

B-05 a posé `.editorconfig`, `.prettierrc` (2 espaces, quotes simples, point-virgule, largeur 100, virgules finales) et un script `npm run format:check` dans les deux paquets, sans reformater le code : un reformatage massif aurait créé des conflits avec toutes les branches ouvertes.

## Problème constaté

Le 2026-10-12, `prettier --list-different` signale 210 des 286 fichiers `.ts`/`.tsx` de `backend/src` et `frontend/src` (75 fichiers pour `npm run format:check` dans `backend/`). `format:check` échoue donc dans les deux paquets.

## Ce qu'il faut faire

1. **Humain** : choisir un moment où aucune autre branche de tâche n'est ouverte (sinon chaque branche aura des conflits sur presque tous ses fichiers).
2. `npx prettier --write . --ignore-path .gitignore --ignore-path ../.prettierignore` dans `backend/` puis dans `frontend/` (ajouter au passage un script `format` qui fait la même chose).
3. Vérifier `npm run lint`, `npx tsc --noEmit`, `npm test` et `npm run build` dans les deux paquets.
4. Committer le reformatage **seul** (`style: format the repository with Prettier`), puis ajouter son SHA à `.git-blame-ignore-revs` dans un second commit, avec un commentaire. Ne pas squasher la PR au merge : le SHA doit rester valide (merge commit ou rebase).
5. Mettre à jour les `AGENTS.md` : `format:check` passe et doit rester vert. L'ajout de `format:check` en CI relève de D-04 ou d'une tâche CI.

## Critères d'acceptation

- [ ] `npm run format:check` vert dans `backend/` et `frontend/`.
- [ ] `.git-blame-ignore-revs` contient le SHA du commit de reformatage, tel qu'il est sur `develop`.
- [ ] Lint, `tsc`, tests et build verts dans les deux paquets.

## Tests à ajouter ou adapter

Aucun : le comportement ne change pas.

## Points d'attention

- Rappeler aux contributeurs `git config blame.ignoreRevsFile .git-blame-ignore-revs` (GitHub l'applique tout seul).
- Si le merge se fait en squash, le SHA change : mettre à jour `.git-blame-ignore-revs` après le merge.

## Journal

- 2026-10-12 : tâche créée par B-05, qui a posé la configuration Prettier sans reformater.
