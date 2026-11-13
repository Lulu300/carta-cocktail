---
id: D-35
title: "Trier les alertes CodeQL ouvertes sur main"
phase: D
lane: ci
criticite: moyenne
effort: M
status: done
owner: mixed
depends_on: [D-07]
touches: [docs/plan/tasks/D-35-codeql-alerts-triage.md, docs/plan/tasks/C-47-api-rate-limiting.md, docs/plan/tasks/C-48-admin-reset-warning-no-value.md, docs/plan/tasks/D-36-codeql-required-on-main.md]
sources: []
branch: chore/D-35-codeql-alerts-triage
pr: https://github.com/Lulu300/carta-cocktail/pull/163
---

## Contexte

D-07 a activé CodeQL en « default setup », check non obligatoire. Aucune alerte n'a jamais été triée à la main : aucune n'a été écartée (`dismissed`). À la release v1.12.0, la PR #161 (`develop` → `main`) avait tous ses checks requis verts, mais le check `CodeQL` rouge, pour 2 nouvelles alertes `high` dans le code qu'elle apportait. Le merge a aussi corrigé 8 alertes anciennes.

## Décisions validées

- 2026-11-06, humain, à propos de la PR #161 : « Merge, triage task — Merge #161 as is (CodeQL is not required). New plan task to triage all CodeQL alerts (these 2 + the 30 on main). »
- 2026-11-12, humain : `js/missing-rate-limiting` (#6 à #22, #25, #26) → tâche C-47, un limiteur global large sur `/api` (routes publiques ≥ ~600 requêtes par minute et par IP, les clients d'un bar partageant une adresse) et un limiteur plus strict sur `/api/backup`, selon `TRUST_PROXY`. Les alertes encore ouvertes après l'arrivée de C-47 sur `main` seront fermées en « won't fix ».
- 2026-11-12, humain : #27 `js/clear-text-logging` → tâche C-48, l'avertissement d'`ensureAdmin` ne recopie plus la valeur de `ADMIN_RESET_PASSWORD`.
- 2026-11-12, humain : #4 et #32 `js/path-injection`, #31 `js/xss-through-dom`, #5 `js/incomplete-multi-character-sanitization` → fermeture en « false positive » autorisée, faite par le coordinateur après le merge de la PR de D-35, avec les commentaires du Journal.
- 2026-11-12, humain : check `CodeQL` obligatoire → « non pour l'instant » ; tâche D-36, CodeQL obligatoire sur `main` seulement, après C-47 et C-48.

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

- [x] Chaque alerte ouverte a un statut : tâche de correction créée, ou fermée avec un motif validé par l'humain.
- [x] Les deux alertes de la PR #161 sont traitées.
- [x] La décision sur le caractère obligatoire du check `CodeQL` est notée dans le Journal.

## Tests à ajouter ou adapter

Aucun pour le tri seul. Chaque tâche de correction créée prévoit ses propres tests.

## Points d'attention

- Ne fermer aucune alerte sans l'accord de l'humain.
- Une réécriture faite seulement pour satisfaire CodeQL doit rester lisible et testée, et ne pas dupliquer `safeUploadPath`.

## Journal

- 2026-11-12 : alertes relevées avec `gh api` (24 ouvertes sur `main`, analyse du commit `a49f5f3`, CodeQL 2.27.4) ; `develop` ne diffère de `main` que par des fichiers de `docs/plan/tasks/`, les faits valent donc pour les deux. Statut de chaque alerte :

  | Alerte | Règle | Emplacement | Statut |
  |---|---|---|---|
  | #6 à #18 | `js/missing-rate-limiting` | `backend/src/app.ts` l. 74 à 86 (routeurs protégés) | C-47 |
  | #19, #20 | `js/missing-rate-limiting` | `backend/src/routes/auth.ts` (`GET /me`, `POST /logout-all`) | C-47 |
  | #21, #22 | `js/missing-rate-limiting` | `backend/src/routes/backup.ts` (export, import) | C-47 |
  | #25 | `js/missing-rate-limiting` | `backend/src/routes/public.ts` (`router.use(optionalAuth)`) | C-47 |
  | #26 | `js/missing-rate-limiting` | `backend/src/routes/settings.ts` (`PUT /profile`) | C-47 |
  | #27 | `js/clear-text-logging` | `backend/src/bootstrap/ensureAdmin.ts` l. 49 | C-48 |
  | #4 | `js/path-injection` | `backend/src/routes/backup.ts` l. 58 | fermeture « false positive » autorisée |
  | #32 | `js/path-injection` | `backend/src/services/cocktail/cocktailImage.ts` l. 59 | fermeture « false positive » autorisée |
  | #31 | `js/xss-through-dom` | `frontend/src/components/admin/cocktails/ImagePicker.tsx` l. 35 | fermeture « false positive » autorisée |
  | #5 | `js/incomplete-multi-character-sanitization` | `docs/plan/build.mjs` l. 81 à 83 | fermeture « false positive » autorisée |

- 2026-11-12 : faits vérifiés pour les faux positifs.
  - #4 : `upload` de `backup.ts` est `multer({ dest: os.tmpdir() })` ; multer 2.5.0 (`storage/disk.js`) nomme le fichier `crypto.randomBytes(16).toString('hex')` et pose `file.path = path.join(destination, filename)`. Le nom du client n'entre pas dans le chemin.
  - #32 : `deleteFileQuietly` reçoit soit `file.path` de `imageUpload` (nom `crypto.randomUUID()` plus `extensionOf(file)` ; multer appelle `fileFilter` avant le stockage, et `isAcceptedImage` n'accepte que `.jpg`, `.jpeg`, `.png`, `.webp` avec leur type MIME), soit le résultat de `safeUploadPath`, qui refuse tout ce qui n'est pas un nom de fichier nu (ni `''`, ni `.`, ni `..`).
  - #31 : `src` vaut `previewUrl` (URL `blob:` de `URL.createObjectURL(file)`) ou `getUploadUrl(imagePath)` (chemin sous `<base>/uploads/`). Une source d'image n'est jamais interprétée comme du HTML et n'exécute pas de script.
  - #5 : dans `slugify()`, le `replace(/<[^>]+>/g, '')` signalé est suivi de `replace(/[^a-z0-9]+/g, '-')` : la sortie ne contient que `[a-z0-9-]`. Le script est un générateur local qui ne lit que des fichiers du dépôt (tâches, `docs/plan/README.md`, rapports de `docs/review/`, son modèle HTML) et les refs git (`git for-each-ref`).
- 2026-11-12 : commentaires de fermeture à reprendre tels quels par le coordinateur (motif « false positive ») :
  - #4 : « req.file.path in backend/src/routes/backup.ts (POST /import) is built by multer disk storage from os.tmpdir() and a random 32-hex file name: no client input reaches the path. »
  - #32 : « deleteFileQuietly in backend/src/services/cocktail/cocktailImage.ts gets multer's path (uploadDir + randomUUID() + one of the 4 extensions fileFilter accepts) or safeUploadPath(), which only accepts a bare file name. »
  - #31 : « frontend/src/components/admin/cocktails/ImagePicker.tsx sets <img src> to a blob: URL from URL.createObjectURL(file), or to a /uploads/ path from getUploadUrl(): an image source is never parsed as HTML and runs no script. »
  - #5 : « slugify() in docs/plan/build.mjs replaces every character outside [a-z0-9] with "-" after the flagged replace, so its output never contains "<". Local script that only reads the repository's own files and git refs. »
- 2026-11-12 : décision humaine sur le check `CodeQL` obligatoire : « non pour l'instant ». CodeQL (default setup) ne tourne que sur `main` et les PR vers `main`, et le ruleset 24936910 couvre `main` et `develop` : l'y ajouter bloquerait toutes les PR vers `develop`. Suite confiée à D-36 (ruleset sur `main` seul, après C-47 et C-48).
- 2026-11-12 : tâches créées : C-47, C-48, D-36. Aucune alerte fermée par cette tâche. `touches` complété avec les quatre fichiers de tâches modifiés ou créés.
- 2026-11-12 : tâche terminée, PR #163. Après le merge, le coordinateur ferme #4, #5, #31 et #32 avec les commentaires ci-dessus.
- 2026-11-12 : relecture de la PR #163 traitée : C-47 dit comment `backup.test.ts` reste vert (compteurs remis à zéro entre les tests) et l'ajoute à `touches`, monte le limiteur global après `i18nMiddleware` et avant les parseurs JSON, et le limiteur de `/api/backup` après `authMiddleware` (raison écrite dans la tâche), et liste la ligne `TRUST_PROXY` et la section « Login limit behind a reverse proxy » du README ; commentaire de fermeture de #5 corrigé (le script lit aussi d'autres fichiers du dépôt et les refs git) ; langages du default setup corrigés dans D-36.
