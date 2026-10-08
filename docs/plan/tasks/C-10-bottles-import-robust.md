---
id: C-10
title: "Bouteilles : import robuste et créations en lot transactionnelles"
phase: C
lane: backend
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [C-04, C-06]
touches: [backend/src/app.ts, backend/src/routes/bottles.ts, backend/src/utils/bottlesImport.ts, backend/src/utils/bottlesExport.ts, backend/src/routes/bottles.test.ts, backend/src/i18n/]
sources: ["02-backend-data-perf.md §4.2", "02-backend-data-perf.md §3.5"]
branch:
pr:
---

## Contexte

L'import de bouteilles accepte CSV, JSON et ZIP. Il est déjà défensif (transaction, quantité plafonnée, doublons signalés), mais un CSV enregistré par Excel est refusé, des valeurs absurdes passent, une date invalide fait échouer tout l'import en 500, et un gros fichier dépasse le délai de transaction. La création en lot depuis le formulaire n'est pas atomique.

## Problème constaté

`src/utils/bottlesImport.ts` :
- BOM UTF-8 non retiré : `:107` et `:209` lisent l'en-tête `﻿name` → « CSV missing required column: name ». Le JSON est aussi touché, ce que le rapport ne dit pas : `JSON.parse` échoue sur un BOM (`:253`, `:276`).
- Séparateur `,` seul (`:46`) : un CSV Excel en locale française (`;`) est illisible.
- `:146` : `capacityMl` vaut 0 par défaut (CSV) ; `:188` idem (JSON). `remainingPercent` non borné (`:147`, `:189`) ; `desiredStock`/`minimumPercent` négatifs acceptés (`:177-178`, `:230-231`) ; `openedAt` non validé (`:151`, `:193`).
- `parseZipBottles` (`:238-268`) : `getData()` sans limite de taille décompressée.
- Aucune limite de lignes. Les erreurs sont des messages anglais remontés tels quels (`routes/bottles.ts:110`).

`src/routes/bottles.ts` :
- `:130-146` (preview) : `allBottles.filter(...)` pour chaque ligne importée, O(lignes × bouteilles).
- `:240-262` (confirm) : `tx.bottle.create` un par un (lignes × quantité). `openedAt` invalide → `new Date('abc')` → échec de toute la transaction en 500. Délai par défaut de 5 s.
- `:365-377` : POST avec `quantity` jusqu'à 50, créations hors transaction (C-06 les met dans une transaction, une par une).

`src/app.ts` : `express.json()` sans option garde la limite par défaut de 100 Ko. `/import/confirm` reçoit en JSON le `payload` normalisé d'un fichier que l'aperçu accepte jusqu'à 10 Mo (`importUpload`). Au-delà d'environ 100 Ko de JSON (quelques centaines de lignes), l'aperçu réussit puis la confirmation échoue en 413 (page HTML d'Express avant C-03, « HTTP 413 » à l'écran avant E-17).

`src/utils/bottlesExport.ts:124-131` `escapeCsvField` : une valeur qui commence par `=`, `+`, `-`, `@` devient une formule dans Excel. Pas de BOM : accents cassés à l'ouverture dans Excel.

## Ce qu'il faut faire

1. Parseurs (`bottlesImport.ts`) :
   - `stripBom(text)` sur toute entrée texte (CSV, JSON, entrées de ZIP) ;
   - séparateur détecté sur la ligne d'en-tête (`;` s'il y en a plus que de `,` hors guillemets) ; `parseCsvLine` reçoit le séparateur ;
   - validation par ligne : `capacityMl` entier > 0 ; `remainingPercent` 0-100 ; `alcoholPercentage` 0-100 ; `purchasePrice` ≥ 0 ; `openedAt` date valide ; `desiredStock` ≥ 0 ; `minimumPercent` 0-100. Une ligne invalide est **écartée** et rapportée dans un nouveau champ `errors: { line: number; field: string; code: 'required' | 'outOfRange' | 'invalidDate' | 'invalidNumber' }[]` de `NormalizedImportPayload` ;
   - `MAX_IMPORT_ROWS = 2000` : au-delà, erreur `tooManyRows` ;
   - ZIP : refuser une entrée dont `header.size` dépasse 20 Mo ;
   - erreurs de parsing levées avec un code (`class ImportParseError { code; params }`) ; la route les traduit (`errors.import.<code>`). Plus de message anglais brut.
