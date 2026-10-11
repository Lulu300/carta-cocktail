---
id: E-19
title: "Annuler les requêtes abandonnées : passer le signal de TanStack Query à fetch"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [E-02]
touches: [frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/queries/]
sources: ["05-frontend-archi.md §3.1"]
branch:
pr:
---

## Contexte

E-02 a posé TanStack Query : chaque hook de lecture (`frontend/src/queries/*.ts`) appelle une méthode de `services/api.ts`. TanStack fournit à chaque `queryFn` un `AbortSignal`, déclenché quand la requête n'a plus d'observateur (page quittée avant la réponse) ou quand elle est annulée (`cancelQueries`, `invalidateQueries` avec `cancelRefetch`). Le client API l'ignore : la requête HTTP va jusqu'au bout pour rien.

## Problème constaté

- `frontend/src/services/api.ts`, `send()` et `request()` : aucun paramètre `signal`, et les méthodes `list()` / `get()` n'en acceptent pas. La revue (`05-frontend-archi.md §3.1`) note qu'aucune requête n'est annulée dans le code (`AbortController` absent).
- Les hooks de `frontend/src/queries/` appellent `xxxApi.list()` sans transmettre le `signal` du contexte de requête.
- Effet visible aujourd'hui limité : le cache par clé empêche une vieille réponse d'écraser une plus récente. Mais une navigation rapide entre pages admin laisse partir des requêtes inutiles (listes complètes avec relations), et un `invalidateQueries` sur une requête déjà chargée annule côté TanStack sans couper le réseau. C'est pour cela qu'E-02 passe `cancelRefetch: false` dans l'invalidation transitoire d'`AdminLayout`.

## Ce qu'il faut faire

1. `services/api.ts` : accepter un `signal?: AbortSignal` optionnel dans les méthodes de lecture utilisées par `queries/` (`list`, `get`, `availability.getAllCocktails`), et le transmettre à `fetch` via `init.signal`.
2. `queries/*.ts` : passer le signal du contexte, par exemple `queryFn: ({ signal }) => bottlesApi.list(undefined, signal)`, sans casser l'appel sans argument utilisé ailleurs.
3. Une requête annulée lève une `AbortError` (`DOMException`) : vérifier que `send()` ne la transforme pas en `ApiError` et que `shouldRetryQuery` ne la relance pas (TanStack ignore déjà les annulations, à confirmer par un test).

## Critères d'acceptation

- [ ] Quitter une page admin avant la fin de son chargement annule la requête (onglet Réseau : « (canceled) »).
- [ ] Aucun message d'erreur affiché pour une requête annulée.
- [ ] Les appels existants sans signal fonctionnent comme avant.
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit` passent ; couverture ≥ 80 % sur les lignes modifiées.

## Tests à ajouter ou adapter

- `frontend/src/services/api.test.ts` : le `signal` passé à `list()` arrive dans l'appel à `fetch` ; une requête annulée rejette avec une `AbortError`, pas une `ApiError`.
- `frontend/src/queries/readHooks.test.ts` : le hook transmet un `AbortSignal` à la méthode de l'API.

## Points d'attention

- E-05, E-06 et E-07 ajoutent des mutations dans `queries/` ; E-07, E-15 et E-17 modifient `services/api.ts` : enchaîner plutôt que lancer en parallèle.
- Ne pas confondre avec l'annulation des téléchargements (`requestBlob`, export ZIP), hors périmètre.
- Une fois le signal transmis, l'option `cancelRefetch: false` d'`AdminLayout` reste utile pour ne pas envoyer deux requêtes ; elle disparaît de toute façon avec l'invalidation transitoire (E-05).

## Journal

- 2026-10-10 : tâche créée pendant E-02 (point d'attention « `request()` ignore le `signal` » de la tâche E-02).
