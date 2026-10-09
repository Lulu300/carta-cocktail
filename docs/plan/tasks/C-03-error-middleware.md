---
id: C-03
title: "Gestion d'erreurs centralisée (HttpError, middleware, 404 JSON)"
phase: C
lane: backend
criticite: haute
effort: M
status: todo
owner: agent
depends_on: [C-02, A-02, A-03, A-05, A-10]
touches: [backend/src/app.ts, backend/src/errors.ts, backend/src/routes/, backend/src/middleware/, backend/src/services/availabilityService.ts, backend/src/i18n/en.json, backend/src/i18n/fr.json]
sources: ["01-backend-routes.md §H1", "01-backend-routes.md §R1", "01-backend-routes.md §M7"]
branch:
pr:
---

## Contexte

Chaque route gère ses erreurs elle-même : 71 `try/catch` qui renvoient presque tous 500. Un id inexistant ou non numérique, un fichier trop gros ou une clé étrangère donnent un 500 générique, parfois une page HTML. Le frontend ne distingue pas une erreur de saisie d'une panne. Express 5 transmet déjà les rejets de promesse au middleware d'erreur : il suffit d'en écrire un et de supprimer le code répété.

## Problème constaté

- `src/app.ts:25-56` : aucun middleware `(err, req, res, next)`, aucun 404 JSON pour `/api/*`.
- 71 blocs `try {` dans `src/routes/*.ts` (bottles 9, cocktails 10, public 7, ingredients 6…), 60 `req.t('errors.serverError')`.
- 39 `parseInt(String(req.params...))` : `/api/units/abc` → `NaN` → `PrismaClientValidationError` → 500.
- P2025 (introuvable sur update/delete) → 500 : `units.ts:66,79`, `categories.ts:93,113`, `bottles.ts:387,418`, `menuBottles.ts:63,86`, `menuSections.ts:58,76`, `cocktails.ts:571,598`, `categoryTypes.ts:97`. Seul `ingredients.ts:92,110` mappe P2025 en 404.
- P2003 / `RESTRICT` (unité utilisée, bouteille préférée) → `500 errors.cannotDelete` (`units.ts:83`, `bottles.ts:422`, `categories.ts:117`) : c'est un conflit (409).
- Multer : `LIMIT_FILE_SIZE` sur `cocktails.ts:580`, `bottles.ts:99`, `backup.ts:75` part au handler Express par défaut, qui répond en HTML.
- `app.ts:31-32` : `express.json()` passe **avant** `i18nMiddleware`. Un JSON invalide échoue avant que `req.t` existe.
- `availability.ts:18` : `error.message === 'Cocktail not found'` dépend du texte lancé par `availabilityService.ts:210`.

## Ce qu'il faut faire

1. `src/errors.ts` :
   ```ts
   export class HttpError extends Error {
     constructor(
       public readonly status: number,
       public readonly i18nKey: string,
       public readonly details?: unknown,
       options?: { cause?: unknown },
     ) {
       super(i18nKey, options);
       this.name = new.target.name;
     }
   }
   export class BadRequestError extends HttpError { constructor(key = 'errors.validationError', details?: unknown) { super(400, key, details); } }
   export class UnauthorizedError extends HttpError { constructor(key = 'errors.unauthorized') { super(401, key); } }
   export class ForbiddenError extends HttpError { constructor(key: string) { super(403, key); } }
   export class NotFoundError extends HttpError { constructor(key = 'errors.notFound') { super(404, key); } }
   export class ConflictError extends HttpError { constructor(key = 'errors.duplicateEntry', details?: unknown) { super(409, key, details); } }
   ```
2. `src/middleware/errorHandler.ts` : une fonction pure `toHttpError(err: unknown): HttpError`, puis le middleware.

   | Erreur reçue | Statut | Clé |
   |---|---|---|
   | `HttpError` | son statut | sa clé |
   | `Prisma.PrismaClientKnownRequestError` P2025 | 404 | `errors.notFound` |
   | idem P2002 | 409 | `errors.duplicateEntry` |
   | idem P2003 | 409 | `errors.cannotDelete` |
   | `Prisma.PrismaClientValidationError` (dont `NaN`) | 400 | `errors.validationError` |
   | `multer.MulterError` `LIMIT_FILE_SIZE` | 413 | `errors.fileTooLarge` |
   | autre `MulterError` | 400 | `errors.validationError` |
   | `err.type === 'entity.parse.failed'` (JSON invalide) | 400 | `errors.invalidJson` |
   | `err.type === 'entity.too.large'` | 413 | `errors.fileTooLarge` |
   | tout le reste | 500 | `errors.serverError` |

   ```ts
   export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
     if (res.headersSent) return next(err); // flux déjà parti : Express ferme la connexion
     const httpErr = toHttpError(err);
     if (httpErr.status >= 500) console.error(err);
     const t = typeof req.t === 'function' ? req.t : i18next.getFixedT('en');
     res.status(httpErr.status).json({
       error: t(httpErr.i18nKey),
       ...(httpErr.details !== undefined && { details: httpErr.details }),
     });
   };
   ```
