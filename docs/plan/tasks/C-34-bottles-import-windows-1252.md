---
id: C-34
title: "Import de bouteilles : CSV Excel en Windows-1252 (accents perdus)"
phase: C
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-10]
touches: [backend/src/utils/bottlesImport.ts, backend/src/utils/bottlesImport.test.ts, backend/src/i18n/]
sources: ["02-backend-data-perf.md §4.2"]
branch:
pr:
---

## Contexte

C-10 rend l'import de bouteilles tolérant aux CSV enregistrés par Excel au format « CSV UTF-8 » : BOM retiré, séparateur `;` détecté, décimales à virgule et `VRAI`/`FAUX` acceptés. Excel propose aussi le format « CSV (séparateur : point-virgule) », souvent choisi par défaut en locale française, qui enregistre le fichier en Windows-1252, sans BOM.

## Problème constaté

`src/utils/bottlesImport.ts` décode toujours le fichier en UTF-8 (`buffer.toString('utf8')` dans `parseImportFile` et `readZipEntryText`). Un octet Windows-1252 accentué (`é` = `0xE9`) n'est pas une séquence UTF-8 valide : il devient `U+FFFD` (`�`). L'import réussit, sans erreur ni avertissement, et enregistre des noms de bouteilles, de catégories et d'emplacements abîmés (« Ch�teau », « Liqueur de ch�taigne »).

Constaté en écrivant C-10, hors de son périmètre.

## Ce qu'il faut faire

1. Décoder le texte d'un fichier importé (CSV, et entrées CSV d'un ZIP) en UTF-8 strict (`new TextDecoder('utf-8', { fatal: true })`).
2. Si le décodage strict échoue, relire le fichier en Windows-1252 (`new TextDecoder('windows-1252')`) : c'est le seul autre encodage qu'Excel produit pour un CSV en locale française.
3. Garder le retrait du BOM de C-10 (`stripBom`) après le décodage.
4. Ne rien changer pour le JSON : JSON est UTF-8 par définition (RFC 8259).

## Critères d'acceptation

- [ ] Un CSV Windows-1252 contenant `Château` est importé avec le nom `Château`.
- [ ] Un CSV UTF-8, avec ou sans BOM, est lu comme avant.
- [ ] Un fichier ZIP dont `bottles.csv` est en Windows-1252 est lu de même.

## Tests à ajouter ou adapter

- `src/utils/bottlesImport.test.ts` : CSV encodé en Windows-1252 (`Buffer.from([...])` avec `0xE9`), CSV UTF-8 avec accents (inchangé), entrée ZIP en Windows-1252.

## Points d'attention

- Un fichier UTF-8 valide n'est jamais relu en Windows-1252 : pas de risque de double décodage.
- Un fichier dans un autre encodage (Mac Roman, UTF-16) reste hors de portée ; UTF-16 se reconnaît à son BOM `FF FE` si un besoin apparaît.

## Journal

- 2026-10-12 : tâche créée par C-10 (import d'un CSV Excel en locale française, hors périmètre de C-10).
