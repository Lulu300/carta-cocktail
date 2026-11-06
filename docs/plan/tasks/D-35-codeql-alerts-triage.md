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

D-07 a activé CodeQL en « default setup », check non obligatoire. Aucune alerte n'a jamais été triée : aucune n'est fermée ni écartée. À la release v1.12.0, la PR #161 (`develop` → `main`) avait tous ses checks requis verts, mais le check `CodeQL` rouge, pour 2 nouvelles alertes `high` dans le code qu'elle apportait.

## Décisions validées

- 2026-11-06, humain, sur la PR #161 : « Merge, triage task — Merge #161 as is (CodeQL is not required). New plan task to triage all CodeQL alerts (these 2 + the 30 on main). »

## Problème constaté

- Les 2 nouvelles alertes de la PR #161, jugées faux positifs par le coordinateur :
  - `backend/src/services/cocktail/cocktailImage.ts` (`unlink` de `deleteFileQuietly`), « Uncontrolled data used in path expression » : le chemin vient soit de multer (nom aléatoire `randomUUID`), soit de `safeUploadPath`, qui n'accepte qu'un nom de fichier nu (`path.basename(name) === name`, ni `.` ni `..`). CodeQL ne reconnaît pas ce contrôle comme un assainissement.
  - `frontend/src/components/admin/cocktails/ImagePicker.tsx` (`<img src>`), « DOM text reinterpreted as HTML » : `src` reçoit une URL `blob:` de `URL.createObjectURL(file)`, qui ne peut pas exécuter de script dans un `<img>`.
- Les alertes déjà ouvertes sur `main` avant la PR (30 au total au 2026-11-06, 24 sur `refs/heads/main` après le merge) : `js/missing-rate-limiting` (routes Express ; un limiteur global existe-t-il ?), `js/loop-bound-injection` (`backend/src/utils/bottlesImport.ts`), `js/clear-text-logging` (`backend/src/bootstrap/ensureAdmin.ts`).

## Ce qu'il faut faire

1. Lister les alertes ouvertes (`gh api repos/Lulu300/carta-cocktail/code-scanning/alerts?state=open`), les regrouper par règle et par fichier.
2. Pour chaque groupe, établir les faits dans le code : vrai problème, faux positif (avec la raison), ou risque accepté.
3. Vrais problèmes : une tâche par correctif (ou la correction ici si elle est petite et dans le périmètre).
4. Faux positifs et risques acceptés : proposer à l'humain la liste et le motif de chaque fermeture (« false positive », « won't fix », « used in tests »). La fermeture sur GitHub est visible dans l'onglet Security : action humaine, ou faite après son accord explicite.
5. Option à soumettre à l'humain : rendre le check `CodeQL` obligatoire une fois les alertes triées (ruleset 24936910, Journal de D-07).

## Critères d'acceptation

- [ ] Chaque alerte ouverte a un statut : corrigée, tâche créée, ou fermée avec un motif validé par l'humain.
- [ ] Les deux alertes de la PR #161 sont traitées.
- [ ] La décision sur le caractère obligatoire du check `CodeQL` est notée dans le Journal.

## Points d'attention

- Ne fermer aucune alerte sans l'accord de l'humain.
- Une réécriture faite seulement pour satisfaire CodeQL doit rester lisible et testée, et ne pas dupliquer `safeUploadPath`.

## Journal
