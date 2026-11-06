---
id: B-15
title: "Export ZIP par lot : les recettes de même nom s'écrasent dans l'archive"
phase: B
lane: frontend
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: []
touches: [frontend/src/services/exportZip.ts, frontend/src/services/exportZip.test.ts, frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/components/ui/ExportCocktailButton.tsx, frontend/src/components/ui/ExportCocktailButton.test.tsx, frontend/src/components/admin/cocktails/CocktailActions.tsx, frontend/src/pages/public/CocktailPublicPage.tsx, frontend/src/pages/admin/CocktailsPage.tsx, frontend/src/pages/admin/CocktailsPage.test.tsx]
sources: ["02-backend-data-perf.md §4.3"]
branch: feature/B-15-zip-export-name-collision
pr: "#111"
---

## Contexte

L'export par lot (admin → Cocktails → Export par lot → Exporter ZIP) écrit chaque recette dans `cocktail-<slug>.json`, le slug venant du nom. Les noms de cocktail ne sont pas uniques (décision validée, voir C-07 et C-09) : deux recettes peuvent porter le même nom.

## Problème constaté

- `services/exportZip.ts` appelle `zip.file()` avec le nom `cocktail-<slug>.json` pour chaque recette. JSZip remplace une entrée de même nom : quand deux cocktails donnent le même slug, l'archive n'en contient qu'un, sans message.
- Constaté pendant B-06 (2026-10-12) sur le build de production : 8 cocktails sélectionnés (quatre « Mojito B06 », quatre « Negroni B06 »), bouton « Export ZIP (8) », archive de 2 fichiers.
- Le même slug sert aussi pour des noms différents : le slug ne garde que `[a-z0-9]`, donc « Piña Colada » et « Pi a Colada » donnent `pi-a-colada`, et tout nom sans lettre latine donne `cocktail-.json`.

## Ce qu'il faut faire

1. Rendre chaque nom de fichier unique dans l'archive : suffixe `-2`, `-3`… quand le nom est déjà pris (ou l'`id` du cocktail), et un nom de repli (`cocktail-<id>`) quand le slug est vide.
2. Garder le format des fichiers inchangé : l'import (`ImportStepUpload`) lit tous les `.json` de l'archive, quel que soit leur nom.

## Critères d'acceptation

- [x] Un export de N cocktails produit toujours N fichiers, noms identiques compris.
- [x] Un nom sans lettre latine donne un nom de fichier non vide.
- [x] L'archive se réimporte entière (N recettes trouvées).

## Tests à ajouter ou adapter

- `exportZip.test.ts` : deux cocktails de même nom → deux appels `zip.file` avec des noms distincts ; nom entièrement non latin → nom de repli.

## Points d'attention

- C-09 (en cours) crée côté backend un `exportFilename(name)` partagé pour l'export unitaire. Le frontend ne peut pas l'importer : reprendre la même règle de slug si elle change, sans dupliquer plus que nécessaire.
- Le slug qui retire les accents est noté dans `02-backend-data-perf.md` §4.3 (P3) ; une translittération (`normalize('NFD')`) est possible ici mais reste facultative.

## Journal

- 2026-10-12 : tâche créée par B-06 (constat pendant la vérification manuelle de l'export ZIP, hors périmètre de sa PR).
- 2026-10-12 : revue de la PR #106 (C-09) : même cause côté export unitaire. `ExportCocktailButton.tsx:25` et `services/exportZip.ts:17` recalculent l'ancien slug au lieu d'utiliser le nom du serveur (`exportFilename` de C-09, en-tête `Content-Disposition`) : accents perdus (`cocktail-pi-a-colada.json`), nom non latin → `cocktail-.json`, d'où des collisions supplémentaires dans le ZIP. Reprendre la règle de `exportFilename` (repli `cocktail-<id>`) ou lire l'en-tête ; ajouter `ExportCocktailButton.tsx` à `touches` si besoin.
- 2026-10-12 : PR #111 « B-15: name ZIP entries after the server export filename ». Le frontend ne recalcule plus de slug : `cocktails.exportRecipe` et `publicApi.exportCocktail` renvoient `{ filename, data }`, le nom venant de l'en-tête `Content-Disposition` posé par `exportFilename` (C-09), avec le même repli `cocktail-<id>.json` si l'en-tête manque. Une seule règle de nommage, côté backend. `exportZip` ajoute `-2`, `-3`… aux noms déjà pris dans l'archive. `ExportCocktailButton` utilise le même nom (prop `cocktailName` supprimée) ; `exportCocktailsAsZip` ne prend plus la liste des cocktails. Lecture de l'en-tête factorisée dans `attachmentFilename` (`api.ts`), reprise par les exports bouteilles et sauvegarde. `touches` élargi : `api.ts`, `ExportCocktailButton.tsx` (aussi listé par E-26), `CocktailActions.tsx`, `CocktailPublicPage.tsx`, `CocktailsPage.tsx` et leurs tests.
