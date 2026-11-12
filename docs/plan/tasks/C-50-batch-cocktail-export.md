---
id: C-50
title: "Export ZIP des cocktails en requêtes groupées, sous la limite de débit de l'API"
phase: C
lane: backend
criticite: basse
effort: S
status: review
owner: agent
depends_on: [C-47]
touches: [backend/src/routes/cocktails.ts, backend/src/routes/cocktails.test.ts, backend/src/services/cocktail/cocktailExport.ts, backend/src/validation/cocktails.ts, frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/services/exportZip.ts, frontend/src/services/exportZip.test.ts, frontend/src/test/msw/handlers.ts]
sources: []
branch: feature/C-50-batch-cocktail-export
pr: #177
---

## Contexte

La relecture des notes de v1.13.0 (PR #174, « User-visible gaps » 2) a relevé deux actions de l'admin qui envoient une requête par élément et peuvent atteindre à elles seules la limite de C-47 (`API_RATE_LIMIT`, 600 requêtes par minute et par adresse) : l'export ZIP des cocktails et l'éditeur de bouteilles d'une carte. L'humain a choisi un correctif dans le code avant la rc. Cette tâche traite l'export ; l'éditeur de bouteilles est traité par E-40.

## Problème constaté

`exportCocktailsAsZip` (`frontend/src/services/exportZip.ts`) envoie en parallèle un `GET /api/cocktails/:id/export` par cocktail sélectionné, et la page des cocktails a un « Tout sélectionner ». Avec quelques centaines de cocktails, plus les autres requêtes de la minute, une partie des requêtes reçoit un 429 : `Promise.all` échoue et l'admin voit « Too many requests » au lieu de son ZIP.

## Ce qu'il faut faire

1. Backend : `POST /api/cocktails/export` avec `{ ids }` (schéma zod `CocktailExportBatch`, au plus `MAX_EXPORT_BATCH` = 500 ids) renvoie `[{ filename, data }]` dans l'ordre des ids. `exportCocktails()` (`services/cocktail/cocktailExport.ts`) charge les cocktails en une requête et construit chaque fichier avec la même fonction que `exportCocktail()`. Un id inconnu donne 404 pour tout le lot, comme l'échec du `Promise.all` aujourd'hui.
2. Frontend : `cocktails.exportRecipes(ids)` (`services/api.ts`) ; `exportCocktailsAsZip` découpe la sélection en lots de 500, envoyés l'un après l'autre, et garde le ZIP côté navigateur avec `uniqueFilename` (mêmes noms, même contenu).

Pourquoi le ZIP reste dans le navigateur : le backend aurait dû refaire les suffixes `-2`, `-3` de `uniqueFilename`, et le frontend télécharger un binaire au lieu de JSON. Renvoyer les JSON ne change que le transport : JSZip, les noms et le téléchargement restent les mêmes, et l'export d'un seul cocktail (`GET /:id/export`) ne change pas.

## Critères d'acceptation

- [x] Exporter N cocktails envoie `ceil(N / 500)` requêtes, quel que soit N.
- [x] Les fichiers du lot sont ceux de l'export unitaire (même JSON hors `exportedAt`, même nom), dans l'ordre de la sélection.
- [x] Un id inconnu donne 404 ; un corps invalide (liste vide, plus de 500 ids, id non entier positif ou en texte) donne 400.
- [x] Le bundle public n'augmente que de la nouvelle entrée de `api.ts` (mesurée dans la PR) ; JSZip reste chargé à la demande.
- [x] `npm test`, lint et `tsc` passent dans les deux paquets.

## Tests à ajouter ou adapter

- `backend/src/routes/cocktails.test.ts` : `POST /api/cocktails/export` (401 sans token, fichiers identiques à l'export unitaire et dans l'ordre, noms en double laissés au frontend, 404 pour un id inconnu, 500 ids acceptés et 501 refusés, corps invalides).
- `frontend/src/services/exportZip.test.ts` : une requête par lot, découpage d'une sélection de 501 cocktails dans l'ordre, échec sans téléchargement quand un cocktail n'existe plus ; tests existants des noms uniques adaptés au lot.
- `frontend/src/services/api.test.ts` : `exportRecipes` envoie `POST /api/cocktails/export` avec `{ ids }`.

## Points d'attention

- `EXPORT_BATCH_SIZE` (frontend) recopie `MAX_EXPORT_BATCH` (backend) en attendant le partage des schémas (F-05) ; les deux commentaires renvoient l'un à l'autre.
- Les lots partent l'un après l'autre : un seul export lourd à la fois sur la connexion SQLite.

## Journal

- 2026-11-12 : tâche créée et traitée à partir de la relecture de la PR #174 (choix de l'humain : « Code fix before the rc »). Diagnostic vérifié sur `develop` : un `GET /:id/export` par cocktail dans `exportZip.ts`, « Tout sélectionner » dans `CocktailsPage.tsx`.
- Notes de version : l'export ZIP de plusieurs cocktails envoie une requête par lot de 500 au lieu d'une par cocktail, et n'atteint plus la limite de débit de l'API.
