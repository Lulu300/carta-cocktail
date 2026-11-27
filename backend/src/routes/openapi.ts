import { Router, type Application, type Request, type Response } from 'express';
import { appVersion } from '../config';
import { authMiddleware } from '../middleware/auth';
import { buildOpenApiDocument, type DocumentScope } from '../openapi/document';
import { collectApiRoutes } from '../openapi/operations';
import { apiDocs } from '../openapi/routeDoc';
import { OpenApiDocument } from '../validation/openapi';

const router = Router();
const doc = apiDocs('Documentation');

// Two URLs rather than one answer per token: each URL always answers the same document, so no
// cache (browser, proxy, service worker) can hand the admin's document to a guest or the
// reverse, and an expired session answers 401 instead of a shorter document.

// The routes do not change once the app is built: each document is built on its first request
const documents = new WeakMap<Application, Partial<Record<DocumentScope, object>>>();

function documentOf(app: Application, scope: DocumentScope): object {
  const built = documents.get(app) ?? {};
  documents.set(app, built);
  const document =
    built[scope] ?? buildOpenApiDocument(collectApiRoutes(app), { scope, version: appVersion() });
  built[scope] = document;
  return document;
}

router.get(
  '/openapi.json',
  doc({
    operationId: 'getPublicOpenApiDocument',
    summary: 'OpenAPI document of the public routes',
    description:
      'The routes a client can call without signing in: the public menus, the sign-in, the health check and this document.',
    responses: { 200: OpenApiDocument },
  }),
  (req: Request, res: Response) => {
    // Revalidated: an upgrade changes it, and the ETag spares the download otherwise
    res.set('Cache-Control', 'no-cache').json(documentOf(req.app, 'public'));
  },
);

router.get(
  '/openapi/full.json',
  doc({
    operationId: 'getOpenApiDocument',
    summary: 'OpenAPI document of every route',
    description: 'Admin routes included. The API page of the admin reads it.',
    responses: { 200: OpenApiDocument },
  }),
  authMiddleware,
  (req: Request, res: Response) => {
    res.set('Cache-Control', 'private, no-store').json(documentOf(req.app, 'full'));
  },
);

export default router;
