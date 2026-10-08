---
id: C-09
title: "Cocktails : couche service, import fiable, export partagé, cycle de vie des images"
phase: C
lane: backend
criticite: moyenne
effort: L
status: todo
owner: agent
depends_on: [C-04]
touches: [backend/src/routes/cocktails.ts, backend/src/routes/public.ts, backend/src/services/cocktail, backend/src/routes/cocktails.test.ts, backend/src/i18n/]
sources: ["01-backend-routes.md §H4", "01-backend-routes.md §H5", "01-backend-routes.md §M2", "01-backend-routes.md §M8", "02-backend-data-perf.md §2.2", "03-security.md §13"]
branch:
pr:
---

## Décisions validées (2026-10-08)

- **Nom de cocktail** : pas unique (décision C-07). L'aperçu d'import signale un cocktail existant de même nom sans tenir compte de la casse (`alreadyExists`), sans bloquer l'import.

## Contexte

`routes/cocktails.ts` fait 610 lignes : CRUD, upload d'image, export, preview et confirm d'import. L'import échoue en 500 opaque ou écrit des lignes d'ingrédient qui ne pointent vers rien. L'export est copié-collé dans `public.ts`. Les fichiers image et la base se désynchronisent quand une opération échoue. Cette tâche extrait une couche service et corrige ces défauts sans changer le contrat HTTP.

## Problème constaté

Import (`routes/cocktails.ts:269-422`) :
- `:379` `unitId: unitId || 0` : unité non résolue → FK sur l'id 0 → rollback et 500, sans dire quelle unité.
- `:358-365` : bouteille ignorée et catégorie non résolue → `sourceType: 'INGREDIENT'` avec `ingredientId: null`. Même chose pour `CATEGORY` (`:367`) et `INGREDIENT` (`:369`) non résolus : ligne orpheline écrite.
- `:324` : `continue` silencieux si la catégorie d'une bouteille à créer n'est pas résolue.
- `:283-345` : 4 boucles de résolution quasi identiques ; handler d'environ 150 lignes.
- Preview `:155-157` : `name: { equals }` sensible à la casse (« Mojito » ≠ « mojito »). `:242` : `{ id, name: match[matchField], ...match }`, le spread écrase `name`.

Export :
- `public.ts:130-183` recopie `buildExportPayload` (`cocktails.ts:58-119`) ; `parseNT` est défini deux fois (`cocktails.ts:10-13`, `public.ts:5-8`).
- Slug du nom de fichier (`cocktails.ts:133`, `public.ts:185`) : les accents sont perdus (« Piña Colada » → `pi-a-colada`), un nom non latin donne `cocktail-.json`.
- `cocktailIncludes` (`cocktails.ts:43-55`) charge `preferredBottles.bottle` sans sa catégorie ; `public.ts:117` l'inclut. L'export admin retombe sur `ing.category?.name` (`:109`).

CRUD et images :
- Mapping des lignes d'ingrédient écrit deux fois (`:474-491`, `:525-544`).
- Existence de `unitId`, `bottleId`, `categoryId`, `ingredientId`, `preferredBottleIds` non vérifiée : erreur de FK.
- DELETE `:559-577` : image supprimée **avant** `cocktail.delete`. `path.join(uploadDir, imagePath)` (`:566`, `:592`) suit les `../` : une base restaurée piégée permet de supprimer un fichier arbitraire (sécurité §6).
- Upload `:580-608` : ancienne image supprimée avant l'update ; id inexistant → fichier uploadé orphelin. `existsSync`/`unlinkSync` synchrones.
- Filtre multer `:32-41` : regex non ancrée (`/jpeg|jpg|png|webp/`), `.xjpg` ou `image/png-whatever` passent ; nom de fichier `Date.now()-random`.

## Ce qu'il faut faire