3. `app.ts` : déplacer `app.use(i18nMiddleware)` avant `express.json()` (le repli ci-dessus reste). Après les routes : `app.use('/api', (req, res) => res.status(404).json({ error: req.t('errors.notFound') }))`, puis `app.use(errorHandler)` en dernier.
4. Routes : supprimer les `try/catch` et `console.error`. Remplacer `res.status(404).json(...); return;` par `throw new NotFoundError()`, les 400 par `BadRequestError`, le 403 de `menus.ts` par `ForbiddenError`. Supprimer les tests `error.code === 'P2002'`/`'P2025'` (le middleware les gère). Garder un `try/catch` seulement là où il a un rôle :
   - `bottles.ts:107-112` (erreur du parseur d'import) → `throw new BadRequestError('errors.invalidImportFile', { reason: err.message })` ;
   - `backup.ts` export : le `archive.on('error')` reste local (le flux est parti) ; C-05 ajoutera `res.destroy()`.
5. `availabilityService.ts:210` : `throw new NotFoundError()` ; `availability.ts` ne teste plus le message. Si C-08 a déjà réécrit le service, faire la même chose dans la nouvelle version.
6. `en.json` et `fr.json` : ajouter `errors.fileTooLarge`, `errors.invalidJson`, `errors.invalidImportFile`.
7. Hors périmètre : validation des entrées (C-04), textes en dur restants et clés manquantes (C-12), contrôles d'usage avant suppression (C-07).

## Critères d'acceptation

- [ ] Plus aucun `try {` dans `src/routes/*.ts`, sauf les deux cas de l'étape 4.
- [ ] `GET/PUT/DELETE /api/units/abc` → 400 JSON ; `/api/units/99999` → 404 JSON.
- [ ] `DELETE /api/units/:id` d'une unité utilisée → 409 JSON.
- [ ] Image de 6 Mo sur `POST /api/cocktails/:id/image` → 413 JSON (plus de HTML).
- [ ] Corps JSON invalide → 400 JSON traduit selon `Accept-Language`.
- [ ] `GET /api/inexistant` → 404 JSON.
- [ ] Toutes les erreurs ont la forme `{ error: string, details?: unknown }`, sans stack trace.

## Tests à ajouter ou adapter

- `src/middleware/errorHandler.test.ts` (unitaire, sans base) : `toHttpError` pour chaque ligne du tableau. Erreurs Prisma construites avec `new Prisma.PrismaClientKnownRequestError('x', { code: 'P2025', clientVersion: 'test' })`.
- Tests supertest (dans les fichiers de routes existants ou un `src/app.test.ts`) :
  - `/api/units/abc` (GET, PUT, DELETE) → 400 ; `/api/units/99999` → 404 ; mêmes cas sur `/api/bottles`, `/api/categories`, `/api/menu-sections/sections/:id` ;
  - suppression d'une unité utilisée par un cocktail → 409 ;
  - `POST /api/cocktails/:id/image` avec un buffer de 6 Mo → 413, `content-type` JSON ;
  - `POST /api/units`, `Content-Type: application/json`, corps `{` → 400 ; avec `Accept-Language: fr` → message français ;
  - `GET /api/nope` avec token → 404 JSON ;
  - `GET /api/availability/cocktails/99999` → 404.
- Adapter les assertions qui attendaient 500 sur ces cas (aucune trouvée au 8 octobre, à revérifier après rebase).

## Points d'attention

- Express 5 propage les rejets des handlers `async`, pas les erreurs levées dans un callback (`archive.on('error')`, `destination` de multer). Les laisser gérées localement.
- La forme `{ error }` ne change pas : `frontend/src/services/api.ts` continue de fonctionner, `details` est un ajout.
- `middleware/auth.ts` garde ses messages en dur (`'Unauthorized'`, `'Invalid token'`) : C-12 les traduit, C-11 réécrit ce middleware.
- La clé `errors.cannotDeleteDefaultMenu` (`menus.ts:169`) manque toujours : C-12.
- Dépend de A-02, A-03, A-05, A-10 (qui réécrivent `menus.ts`, `cocktails.ts`, `public.ts`, `settings.ts`) et de C-02. Touche toutes les routes : rien d'autre sur `routes/` pendant la PR. `availabilityService.ts` est aussi touché par C-08 : enchaîner.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
