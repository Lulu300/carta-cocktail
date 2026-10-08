---
id: A-10
title: "Gestion des 401 : ne plus déconnecter sur une erreur métier, garder les messages serveur"
phase: A
lane: frontend
criticite: haute
effort: S
status: done
owner: agent
depends_on: []
touches: [frontend/src/services/api.ts, frontend/src/contexts/AuthContext.tsx, frontend/src/App.tsx, frontend/src/pages/auth/LoginPage.tsx, backend/src/routes/settings.ts, backend/src/routes/settings.test.ts, backend/src/i18n/en.json, backend/src/i18n/fr.json]
sources: ["05-frontend-archi.md §H1", "05-frontend-archi.md §3.4"]
branch: fix/A-10-api-401-handling
pr: 35
---

## Contexte

Toute réponse 401 supprime le token sans prévenir l'interface : l'admin reste affiché, mais tous les appels suivants échouent sans redirection. Le backend renvoie aussi 401 pour une erreur métier (mot de passe actuel incorrect) : une faute de frappe dans Réglages déconnecte l'admin en silence et affiche « Unauthorized » en anglais au lieu du message traduit. Tant que ce n'est pas corrigé, aucun écran ne peut afficher proprement une erreur du serveur.

## Problème constaté

- `frontend/src/services/api.ts:31-34` : sur 401, `localStorage.removeItem('token')` puis `throw new Error('Unauthorized')`. Le corps de la réponse, qui contient le message traduit, est ignoré. `AuthContext` n'est pas prévenu : `user` reste rempli.
- `backend/src/routes/settings.ts:62-67` : mot de passe actuel incorrect, réponse **401** `errors.invalidCredentials`. Côté front, `frontend/src/pages/admin/SettingsPage.tsx:89-90` affiche `err.message`, donc « Unauthorized », et le token vient d'être supprimé.
- **Précision sur la revue** : la page de connexion n'affiche pas « Unauthorized ». Elle remplace toute erreur par `t('auth.loginError')` (`frontend/src/pages/auth/LoginPage.tsx:23-24`). Le 401 du login passe bien par la purge du token, mais sans effet pratique (aucun token à ce moment).
- `api.ts:93-121` (`bottles.exportFile`), `api.ts:269-288` (`backup.exportBackup`) et `api.ts:289-303` (`backup.importBackup`) appellent `fetch` directement : aucune gestion du 401.
- `frontend/src/contexts/AuthContext.tsx` : `logout` (l.39-43) n'est pas mémoïsé et `value` (l.46) est recréé à chaque rendu. Après `login` (l.32-37), le changement de `token` relance l'effet l.20-30, qui rappelle `/auth/me` alors que `login` renvoie déjà l'utilisateur.
- `frontend/src/App.tsx:25` : `<Navigate to="/login" />` sans `replace` ni `state.from`. Après reconnexion, `LoginPage.tsx:22` renvoie toujours vers `/admin`.
- `api.ts:13-24` : pas d'en-tête `Accept-Language`. Le backend (`backend/src/i18n/index.ts`, détection par en-tête) répond dans la langue du navigateur, pas dans celle choisie dans l'UI.

## Ce qu'il faut faire

1. **Backend** (`settings.ts:65`) : répondre **400** avec une nouvelle clé `errors.invalidCurrentPassword` (en : « Current password is incorrect », fr : « Mot de passe actuel incorrect »), ajoutée dans `backend/src/i18n/en.json` et `fr.json`.
2. **`frontend/src/services/api.ts`**
   - `export class ApiError extends Error` avec `status: number` et `body?: unknown`.
   - `export function setUnauthorizedHandler(fn: (() => void) | null): void`.
   - Un helper unique `send(url, init): Promise<Response>` : pose `Authorization`, `Accept-Language` et `Content-Type` (sauf `FormData`), appelle `fetch`, et sur `!res.ok` lit `data.error` puis lève ``new ApiError(res.status, data.error ?? `HTTP ${res.status}`, data)``.
   - Sur 401 : si la requête portait un token et que l'URL n'est pas `/auth/login`, supprimer le token et appeler le handler. Le message du serveur est conservé dans tous les cas.
   - `request<T>()` s'appuie sur `send` ; `if (res.status === 204) return undefined as T`.
   - `exportFile`, `exportBackup` et `importBackup` passent par `send`.
   - `Accept-Language` : `i18n.resolvedLanguage ?? i18n.language ?? 'en'` (import de `../i18n`).
