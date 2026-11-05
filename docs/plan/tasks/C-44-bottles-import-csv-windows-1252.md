---
id: C-44
title: "Import de bouteilles : lire un CSV Excel en Windows-1252 sans perdre les accents"
phase: C
lane: backend
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: [C-10]
touches: [backend/src/utils/bottlesImport.ts, backend/src/utils/bottlesImport.test.ts, backend/src/routes/bottles.test.ts, backend/src/test/windows1252.ts, docs/plan/tasks/C-34-bottles-import-windows-1252.md]
sources: []
branch: fix/C-44-csv-windows-1252
pr: #155
---

## Contexte

Relecture des notes de v1.12.0 (PR #152, écart G4b). Le format CSV par défaut d'Excel en français, « CSV (séparateur : point-virgule) », enregistre le fichier en Windows-1252, sans BOM. L'import de bouteilles (#113, C-10) lit ce fichier en UTF-8 : les accents deviennent `�` sans erreur ni avertissement.

C-34 décrivait déjà ce problème (créée par C-10, restée `todo`). C-44 la remplace.

## Décisions validées

- 2026-11-05, humain : « G4b: CSV encoding — New task: detect a Windows-1252 file on import (decode it or refuse it with a message). » Le choix entre décoder et refuser est laissé à l'agent.

## Problème constaté

Le frontend envoie le fichier tel quel (multipart). Le backend le décode dans `backend/src/utils/bottlesImport.ts` : `buffer.toString('utf8')` dans `parseImportFile` (fichier `.csv`) et `readZipEntryText` (entrées d'un ZIP). Un octet Windows-1252 accentué (`é` = `0xE9`) n'est pas une séquence UTF-8 valide. Il devient `U+FFFD`, et l'import enregistre « Cr�me », « Liqueur � l'�uf ».

## Ce qu'il faut faire

1. Décoder un CSV (fichier `.csv`, `bottles.csv` et `categories.csv` d'un ZIP) en UTF-8 strict.
2. Si le décodage strict échoue et que le fichier n'a pas de BOM UTF-8, le relire en Windows-1252.
3. Un fichier UTF-8 valide, avec ou sans BOM, est lu comme avant ; un fichier avec un BOM UTF-8 reste lu en UTF-8.
4. JSON inchangé (UTF-8 par définition, RFC 8259).

## Critères d'acceptation

- [x] Un CSV Windows-1252 contenant `é`, `è`, `à`, `œ` et `€` est importé avec ses accents.
- [x] Un CSV UTF-8, avec ou sans BOM, est lu comme avant ; un CSV avec un BOM UTF-8 n'est jamais relu en Windows-1252.
- [x] `bottles.csv` et `categories.csv` d'un ZIP en Windows-1252 sont lus de même.
- [x] Retirer la relecture en Windows-1252 fait échouer les tests.

## Tests à ajouter ou adapter

- `backend/src/utils/bottlesImport.test.ts` : `decodeCsvBytes` (Windows-1252, UTF-8 avec et sans BOM, BOM suivi d'un octet invalide), `parseImportFile` sur un CSV Excel `;` en Windows-1252, `parseZipBottles` avec deux entrées en Windows-1252.
- `backend/src/routes/bottles.test.ts` : `POST /api/bottles/import/preview` avec un CSV Windows-1252.
- Octets réels produits par `windows1252Bytes()` (`backend/src/test/windows1252.ts`), table explicite : `0xE9`, `0xE8`, `0xE0`, `0x9C`, `0x80`.

## Points d'attention

- Décoder plutôt que refuser : un fichier UTF-8 valide n'est jamais relu en Windows-1252, et un texte Windows-1252 accentué n'est presque jamais de l'UTF-8 valide (il faudrait des paires comme `Ã©`). L'aperçu montre les noms décodés avant toute écriture.
- `TextDecoder('windows-1252')` demande l'ICU complet de Node. Vérifié dans `node:24.22-alpine` (image d'exécution) : `œ` et `€` sont bien décodés. Un décodeur Latin-1 se tromperait sur `0x80`-`0x9F`.
- Un autre encodage (Mac Roman, UTF-16) reste hors de portée.

## Journal

- 2026-11-05 : tâche créée à partir de l'écart G4b de la relecture des notes de v1.12.0 (PR #152) et faite (PR #155). Choix : décoder. `decodeCsvBytes()` (`bottlesImport.ts`) : BOM UTF-8 → UTF-8 ; sinon UTF-8 strict ; en cas d'échec, Windows-1252. Utilisé pour un `.csv` et pour les entrées CSV d'un ZIP. `readZipEntryText` devient `readZipEntryBytes` pour que l'appelant choisisse le décodage. JSON inchangé. Aucun nouveau message, donc pas de changement i18n. C-34 (même correctif) passe à `dropped`, remplacée par C-44. Backend : 1187 tests, couverture 99,24 / 95,13 / 99,81 / 99,54 %, couverture des lignes modifiées 100 % (11/11). Frontend inchangé.
- 2026-11-05 : Notes de version : aucune action requise (`breaking: false`). La phrase G4b prévue pour v1.12.0 (« enregistrer en CSV UTF-8, sinon les accents deviennent `�` ») n'est plus utile. La remplacer par : un CSV enregistré par Excel en « CSV (séparateur : point-virgule) » (Windows-1252) est maintenant importé avec ses accents ; le CSV UTF-8 fonctionne comme avant.
