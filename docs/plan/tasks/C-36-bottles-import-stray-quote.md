---
id: C-36
title: "Import de bouteilles : un guillemet isolé dans un champ CSV fait disparaître des lignes"
phase: C
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-10]
touches: [backend/src/utils/bottlesImport.ts, backend/src/utils/bottlesImport.test.ts]
sources: []
branch:
pr:
---

## Contexte

C-10 (PR #113) a réécrit la lecture des CSV de l'import de bouteilles : découpage en enregistrements (`splitCsvRecords`), détection du séparateur, puis découpage en champs (`parseCsvLine`). Une ligne invalide est écartée et listée dans `errors`.

## Problème constaté

`splitCsvRecords` (et le comptage des séparateurs qui détecte `;` ou `,`) ouvre une zone entre guillemets sur n'importe quel `"`, alors que `parseCsvLine` ne la reconnaît qu'en début de champ. Constaté à la relecture de C-10 : `Bourbon 12" edition,700` suivi de deux lignes valides donne 0 bouteille et une seule erreur (ligne 2, `capacityMl`) ; les deux lignes suivantes, avalées dans le même enregistrement, disparaissent sans être signalées.

Le comportement est antérieur à C-10 (même logique dans l'ancien `splitCsvLines`). Excel double toujours les guillemets d'une cellule (RFC 4180), donc seuls les fichiers écrits à la main ou par un autre outil sont touchés.

## Ce qu'il faut faire

1. Dans `splitCsvRecords` et la détection du séparateur, n'ouvrir une zone entre guillemets qu'en début de champ (début de ligne ou juste après un séparateur), comme `parseCsvLine`. Un `"` au milieu d'un champ non entouré de guillemets est un caractère ordinaire.
2. Garder le reste du comportement de C-10 : `""` dans un champ entre guillemets, champs multilignes, `\r\n` conservé, numéros de ligne.

## Critères d'acceptation

- [ ] `Bourbon 12" edition,700` suivi de deux lignes valides importe trois bouteilles, la première avec le nom `Bourbon 12" edition`.
- [ ] Un champ entre guillemets multiligne et un `""` échappé se lisent comme avant (tests de C-10 inchangés et verts).
- [ ] Une ligne invalide après un guillemet isolé est signalée avec son bon numéro de ligne.

## Tests à ajouter ou adapter

- `src/utils/bottlesImport.test.ts` : guillemet isolé au milieu d'un champ (séparateurs `,` et `;`), suivi de lignes valides et d'une ligne invalide.

## Points d'attention

- Un champ qui commence par `"` sans guillemet fermant reste ambigu : garder le comportement actuel (zone ouverte jusqu'à la fin du fichier) ou le signaler en erreur, mais ne pas avaler de lignes en silence si un test simple permet de le détecter.

## Journal

- 2026-10-12 : tâche créée à la relecture de C-10 (PR #113), hors de son périmètre.