1. Dossier `src/services/cocktail/` :
   - `includes.ts` : un `cocktailInclude` (admin, avec `preferredBottles.bottle.category`) et le `select` public de A-05 (le reprendre, ne pas l'élargir) ;
   - `cocktailService.ts` : `create(input)`, `update(id, input)` (transaction ; lignes et instructions remplacées **seulement** si le tableau est fourni, comme établi par A-03), `remove(id)`, `toIngredientCreate(line, index)` (mapping unique), `assertTargetsExist(tx, lines)` → `BadRequestError('errors.unknownReference', [{ line, field, id }])` ;
   - `cocktailExport.ts` : `buildCocktailExport(cocktail, { includeNotes })`, `exportFilename(name, id)` (`normalize('NFD')`, suppression des diacritiques, repli `cocktail-<id>`) ;
   - `cocktailImport.ts` : `preview(recipe)` et `confirm(recipe, resolutions)` ; une fonction générique `resolveEntities(tx, kind, resolutions)` remplace les 4 boucles ; les champs créés viennent des schémas de C-04 (liste blanche) ;
   - `cocktailImage.ts` : `setImage(id, file)`, `removeImageFile(imagePath)`, `safeUploadPath(imagePath)`.
2. Règles d'import :
   - chaque ligne doit finir avec une unité résolue et la FK de son `sourceType` résolue. Bouteille ignorée → repli `CATEGORY` si la catégorie est résolue, sinon `BadRequestError('errors.importUnresolved', [{ line, kind, name }])`. Plus de `unitId: 0`, plus d'`ingredientId: null` ;
   - bouteille à créer sans catégorie résolue → même erreur (plus de `continue`) ;
   - preview : `alreadyExists` comparé en minuscules ; `{ ...match, id: match.id, name: match[matchField] }`.
3. Images :
   - multer : table `{ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }`, extension et MIME doivent correspondre ; nom `crypto.randomUUID() + ext` ;
   - upload : cocktail inexistant → supprimer `req.file.path` puis `NotFoundError` ; sinon update en base, **puis** suppression de l'ancien fichier en best effort (`fs.promises.unlink(p).catch(log)`) ;
   - delete : `NotFoundError` si absent ; `cocktail.delete` d'abord, fichier ensuite en best effort ;
   - toujours `path.join(config.uploadDir, path.basename(imagePath))`.
4. Routes : `cocktails.ts` ne garde que validation (C-04), appel de service et réponse. Si besoin, séparer l'import dans `routes/cocktailImport.ts`, monté sous le même préfixe (ajouter le fichier à `touches`).
5. `public.ts` : l'export public appelle `buildCocktailExport(cocktail, { includeNotes: false })`. Supprimer `parseNT` (utiliser `parseTranslations` de C-14 si mergée, sinon un helper unique dans `cocktailExport.ts`).
6. Clés i18n : `errors.importUnresolved`, `errors.unknownReference`.

## Critères d'acceptation

- [ ] `cocktails.ts` < 200 lignes ; aucun handler > 30 lignes.
- [ ] Un seul mapping de lignes d'ingrédient, un seul builder d'export ; plus de `parseNT`.
- [ ] Import avec une unité non résolue → 400 qui nomme l'unité ; rien n'est créé.
- [ ] Aucun import ne crée de ligne `CocktailIngredient` dont la FK de `sourceType` est nulle.
- [ ] Exports admin et public identiques pour un même cocktail, `notes` mises à part.
- [ ] « Piña Colada » → `cocktail-pina-colada.json`.
- [ ] Upload sur id inexistant → 404, aucun fichier ajouté dans `uploadDir`.
- [ ] DELETE avec `imagePath = '../x'` ne supprime rien hors de `uploadDir`.
- [ ] Contrat HTTP inchangé (mêmes routes, mêmes formes de réponse).

## Tests à ajouter ou adapter

- `src/services/cocktail/cocktailExport.test.ts` : forme du payload, `includeNotes`, `exportFilename` (accents, non latin, vide).
- `src/services/cocktail/cocktailImport.test.ts` (base de test) : unité non résolue → erreur détaillée ; bouteille ignorée + catégorie résolue → ligne `CATEGORY` ; bouteille ignorée sans catégorie → erreur et aucune écriture ; `alreadyExists` insensible à la casse.
- `cocktails.test.ts` :
  - upload sur id inexistant → 404, nombre de fichiers de `uploadDir` inchangé ;
  - `.xjpg` ou MIME incohérent → 400 ;
  - remplacement d'image : l'ancien fichier disparaît après l'update ;
  - DELETE : fichier supprimé après la ligne ; `imagePath` piégé vers un fichier témoin hors `uploadDir` → fichier intact ;
  - POST avec `unitId` inexistant → 400 `unknownReference`.
- `public.test.ts` : export public sans `notes`, identique à l'export admin pour le reste.

## Points d'attention

- Effort L : si le diff dépasse ~800 lignes, découper (1 : export partagé + images ; 2 : service CRUD + import) avec un nouvel id.
- Ne pas défaire A-03 (mise à jour partielle transactionnelle) ni A-05 (`select` publics, cocktail visible seulement s'il est dans un menu public). Relire leurs tests avant de toucher `public.ts`.
- Le wizard (`frontend/src/components/import/ImportCocktailWizard.tsx`) affiche le message d'erreur générique (A-10) ; le détail par ligne viendra avec E-08.
- Si C-07 rend `Cocktail.name` unique, le P2002 de l'import devient le cas « déjà existant » : prévoir le message.
- Ne pas ajouter `sharp` ici : F-01 réencodera les images.
- Ordre : après C-04 (schémas d'import). `public.ts` est aussi touché par C-14 : enchaîner. Les tests d'images supposent A-01 (`UPLOAD_DIR` temporaire en test).

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
