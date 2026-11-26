---
id: C-36
title: "Import de bouteilles : un guillemet isolé dans un champ CSV fait disparaître des lignes"
phase: C
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-10]
touches: [backend/src/utils/bottlesImport.ts, backend/src/utils/bottlesImport.test.ts, backend/src/i18n/, frontend/src/components/import/BottleImportRowErrors.tsx, frontend/src/components/import/BottleImportRowErrors.test.tsx, frontend/src/i18n/locales/admin/, frontend/src/types/index.ts, backend/src/routes/bottles.test.ts]
sources: []
branch: fix/C-36-csv-stray-quote
pr: 225
---

## Contexte

C-10 (PR #113) a réécrit la lecture des CSV de l'import de bouteilles : découpage en enregistrements (`splitCsvRecords`), détection du séparateur, puis découpage en champs (`parseCsvLine`). Une ligne invalide est écartée et listée dans `errors`.

## Problème constaté

`splitCsvRecords` ouvre une zone entre guillemets sur n'importe quel `"`, alors que `parseCsvLine` ne la reconnaît qu'en début de champ. Constaté à la relecture de C-10 : `Bourbon 12" edition,700` suivi de deux lignes valides donne 0 bouteille et une seule erreur (ligne 2, `capacityMl`) ; les deux lignes suivantes, avalées dans le même enregistrement, disparaissent sans être signalées. Avec deux guillemets isolés, le second referme la zone et toutes les lignes entre les deux ne forment qu'un enregistrement. `countOutsideQuotes` (détection du séparateur) a le même défaut, mais ne lit que l'en-tête.

Le comportement est antérieur à C-10 (même logique dans l'ancien `splitCsvLines`). Excel double toujours les guillemets d'une cellule (RFC 4180), donc seuls les fichiers écrits à la main ou par un autre outil sont touchés.

## Ce qu'il faut faire

1. Dans `splitCsvRecords` (et `countOutsideQuotes`), n'ouvrir une zone entre guillemets qu'en début de champ (début de ligne ou juste après un séparateur), comme `parseCsvLine`. Un `"` au milieu d'un champ non entouré de guillemets est un caractère ordinaire.
2. Garder le reste du comportement de C-10 : `""` dans un champ entre guillemets, champs multilignes, `\r\n` conservé, numéros de ligne.

## Critères d'acceptation

- [x] `Bourbon 12" edition,700` suivi de deux lignes valides importe trois bouteilles, la première avec le nom `Bourbon 12" edition`.
- [x] Un champ entre guillemets multiligne et un `""` échappé se lisent comme avant (tests de C-10 inchangés et verts).
- [x] Une ligne invalide après un guillemet isolé est signalée avec son bon numéro de ligne.

## Tests à ajouter ou adapter

- `src/utils/bottlesImport.test.ts` : guillemet isolé au milieu d'un champ (séparateurs `,` et `;`), suivi de lignes valides et d'une ligne invalide.

## Points d'attention

- Ordre : `splitCsvRecords` tourne aujourd'hui avant `detectSeparator`, qui lit `records[0]`. Pour reconnaître un début de champ, il faut le séparateur avant le découpage : par exemple le détecter sur la première ligne physique (un en-tête n'a pas de champ multiligne) et le passer à `splitCsvRecords`.
- Un champ qui commence par `"` sans guillemet fermant reste ambigu : garder le comportement actuel (zone ouverte jusqu'à la fin du fichier) ou le signaler en erreur, mais ne pas avaler de lignes en silence si un test simple permet de le détecter.

## Journal

- 2026-10-12 : tâche créée à la relecture de C-10 (PR #113), hors de son périmètre.
- 2026-11-25 : fait (PR #225). Un seul lecteur (`CsvReader`) découpe enregistrements et cellules en une passe : seul un guillemet en début de cellule ouvre une cellule entre guillemets, tout autre guillemet est du texte. Une cellule entre guillemets jamais fermée, ou suivie de texte après le guillemet fermant, est signalée (`malformedQuotes`, numéro de ligne du fichier et nom de colonne) et la lecture reprend à la ligne qui suit le guillemet ouvrant : aucune ligne n'est avalée. Un en-tête dans ce cas est refusé (`malformedHeader`). Séparateur détecté sur la première ligne non vide, avant la lecture. Erreurs d'un CSV triées par ligne. Fichiers ajoutés à `touches` : messages backend (`errors.import.malformedHeader`) et frontend (`malformedQuotes` dans `BottleImportRowErrors`, types, en/fr). Vérifié sur des fichiers réels avant/après, par un test différentiel (3 000 CSV valides aléatoires lus à l'identique par l'ancien et le nouveau lecteur), sur l'export de l'app (identique) et par 11 sondes de sabotage. Pas de bibliothèque ajoutée (aucune en dépendance ; le lecteur garde le comportement de C-10). Limite connue : un guillemet ouvrant fermé plus loin par un guillemet suivi du séparateur (`"Bourbon,700` … `C 3",700`) forme une cellule multiligne valide (RFC 4180). Elle est lue comme avant : la bouteille apparaît dans la prévisualisation avec un nom sur plusieurs lignes, ou la ligne est signalée sur sa première ligne. Le coordinateur a demandé de signaler ces valeurs dans les colonnes d'une ligne, mais ce serait refuser des données que l'app produit : les formulaires n'acceptent pas de retour à la ligne, alors que les schémas zod (API, confirmation d'import), l'import JSON et l'import CSV (test de C-10) les acceptent, et que l'export les réécrit entre guillemets. L'aller-retour export → import de telles valeurs, aujourd'hui sans erreur, échouerait. La règle à choisir pour ces champs relève de l'humain : tâche C-63. *Levé par C-63 (#237) : valeurs gardées, et signalées comme avertissement non bloquant dans la prévisualisation, avec leur ligne et leur champ.*
- 2026-11-25 : suites de la relecture. `errors.import.malformedHeader` nomme le fichier (`{{file}}` : `bottles.csv` ou `categories.csv`, en/fr), avec un test du ZIP dont le `categories.csv` a un en-tête mal formé (unitaire et route). Une cellule au-delà de la dernière colonne nommée est située par `column` (« column 3 » / « colonne 3 » dans la prévisualisation) au lieu de « 3 ». 4 sondes de sabotage de plus, toutes détectées. Fichier `backend/src/routes/bottles.test.ts` ajouté à `touches`.
- Notes de version : import de bouteilles CSV : un guillemet au milieu d'une cellule (`Bourbon 12" edition`) est lu comme du texte et ne fait plus disparaître les lignes suivantes. Une ligne aux guillemets mal formés (guillemet ouvrant jamais fermé, texte après un guillemet fermant, par exemple `"Special" Reserve`) apparaît dans les lignes écartées de la prévisualisation, avec son numéro de ligne et sa colonne, et les lignes suivantes sont lues. Un fichier dont la ligne d'en-tête a un guillemet mal placé est refusé avec un message qui le nomme (`bottles.csv` ou `categories.csv`) : un ZIP dont le `categories.csv` est dans ce cas est donc refusé en entier, alors qu'avant ses catégories étaient ignorées sans message. Une valeur entre guillemets qui s'étend sur plusieurs lignes reste lue comme avant (limite, voir C-63). Un CSV valide (export de l'app, Excel) s'importe exactement comme avant. Aucune action requise.
