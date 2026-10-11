---
id: C-25
title: "Admin : bouton « Se déconnecter partout » et validation du token au démarrage"
phase: C
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-11]
touches: [frontend/src/contexts/AuthContext.tsx, frontend/src/services/api.ts, frontend/src/pages/admin/SettingsPage.tsx, frontend/src/i18n/locales/]
sources: ["03-security.md §7"]
branch:
pr:
---

## Contexte

C-11 ajoute `POST /api/auth/logout-all` : la route incrémente `User.tokenVersion`, ce qui révoque tous les tokens existants (celui de la requête compris), et répond `{ message }` traduit (`auth.loggedOutEverywhere`). Le frontend ne l'appelle pas encore. Relevé pendant C-11 (PR #82).

## Problème constaté

- Aucun bouton n'appelle `logout-all` : un admin qui pense qu'un token a fuité (appareil perdu, navigateur partagé) doit changer son mot de passe pour le révoquer.
- `frontend/src/contexts/AuthContext.tsx` : au démarrage, `authApi.me().catch(logout)` efface le token pour **toute** erreur. Une erreur 5xx ou réseau (backend en cours de redémarrage, migration au démarrage) déconnecte l'admin, alors que seul un 401 devrait le faire. Le 401 est déjà géré par `setUnauthorizedHandler` dans `services/api.ts`. Noté dans les Points d'attention de C-11 et laissé hors de sa PR.

## Ce qu'il faut faire

1. `services/api.ts` : `auth.logoutAll()` → `POST /auth/logout-all`.
2. `SettingsPage.tsx`, section profil : bouton secondaire « Se déconnecter de tous les appareils », avec confirmation (`useConfirm`). Après succès, `logout()` puis retour à `/login` (le token courant est révoqué lui aussi).
3. `AuthContext.tsx` : au démarrage, ne déconnecter que sur un 401 (`ApiError` avec `status === 401`). Sur une autre erreur, décider du comportement (garder le token et réessayer, ou afficher une erreur) sans effacer le token.
4. Clés i18n en/fr du bouton et de la confirmation.

## Critères d'acceptation

- [ ] Le bouton révoque tous les tokens et renvoie l'admin à la page de connexion.
- [ ] Une erreur 500 ou réseau sur `/auth/me` au démarrage n'efface pas le token.
- [ ] Un 401 sur `/auth/me` au démarrage déconnecte toujours.

## Tests à ajouter ou adapter

- `SettingsPage.test.tsx` : confirmation acceptée → `logoutAll` puis `logout` ; annulée → rien.
- `AuthContext.test.tsx` : `me()` rejeté avec `ApiError(500)` → token conservé ; `ApiError(401)` → token effacé.

## Points d'attention

- `SettingsPage.tsx` est aussi touché par C-22 : enchaîner.
- Restaurer une sauvegarde ramène le `User.tokenVersion` de la sauvegarde : un token révoqué après la date de la sauvegarde (changement de mot de passe, « Se déconnecter partout ») redevient valable jusqu'à son expiration. Au choix : recommander « Se déconnecter partout » après une restauration, ou faire poser par la restauration `tokenVersion` = max(actuel, restauré) + 1 (relevé à la revue de la PR #82).

## Journal

- 2026-10-11 : tâche créée pendant C-11 (PR #82).
