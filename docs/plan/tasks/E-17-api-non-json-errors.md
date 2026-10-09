---
id: E-17
title: "Erreurs HTTP sans corps JSON (413 nginx, 502-504) : message traduit au lieu de « HTTP 413 »"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: []
touches: [frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/i18n/locales/]
sources: ["07-devops-history.md §2.4", "05-frontend-archi.md §3.2"]
branch:
pr:
---

## Contexte

En Docker, nginx est la seule porte d'entrée. Quand il refuse une requête lui-même (corps trop gros) ou ne joint pas le backend, il répond avec une page HTML, pas avec le JSON `{ error }` d'Express. Le client API du frontend ne trouve alors aucun message et affiche le code brut. C-03 traite le 413 JSON d'Express (multer, `express.json`), pas celui de nginx.

## Problème constaté

- `frontend/src/services/api.ts`, fonction `send()` : `readErrorBody()` renvoie `{}` quand le corps n'est pas du JSON, puis le message vaut `` `HTTP ${res.status}` ``. L'utilisateur voit « HTTP 413 ».
- `frontend/nginx.conf.template` (A-06) : `client_max_body_size 20m` au niveau `server`, `512m` sur `location = /api/backup/import`. Au-delà, nginx répond 413 en HTML : photo de cocktail de plus de 20 Mo, fichier d'import de bouteilles de plus de 20 Mo, archive de sauvegarde de plus de 512 Mo.
- Même mécanisme pour les pages d'erreur de nginx quand le backend est arrêté ou en cours de redémarrage (502, 504) : « HTTP 502 ».
- Les fichiers de traduction du frontend (`frontend/src/i18n/locales/en.json`, `fr.json`) n'ont pas de section `errors` ; il existe seulement `common.error` (« An error occurred »).

## Ce qu'il faut faire

1. `frontend/src/i18n/locales/en.json` et `fr.json` : ajouter `errors.fileTooLarge` (« The file is too large. » / « Le fichier est trop volumineux. ») et `errors.serverUnavailable` (« The server is unavailable, try again in a moment. » / « Le serveur est indisponible, réessayez dans un instant. »).
2. `services/api.ts` : extraire une petite fonction `fallbackErrorMessage(status: number): string`, utilisée par `send()` quand le corps ne contient pas d'`error` texte :
   - 413 → `i18n.t('errors.fileTooLarge')` ;
   - 502, 503, 504 → `i18n.t('errors.serverUnavailable')` ;
   - autre statut → `i18n.t('common.error')` ; le code reste disponible dans `ApiError.status` pour le diagnostic.
3. Le message JSON du serveur reste prioritaire : un 413 d'Express (après C-03) garde son texte traduit côté backend.

## Critères d'acceptation

- [ ] Une réponse 413 avec un corps HTML donne une `ApiError` de statut 413 dont le message est la traduction de `errors.fileTooLarge`, dans la langue de l'UI.
- [ ] Une réponse 502 ou 504 en HTML donne le message `errors.serverUnavailable`.
- [ ] Une réponse 413 avec `{ "error": "..." }` garde le message du serveur.
- [ ] Plus aucun « HTTP <code> » affiché à l'utilisateur.

## Tests à ajouter ou adapter

- `frontend/src/services/api.test.ts` :
  - `fetch` simulé qui renvoie 413 avec un corps `<html>…</html>` → message `errors.fileTooLarge`, en `en` puis en `fr` ;
  - 502 en HTML → `errors.serverUnavailable` ;
  - 413 avec un corps JSON `{ error: 'Too big' }` → `'Too big'` ;
  - statut inconnu sans corps (418) → `common.error`.
- Adapter les trois tests existants qui attendent le message brut : « should throw with HTTP status when no error message » (`HTTP 500`), « exportBackup throws HTTP status… » (`HTTP 503`), « importBackup throws HTTP status… » (`HTTP 422`).

## Points d'attention

- Le 401 garde son traitement actuel (`handleUnauthorized`, A-10) : ne pas le faire passer par le message de repli avant l'appel du handler.
- E-07 et E-15 modifient aussi `services/api.ts`, E-10 les fichiers de traduction : enchaîner.
- E-04 affichera ces messages dans des toasts ; cette tâche ne change que le texte de l'`ApiError`.
- Relevé en revue de A-06 : la limite nginx est désormais atteignable (20 Mo, 512 Mo), et le message brut est la seule chose que voit l'admin.

## Journal

- 2026-10-08 : tâche créée à partir des revues de PR de la phase A (A-06, A-10).
