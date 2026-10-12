---
id: B-15
title: "Export ZIP par lot : les recettes de même nom s'écrasent dans l'archive"
phase: B
lane: frontend
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: []
touches: [frontend/src/services/exportZip.ts, frontend/src/services/exportZip.test.ts]
sources: ["02-backend-data-perf.md §4.3"]
branch:
pr:
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

- [ ] Un export de N cocktails produit toujours N fichiers, noms identiques compris.
- [ ] Un nom sans lettre latine donne un nom de fichier non vide.
- [ ] L'archive se réimporte entière (N recettes trouvées).

## Tests à ajouter ou adapter

- `exportZip.test.ts` : deux cocktails de même nom → deux appels `zip.file` avec des noms distincts ; nom entièrement non latin → nom de repli.

## Points d'attention

- C-09 (en cours) crée côté backend un `exportFilename(name)` partagé pour l'export unitaire. Le frontend ne peut pas l'importer : reprendre la même règle de slug si elle change, sans dupliquer plus que nécessaire.
- Le slug qui retire les accents est noté dans `02-backend-data-perf.md` §4.3 (P3) ; une translittération (`normalize('NFD')`) est possible ici mais reste facultative.

## Journal

- 2026-10-12 : tâche créée par B-06 (constat pendant la vérification manuelle de l'export ZIP, hors périmètre de sa PR).
