---
id: E-25
title: "Connexion : ne plus afficher « mauvais mot de passe » pour une limite d'essais ou une erreur serveur"
phase: E
lane: frontend
criticite: haute
effort: S
status: done
owner: agent
depends_on: [C-11]
touches: [frontend/src/pages/auth/LoginPage.tsx, frontend/src/pages/auth/LoginPage.test.tsx]
sources: []
branch: fix/E-25-login-error-messages
pr: "#91"
---

## Contexte

C-11 limite les essais de connexion : après trop d'échecs, `POST /api/auth/login` répond 429 avec le message traduit `errors.tooManyAttempts`. C-11 ajoute aussi une colonne au modèle `User` : un admin qui restaure une sauvegarde antérieure à v1.11.0 sans redémarrer le backend reçoit un 500 à la connexion. Tâche ajoutée sur décision humaine, prérequis de v1.11.0.

## Problème constaté

- `frontend/src/pages/auth/LoginPage.tsx`, `handleSubmit` : le `catch` affiche `auth.loginError` (« Invalid email or password ») pour tout échec, quel que soit le statut.
- Un admin bloqué par la limite d'essais (429) ou face à une erreur serveur (500) lit « mauvais mot de passe » alors qu'il a saisi le bon. Il risque de lancer pour rien la procédure `ADMIN_RESET_PASSWORD`.

## Ce qu'il faut faire

- Garder `auth.loginError` pour un 401.
- Pour une autre `ApiError`, afficher son message, déjà traduit par le backend.
- Pour une erreur réseau ou une `ApiError` sans message, afficher le texte générique traduit `common.error`.
- Réutiliser `ApiError` de `services/api.ts` sans modifier ce fichier.

## Critères d'acceptation

- [x] Un 401 affiche `auth.loginError`.
- [x] Un 429 affiche le message du backend (`errors.tooManyAttempts` traduit), pas `auth.loginError`.
- [x] Un 500 affiche le message du backend, pas `auth.loginError`.
- [x] Une erreur réseau affiche `common.error`.
- [x] `services/api.ts` inchangé.
- [x] Couverture ≥ 80 % sur les lignes modifiées.

## Tests à ajouter ou adapter

- `LoginPage.test.tsx` : message affiché pour un 401, un 429, un 500, une erreur réseau et une `ApiError` sans message.

## Points d'attention

- Une page d'erreur HTML de nginx (502, 504 pendant un redémarrage du backend) donne aujourd'hui une `ApiError` dont le message vaut « HTTP 502 ». La page de connexion l'affiche tel quel. E-17 remplacera ce message par un texte traduit dans `services/api.ts`, sans changement nécessaire ici.

## Journal

- 2026-10-11 : tâche créée sur décision humaine, prérequis de v1.11.0.
- 2026-10-11 : fait dans la PR #91. `getLoginErrorMessage()` dans `LoginPage.tsx` choisit le message selon le statut de l'`ApiError`. Couverture des lignes modifiées : 100 %.