2. Preview (`bottles.ts`) : index `Map` par clé `nom|capacité|catégorie` en minuscules (extraire `existingDuplicateKey`, `:211-212`, pour l'utiliser des deux côtés) ; renvoyer `errors` au client.
3. Confirm :
   - le payload vient du client : revalidation par le schéma de C-04 ;
   - plafond global : somme des quantités ≤ 2 000 bouteilles ;
   - `tx.bottle.createMany` par lots de 500 ;
   - `prisma.$transaction(fn, { timeout: 30_000 })` ;
   - la synchro des menus reste `syncAllBottleMenus(tx)` (posée par C-06) : ne pas la réécrire.
4. POST `/bottles` avec `quantity > 1` : une transaction, `tx.bottle.createManyAndReturn` (Prisma ≥ 5.14, supporté sur SQLite ; à défaut, une boucle de `create`, 50 au plus), puis une seule synchro. Réponse inchangée (objet si 1, tableau avec `category` sinon).
5. Limite du corps JSON de la confirmation (`app.ts`) : monter un parseur dédié **avant** le `express.json()` global, par exemple `app.use('/api/bottles/import/confirm', express.json({ limit: '5mb' }))`. body-parser ignore un corps déjà lu : le parseur global (100 Ko) ne s'applique plus à cette route et reste inchangé pour les autres. Choisir la limite d'après `MAX_IMPORT_ROWS` (mesurer la taille JSON de 2 000 lignes complètes) et la garder sous le `client_max_body_size 20m` de nginx (A-06). Ne pas relever la limite globale.
6. Export (`bottlesExport.ts`) : préfixer d'une apostrophe une valeur texte qui commence par `=`, `+`, `-`, `@`, tabulation ou retour chariot (pas un nombre négatif) ; BOM UTF-8 en tête du CSV.

## Critères d'acceptation

- [ ] Un CSV enregistré par Excel (BOM + `;`) est importé.
- [ ] Un JSON avec BOM est importé.
- [ ] Une ligne avec `capacityMl` vide, `remainingPercent: 150` ou `openedAt: 'abc'` est écartée et listée dans `errors` ; les autres passent.
- [ ] Un fichier de 2 001 lignes est refusé en 400 traduit.
- [ ] Import confirm de 1 000 bouteilles en moins de 5 s sur la base de test.
- [ ] Une confirmation de 2 000 lignes (corps JSON bien au-delà de 100 Ko) passe ; un corps JSON de plus de 100 Ko sur une autre route reste refusé en 413.
- [ ] `POST /bottles` avec `quantity: 5` qui échoue ne crée rien.
- [ ] Export puis réimport CSV redonne les mêmes bouteilles (BOM compris).
- [ ] Une bouteille nommée `=1+1` est exportée en `'=1+1`.

## Tests à ajouter ou adapter

- `src/utils/bottlesImport.test.ts` (nouveau, unitaire) : BOM CSV et JSON ; séparateur `;` ; champ entre guillemets contenant `;` ; chaque règle de validation (ligne écartée + entrée dans `errors`) ; plafond de lignes ; entrée ZIP trop grosse.
- `src/utils/bottlesExport.test.ts` (nouveau) : injection de formule, nombre négatif non préfixé, BOM présent.
- `bottles.test.ts` :
  - preview d'un CSV `;` avec BOM → bouteilles parsées ;
  - preview avec une ligne invalide → `errors[0]` vaut `{ line: 2, field: 'capacityMl', … }` ;
  - confirm avec `openedAt: 'abc'` → 400, aucune bouteille créée ;
  - confirm de 1 000 bouteilles → 201 (vérifier que le corps dépasse 100 Ko, sinon augmenter le nombre de lignes : le test doit échouer sans l'étape 5) ;
  - corps JSON de 200 Ko sur `POST /api/units` → 413 (la limite globale ne bouge pas) ;
  - POST `quantity: 3` avec un `categoryId` inexistant → aucune bouteille créée ;
  - adapter les tests CSV existants (`:322-368`) au BOM en tête.

## Points d'attention

- Le wizard frontend (`frontend/src/components/import/ImportBottlesWizard.tsx`) ignore `errors` : l'affichage par ligne revient à E-08. Les lignes écartées ne se voient que par leur absence : le dire dans la PR.
- Le BOM à l'export change le premier caractère du fichier : vérifier que l'import (frontend et backend) le tolère, et que les outils de l'utilisateur ne s'en plaignent pas.
- `createMany` ne renvoie pas les ids : sans importance pour l'import, la synchro des menus est globale (C-06).
- B-07 (majeure d'`adm-zip`) touche aussi `bottlesImport.ts` : enchaîner.
- Le parseur dédié de l'étape 5 lit le corps avant `authMiddleware` (monté sur `/api/bottles`) : un client non authentifié peut faire analyser jusqu'à la limite choisie. Acceptable avec une limite de quelques Mo ; sinon, ajouter `authMiddleware` devant ce parseur. `app.ts` est aussi touché par C-03 et C-11 : enchaîner.
- Ordre : après C-04 (schéma du confirm) et C-06 (synchro). `bottles.ts` est aussi touché par C-07 et C-14 : enchaîner.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : suivi des revues de la phase A. Ajout de l'étape 5 (limite `express.json()` de 100 Ko qui fait échouer la confirmation d'un gros import), d'un critère et de deux tests ; `backend/src/app.ts` ajouté à `touches`.
