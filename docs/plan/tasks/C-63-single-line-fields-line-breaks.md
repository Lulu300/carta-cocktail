---
id: C-63
title: "Noms et emplacements : les retours à la ligne entrent par l'API et les imports, pas par les formulaires"
phase: C
lane: backend
criticite: basse
effort: M
status: done
owner: mixed
depends_on: [C-36]
touches: [backend/src/utils/bottlesImport.ts, backend/src/utils/bottlesImport.test.ts, backend/src/routes/bottles.ts, backend/src/routes/bottles.test.ts, frontend/src/types/index.ts, frontend/src/components/import/BottleImportRowErrors.tsx, frontend/src/components/import/BottleImportRowErrors.test.tsx, frontend/src/components/import/ImportBottlesWizard.tsx, frontend/src/components/import/ImportBottlesWizard.test.tsx, frontend/src/i18n/locales/admin/, docs/plan/tasks/C-36-bottles-import-stray-quote.md]
sources: []
branch: fix/C-63-multiline-value-warning
pr: 237
---

## Contexte

Trouvé pendant C-36 (PR #225), à la demande du coordinateur, qui voulait signaler à l'import CSV une valeur sur plusieurs lignes dans une colonne d'une seule ligne (`name`, `categoryName`, `categoryType`, `location`). Le but était de fermer le dernier cas de « lignes avalées » : `"Bourbon,700` … `C 3",700` est un CSV valide (RFC 4180) qui donne une bouteille dont le nom contient les lignes du milieu.

## Problème constaté

Vérifié sur `fix/C-36-csv-stray-quote` :

- **Formulaires** : nom, emplacement, nom de catégorie et type sont des `<input>` (`BottleFormModal`, `LocationAutocomplete`, `CategoryTypesManager`…). Un champ d'une ligne ne laisse pas entrer de retour à la ligne.
- **Schémas zod** : `RequiredText` (`z.string().trim().min(1)`) et `location: z.string()` acceptent `\n` et `\r`. Cela vaut pour `BottleCreate`, `BottleUpdate`, `CategoryCreate` et la confirmation d'import `bottleImport.ts`. Un appel à l'API, un import JSON ou une sauvegarde restaurée peut donc enregistrer un nom ou un emplacement sur plusieurs lignes.
- **Import CSV** : C-10 garde volontairement un `\r\n` dans une cellule entre guillemets, et le test `keeps a Windows line break inside a quoted field` le fait pour `location`.
- **Export** : `buildCsvPayload` écrit ces valeurs entre guillemets, avec leur retour à la ligne. L'aller-retour export → import est aujourd'hui sans erreur : `Gin\nOld Tom` / `Rhum\nagricole` / `Shelf\r\nleft` reviennent à l'identique.

Refuser ces valeurs à l'import CSV seul ferait donc échouer la réimport d'un export de l'app dès qu'une base contient une telle valeur. C'est pourquoi C-36 ne l'a pas fait.

## Ce qu'il faut faire (décision humaine d'abord)

Choisir une règle unique pour les champs d'une ligne, puis l'appliquer partout :

- **Option A, interdire** : un schéma `SingleLineText` refuse `\r` et `\n` dans ces champs (API, confirmation d'import). L'import CSV et l'import JSON les signalent comme erreur de ligne. Pour les données existantes, il faut au choix une migration qui remplace les retours à la ligne par une espace (réécriture de données : à valider), ou bien un export qui les remplace à l'écriture, pour que l'aller-retour reste sans erreur.
- **Option B, normaliser** : l'API et les imports remplacent tout retour à la ligne de ces champs par une espace, sans erreur. Une valeur avalée sur plusieurs lignes devient visible sur une seule ligne dans la prévisualisation, mais elle n'est pas signalée.
- **Option C, avertir** : garder les valeurs, mais la prévisualisation de l'import affiche un avertissement non bloquant pour une valeur sur plusieurs lignes dans une colonne d'une ligne.

## Critères d'acceptation

- [x] La règle choisie est la même pour les formulaires, l'API, l'import JSON, l'import CSV et l'export.
- [x] `"Bourbon,700` … `C 3",700` n'est plus importé en silence comme une bouteille au nom sur plusieurs lignes (erreur, avertissement ou normalisation visible, selon l'option).
- [x] L'aller-retour export → import d'une base qui contient déjà de telles valeurs reste sans erreur, ou la PR décrit l'action requise.

## Points d'attention

- Les options A et B réécrivent ou refusent des données existantes : il faut la décision de l'humain, et une ligne « Notes de version ».
- `categoryType` est la clé d'un type : la normaliser peut créer un doublon ou en fusionner deux (voir C-61).

## Journal

- 2026-11-25 : tâche créée pendant C-36 (PR #225), hors de son périmètre.
- 2026-11-25 : décision de l'humain : **option C, avertir**. Les valeurs sont gardées. La prévisualisation de l'import affiche un avertissement non bloquant pour une valeur sur plusieurs lignes dans une colonne d'une ligne (`name`, `categoryName`, `location` et toute autre colonne texte d'une ligne du format). L'avertissement nomme la ligne du fichier où commence l'enregistrement et la colonne. Aucune donnée n'est refusée ni réécrite, et l'aller-retour export → import reste sans erreur.
- 2026-11-26 : fait (PR #237). Le lecteur de lignes (`RowReader.text()`, `utils/bottlesImport.ts`) lit tous les champs texte d'une ligne du format. Pour les bouteilles : `name`, `categoryName`, `categoryType` et `location`. Pour les catégories (liste JSON et `categories.csv`) : `name`, `type` et chaque valeur de `nameTranslations`. Il ajoute un avertissement `lineBreak` (`source`, `line`, `field`) quand la valeur, une fois rognée, contient `\n` ou `\r`, et garde la valeur telle quelle. Seules les lignes gardées sont signalées : une ligne écartée est déjà dans les erreurs. `categoryType` est désormais lu avec le reste de la ligne (`KeptBottle.categoryType`). `POST /api/bottles/import/preview` renvoie `warnings` à côté de `errors`, hors de `payload`, qui revient inchangé à la confirmation. Frontend : la liste des lignes écartées (`BottleImportRowErrors`) devient une liste partagée (`RowIssues`) : mêmes libellés de position et de colonne, même repli pour un code inconnu. `BottleImportRowWarnings` l'affiche en ambre, `role="status"`, sous les erreurs de l'étape « Vérifier les lignes », sans bloquer « Suivant » ni « Confirmer » (en/fr). `warnings` est facultatif dans le type, car un backend plus ancien ne l'envoie pas. Aller-retour testé en CSV et en JSON sur une base qui contient `Gin\nOld Tom`, `Rhum\nagricole` et `Shelf\r\nleft` : 0 erreur, les avertissements attendus, bouteilles identiques. 7 sondes de sabotage, chacune fait échouer au moins un test. Schémas zod, formulaires et export inchangés : la règle « garder » vaut partout, et seuls les imports avertissent. Import de cocktails non modifié : il lit une recette JSON, son aperçu n'a pas de liste d'avertissements par ligne (seulement `alreadyExists`), et un JSON ne peut pas avaler de lignes comme un guillemet CSV mal placé. La limite de C-36 n'est citée dans aucun texte utilisateur (notes de version, README, guide d'exploitation) : seul le Journal de C-36 est annoté. Fichiers ajoutés à `touches` : route et test des bouteilles, types, assistant et tests du frontend, Journal de C-36. Les fichiers de validation et d'export ont été retirés de `touches` : l'option C ne les modifie pas.
- Notes de version : import de bouteilles : une valeur sur plusieurs lignes dans un champ d'une ligne (nom, catégorie, type, emplacement, nom ou traduction d'une catégorie) apparaît dans la prévisualisation sous « valeurs à vérifier », avec sa ligne et son champ. Un guillemet mal placé dans un CSV peut en effet réunir plusieurs lignes du fichier en un seul nom. L'avertissement ne bloque pas l'import, et la valeur est importée telle quelle, comme avant. Aucune action requise.