3. **`AuthContext.tsx`**
   - `logout` en `useCallback`, `value` en `useMemo`.
   - `useEffect(() => { setUnauthorizedHandler(logout); return () => setUnauthorizedHandler(null); }, [logout])`.
   - Ne valider par `/auth/me` que le token lu au montage, pas celui que `login` vient d'obtenir.
4. **`App.tsx`** : dans `ProtectedRoute`, `<Navigate to="/login" replace state={{ from: location }} />` avec `useLocation()`.
5. **`LoginPage.tsx`** : après connexion, `navigate(from ?? '/admin', { replace: true })`, où `from` vient de `location.state`. N'accepter qu'un chemin interne qui commence par `/admin`.
6. `SettingsPage` n'a pas besoin de changer : elle affiche déjà `err.message`.

Hors périmètre : toasts (E-04) ; TanStack Query (E-02) ; helper `downloadBlob` et méthodes mortes d'`api.ts` (E-14) ; « Loading... » en dur de `App.tsx:24` (E-10) ; cookie HttpOnly et révocation des tokens (C-11) ; middleware d'erreurs backend (C-03).

## Critères d'acceptation

- [x] Mot de passe actuel incorrect dans Réglages : message traduit affiché, l'admin reste connecté, le token est conservé.
- [x] Token expiré ou invalide pendant la navigation admin : redirection vers `/login` au premier appel en échec ; après reconnexion, retour à la page demandée.
- [x] Identifiants invalides sur `/login` : message `auth.loginError`, handler non appelé.
- [x] Toute erreur HTTP garde le message du serveur (`ApiError.message`) et expose `status`.
- [x] Export de bouteilles, export et import de backup : un 401 déclenche la même déconnexion que les autres appels.
- [x] Les messages d'erreur du serveur arrivent dans la langue choisie dans l'UI.
- [x] Après `login`, aucun appel supplémentaire à `/auth/me`.

## Tests à ajouter ou adapter

- `backend/src/routes/settings.test.ts` : adapter « should return 401 if currentPassword is wrong » : 400 et message anglais ; avec `Accept-Language: fr`, message français.
- `frontend/src/services/api.test.ts` :
  - adapter « should remove token on 401 response » : token présent, token supprimé, handler appelé une fois, `ApiError` avec `status 401` et le message du corps ;
  - 401 sur `auth.login` : handler non appelé ;
  - 400 avec `{ error: 'Mot de passe actuel incorrect' }` : message conservé, token conservé ;
  - 401 sur `backup.exportBackup` : handler appelé ;
  - en-tête `Accept-Language` présent ;
  - réponse 204 : `undefined`.
- `frontend/src/contexts/AuthContext.test.tsx` : appeler le handler enregistré (mock de `setUnauthorizedHandler`) : `user` et `token` passent à `null` ; après `login`, `auth.me` n'est pas rappelé.
- `frontend/src/App.test.tsx` (nouveau) : sans utilisateur, `/admin/bottles` affiche la page de connexion avec `state.from.pathname === '/admin/bottles'`.
- `frontend/src/pages/auth/LoginPage.test.tsx` : avec `state.from` à `/admin/bottles`, connexion réussie : `navigate('/admin/bottles', { replace: true })` ; un `from` externe (`https://…` ou `/menu/x`) est ignoré.

## Points d'attention

- Changement de contrat : `PUT /api/settings/profile` renvoie 400 au lieu de 401 pour un mauvais mot de passe actuel. Aucun autre client connu.
- Importer `i18n` dans `api.ts` initialise i18next dans tous les tests qui importent l'API. Si cela pose problème, injecter un getter (`setLanguageGetter`) appelé depuis `i18n/index.ts`.
- Les routes publiques ne renvoient jamais 401 (et A-05 garde ce comportement avec `optionalAuth`) : un invité avec un vieux token ne sera pas « déconnecté » en consultant la carte.
- E-01 (lazy loading) modifie aussi `App.tsx` et dépend de cette tâche.
- `backend/src/i18n/*.json` est aussi modifié par A-02 et C-12 : enchaîner.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : PR #35. Backend : 400 + `errors.invalidCurrentPassword` (en/fr). Front : `ApiError`, `send()` partagé (exports et import de backup compris), handler 401 enregistré par `AuthContext`, `Accept-Language`, 204, retour à la page demandée après connexion. Critères vérifiés par les tests automatisés (pas de vérification manuelle dans un navigateur). `App.test.tsx` remplace les pages par des stubs : les importer fait entrer une vingtaine de fichiers non testés dans le rapport et fait tomber la couverture globale front à ~56 % (angle mort suivi par B-02). Aucun fichier ajouté à `touches`, aucune nouvelle tâche.
