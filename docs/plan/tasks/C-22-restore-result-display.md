---
id: C-22
title: "Restauration : afficher les fichiers ignorés et le redémarrage conseillé"
phase: C
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-05, E-04]
touches: [frontend/src/pages/admin/SettingsPage.tsx, frontend/src/services/api.ts, frontend/src/i18n/locales/]
sources: []
branch:
pr:
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

- [ ] `skippedFiles > 0` affiche le nombre de fichiers ignorés.
- [ ] `restartRecommended: true` affiche l'avertissement de redémarrage.
- [ ] Aucun texte en dur.

## Tests à ajouter ou adapter

- Test de `SettingsPage` : réponse simulée avec `skippedFiles: 2, restartRecommended: true`, puis `0, false`.

## Points d'attention

- Après E-04 : les messages passent par les toasts.
- Le libellé de l'avertissement dépend du déploiement (Docker : redémarrer le conteneur backend).

## Journal

- 2026-10-11 : tâche créée par C-05 (nouvelle forme de la réponse d'import).
