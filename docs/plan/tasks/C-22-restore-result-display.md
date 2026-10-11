---
id: C-22
title: "Restauration : afficher les fichiers ignorés et le redémarrage conseillé"
phase: C
lane: frontend
criticite: haute
effort: S
status: done
owner: agent
depends_on: [C-05, E-04]
touches: [frontend/src/pages/admin/SettingsPage.tsx, frontend/src/services/api.ts, frontend/src/i18n/locales/]
sources: []
branch: fix/C-22-restore-result-display
pr: "#88"
---

## Contexte

C-05 change la réponse de `POST /api/backup/import` : `{ message, skippedFiles, restartRecommended }` au lieu de `{ success, message }`. Le frontend n'en lit rien et affiche toujours le même message de succès.

## Problème constaté

- `frontend/src/services/api.ts` (`importBackup`) type encore la réponse `{ success: boolean; message: string }`.
- `SettingsPage.tsx` ignore `skippedFiles` : l'admin ne sait pas que des fichiers de `uploads/` (autres que jpg, jpeg, png, webp) n'ont pas été restaurés.
- `restartRecommended: true` (sauvegarde d'un schéma plus ancien) n'est pas affiché : l'application tourne sur l'ancien schéma jusqu'au redémarrage, qui applique les migrations manquantes.
- Les nouvelles réponses d'erreur (400 `errors.backupSchemaTooNew`, 413 au-delà de 200 Mo) s'affichent déjà via le message `error` du backend.

## Ce qu'il faut faire

1. Typer la réponse d'`importBackup` : `{ message: string; skippedFiles: number; restartRecommended: boolean }`.
2. Après une restauration réussie, afficher le nombre de fichiers ignorés s'il est non nul, et un avertissement « redémarrez le conteneur backend » si `restartRecommended`.
3. Textes en/fr dans les locales.

## Critères d'acceptation

- [x] `skippedFiles > 0` affiche le nombre de fichiers ignorés.
- [x] `restartRecommended: true` affiche l'avertissement de redémarrage.
- [x] Aucun texte en dur.

## Tests à ajouter ou adapter

- Test de `SettingsPage` : réponse simulée avec `skippedFiles: 2, restartRecommended: true`, puis `0, false`.

## Points d'attention

- Après E-04 : les messages passent par les toasts.
- Le libellé de l'avertissement dépend du déploiement (Docker : redémarrer le conteneur backend).
- Sauvegardes v1.0.x (avant `Category.minimumPercent`) : `restartRecommended` vaut `true`, mais leur schéma ne correspond pas à la baseline `0_init` ; au redémarrage, l'entrypoint de C-01 refuse la baseline (`refuse_baseline`) et le backend ne démarre pas. Limite de mise à jour existante de C-01, pas une régression de C-05. Le message ne doit pas promettre qu'un redémarrage suffit (renvoyer par exemple vers `UPGRADING.md`).

## Journal

- 2026-10-11 : tâche créée par C-05 (nouvelle forme de la réponse d'import).
- 2026-10-11 : prérequis de la release qui livre C-11 (décision humaine, revue de la PR #82). C-11 ajoute la colonne `User.tokenVersion` : après la restauration d'une sauvegarde faite avant cette release, la table `User` n'a plus cette colonne jusqu'au redémarrage du backend. La connexion (mot de passe correct ou non), `GET /api/auth/me` et toute route authentifiée répondent 500, et `GET /api/public/menus` aussi pour un navigateur qui envoie un token (`optionalAuth` lit `User`) ; seuls les visiteurs sans token gardent la carte. Côté admin : toast de succès, rechargement après 1,5 s, `/auth/me` en 500, `.catch(logout)`, puis « Internal server error » à chaque essai de connexion, sans rien qui dise de redémarrer. Toutes les sauvegardes antérieures à cette release sont concernées (`restartRecommended` compare avec la dernière migration), y compris celles de v1.8.0 à v1.10.0 pour lesquelles les notes v1.10.0 et `UPGRADING.md` ne demandent aucun redémarrage. Un redémarrage suffit (`migrate deploy` n'a que l'`ADD COLUMN` à appliquer).
- 2026-10-11 : fait (PR #88). Sans rien à signaler, la page se recharge comme avant. Sinon, pas de rechargement automatique : il cacherait le rapport et, après une sauvegarde ancienne, déconnecterait l'admin jusqu'au redémarrage. Le rapport affiche l'avertissement de redémarrage (connexion et admin en erreur d'ici là, renvoi vers `UPGRADING.md` pour v1.0.x et les doublons d'avant v1.8.0), le nombre de fichiers ignorés et un bouton « Recharger la page ». Aucune action utilisateur nouvelle.
