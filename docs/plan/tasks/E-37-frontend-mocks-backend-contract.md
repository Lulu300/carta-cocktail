---
id: E-37
title: "Mocks et types du frontend alignés sur les réponses du backend depuis C-12"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-12]
touches: [frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/test/msw/handlers.ts, frontend/src/pages/admin/CategoriesPage.test.tsx, frontend/src/contexts/AuthContext.test.tsx]
sources: []
branch:
pr:
---

## Contexte

C-12 (PR #166) a changé trois réponses du backend :

- `DELETE /api/category-types/:name` d'un type encore utilisé : 409 `errors.typeInUse` (« Cannot delete: categories still use this type ») au lieu de 400 « Type is in use by categories » ;
- `POST /api/ingredients/bulk-availability` : `{ message, updated }` au lieu de `{ updated }` ;
- 401 d'un token invalide : `errors.invalidToken` (« Your session has expired or is no longer valid: sign in again ») au lieu de « Invalid token ». Le 401 sans token garde le texte anglais « Unauthorized ».

Le comportement du frontend ne change pas (relecture de la PR #166) : `describeMutationError` affiche le message reçu quel que soit le statut, `services/api.ts` et `AuthContext` ferment la session sur tout 401, et `IngredientsPage` ne lit pas la réponse de `bulk-availability`. Les tests passent, mais certains mocks et un type décrivent encore l'ancien contrat.

## Problème constaté

Relevé sur `develop` (9799168) :

- `frontend/src/pages/admin/CategoriesPage.test.tsx:405` : `mockApiError('delete', '/api/category-types/:name', 400, 'Type is in use by categories')`, et `:412` attend ce texte dans le toast ;
- `frontend/src/test/msw/handlers.ts:107` : le handler de `POST /api/ingredients/bulk-availability` répond `{ updated: 0 }` ;
- `frontend/src/services/api.test.ts:385` : `mockOk({ updated: 5 })` avant `api.ingredients.bulkAvailability(…)` ;
- `frontend/src/contexts/AuthContext.test.tsx:49` : `mockApiError('get', '/api/auth/me', 401, 'Invalid token')` ;
- `frontend/src/services/api.test.ts:360`, `:747` et `:759` : un token est présent (`localStorage` `token` = `'expired-token'`) et le mock répond `401 { error: 'Unauthorized' }`. Pour un token présent mais invalide, le backend répond `errors.invalidToken` (et répondait « Invalid token » avant C-12). Ces tests ne vérifient que le statut 401 : la correction ne change que la donnée de test ;
- `frontend/src/services/api.ts:215` : `bulkAvailability` typé `request<{ updated: number }>`.

Un mock qui décrit une réponse que le backend ne donne plus trompe la personne qui lit ou étend le test.

## Ce qu'il faut faire

1. `CategoriesPage.test.tsx` : mocker un 409 avec le texte actuel (« Cannot delete: categories still use this type ») ; le test garde son intention (le message du backend s'affiche dans le toast).
2. `test/msw/handlers.ts` : `bulk-availability` répond `{ message, updated }`.
3. `services/api.test.ts` : même forme pour le `mockOk` de `bulkAvailability`.
4. `AuthContext.test.tsx:49` et `services/api.test.ts:360`, `:747`, `:759` : texte actuel du 401 d'un token invalide.
5. `services/api.ts` : `bulkAvailability` typé `request<{ message: string; updated: number }>`, comme les autres actions qui renvoient un `message` et des compteurs (`menuBottles.sync`).
6. Chercher d'autres mocks de l'ancien contrat (`grep` des textes anglais en dur du backend avant C-12, par exemple « Type », « Invalid token », « Section deleted », « Sections reordered », « Type deleted ») et les aligner. Un mock `'Unauthorized'` n'est juste que pour une requête sans token : avec un token présent (même expiré), le texte est celui de `errors.invalidToken`. `queryClient.test.ts:11` (`new ApiError(401, 'Unauthorized')`) n'est pas un mock du backend et reste tel quel. Un fichier trouvé hors `touches` s'y ajoute, avec une ligne de Journal.

## Critères d'acceptation

- [ ] Plus aucun mock ni type du frontend ne décrit une réponse que le backend de `develop` ne donne plus (liste ci-dessus, plus ce que trouve l'étape 6).
- [ ] `bulkAvailability` est typé `{ message: string; updated: number }`.
- [ ] `npm test`, lint et `tsc -b` passent ; aucun comportement de l'interface ne change.

## Tests à ajouter ou adapter

Pas de nouveau test : les tests listés plus haut sont adaptés et doivent rester verts. Vérifier que le test de `CategoriesPage` échoue toujours si le toast n'affiche plus le message du backend.

## Points d'attention

- Ne pas changer `describeMutationError` ni la gestion des 401 : C-12 n'a rien changé au comportement côté client.
- Les textes mockés sont ceux de l'anglais du backend (`backend/src/i18n/en.json`) ; ce sont des données de test, pas des textes affichés par le frontend : la règle i18n ne s'y applique pas.
- `test/msw/handlers.ts` est partagé par beaucoup de tests : `npm test` complet avant la PR.

## Journal

- 2026-11-12 : tâche créée par la PR docs de suivi du lot D-35/E-18/B-20/C-12 à partir de la relecture de la PR #166 (C-12). Les emplacements sont vérifiés sur `develop` (9799168) ; `services/api.test.ts:385` s'ajoute aux quatre que citait la relecture, et `services/api.test.ts:360`, `:747`, `:759` (401 avec un token présent) ont été ajoutés après la relecture de la PR #167.
