---
id: D-35
title: "Trier les alertes CodeQL ouvertes sur main"
phase: D
lane: ci
criticite: moyenne
effort: M
status: todo
owner: mixed
depends_on: [D-07]
touches: []
sources: []
branch:
pr:
---

## Contexte

D-07 a activé CodeQL en « default setup », check non obligatoire. Aucune alerte n'a jamais été triée à la main : aucune n'a été écartée (`dismissed`). À la release v1.12.0, la PR #161 (`develop` → `main`) avait tous ses checks requis verts, mais le check `CodeQL` rouge, pour 2 nouvelles alertes `high` dans le code qu'elle apportait. Le merge a aussi corrigé 8 alertes anciennes.

## Décisions validées

- 2026-11-06, humain, à propos de la PR #161 : « Merge, triage task — Merge #161 as is (CodeQL is not required). New plan task to triage all CodeQL alerts (these 2 + the 30 on main). »

## Problème constaté

Au 2026-11-06, après le merge : 24 alertes ouvertes sur `main`.

- Les 2 nouvelles alertes de la PR #161, jugées faux positifs par le coordinateur :
  - #32 `js/path-injection`, `backend/src/services/cocktail/cocktailImage.ts` (`unlink` de `deleteFileQuietly`) : le chemin vient soit de multer (nom `randomUUID()` plus une extension limitée à 4 valeurs par `fileFilter`), soit de `safeUploadPath`, qui n'accepte qu'un nom de fichier nu (`path.basename(name) === name`, ni `''`, ni `.`, ni `..`). CodeQL ne reconnaît pas ce contrôle comme un assainissement.
  - #31 `js/xss-through-dom`, `frontend/src/components/admin/cocktails/ImagePicker.tsx` (`<img src>`) : `src` reçoit une URL `blob:` de `URL.createObjectURL(file)`, qui ne peut pas exécuter de script dans un `<img>`.
- 22 alertes plus anciennes, encore ouvertes (sur les 30 ouvertes avant le merge, qui en a corrigé 8 : #1 et #2 `actions/missing-workflow-permissions`, #3 `js/xss-through-dom` dans `CocktailFormPage`, #23 et #24 `js/missing-rate-limiting` dans `cocktails.ts`, #28 à #30 `js/loop-bound-injection` dans `bottlesImport.ts`) :
  - 19 `js/missing-rate-limiting` (routes Express). Le seul limiteur est `loginLimiter` sur `/api/auth/login` (`backend/src/app.ts`, C-11) ; il n'y a pas de limiteur global.
  - 1 `js/clear-text-logging` (`backend/src/bootstrap/ensureAdmin.ts`).
  - 1 `js/path-injection` (#4, `backend/src/routes/backup.ts`, `fs.rmSync(req.file.path)`) : même motif de chemin multer que #32.
  - 1 `js/incomplete-multi-character-sanitization` (#5, `docs/plan/build.mjs`).

## Ce qu'il faut faire

1. Lister les alertes ouvertes (`gh api 'repos/Lulu300/carta-cocktail/code-scanning/alerts?state=open&per_page=100'`), les regrouper par règle et par fichier.
2. Pour chaque groupe, établir les faits dans le code : vrai problème, faux positif (avec la raison) ou risque accepté.
3. Vrais problèmes : une tâche par correctif, avec ses `touches`. Cette tâche ne modifie pas le code.
4. Faux positifs et risques acceptés : proposer à l'humain la liste et le motif de chaque fermeture (« false positive », « won't fix », « used in tests »). La fermeture sur GitHub est visible dans l'onglet Security : action humaine, ou faite après son accord explicite.
5. Option à soumettre à l'humain : rendre le check `CodeQL` obligatoire une fois les alertes triées (ruleset 24936910, Journal de D-07).

## Critères d'acceptation

- [ ] Chaque alerte ouverte a un statut : tâche de correction créée, ou fermée avec un motif validé par l'humain.
- [ ] Les deux alertes de la PR #161 sont traitées.
- [ ] La décision sur le caractère obligatoire du check `CodeQL` est notée dans le Journal.

## Tests à ajouter ou adapter

Aucun pour le tri seul. Chaque tâche de correction créée prévoit ses propres tests.

## Points d'attention

- Ne fermer aucune alerte sans l'accord de l'humain.
- Une réécriture faite seulement pour satisfaire CodeQL doit rester lisible et testée, et ne pas dupliquer `safeUploadPath`.

## Journal
