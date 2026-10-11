---
id: C-31
title: "Restauration : prévenir l'admin qu'il devra se reconnecter"
phase: C
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-30, C-22]
touches: [frontend/src/i18n/locales/, frontend/src/pages/admin/SettingsPage.tsx]
sources: []
branch:
pr:
---

## Contexte

Depuis C-30, une restauration révoque toutes les sessions, celle qui l'a lancée comprise : le backend pose sur l'admin restauré une `tokenVersion` plus haute que toutes celles en circulation (au démarrage suivant pour une sauvegarde antérieure à v1.11.0). Le mot de passe valable est celui de la sauvegarde. Relevé pendant C-30.

## Problème constaté

- `SettingsPage.tsx` (écran de C-22) : sans rapport, le toast dit « Sauvegarde restaurée avec succès. La page va se recharger. », puis la page se recharge et l'admin arrive sur la page de connexion sans explication. Avec rapport, le bouton « Recharger la page » mène au même endroit.
- Aucun texte ne dit qu'il faudra se reconnecter, ni avec quel mot de passe. Un admin qui a changé son mot de passe depuis la sauvegarde essaie le nouveau et reçoit « identifiants invalides ».
- L'écran n'est pas faux (rien ne promet que la session reste ouverte), mais il laisse l'admin deviner.

## Ce qu'il faut faire

1. Dans la confirmation (`settings.backup.confirmRestore`) et dans le message de succès (`importSuccess`, `importDone`), dire que l'admin devra se reconnecter avec le mot de passe en vigueur à la date de la sauvegarde.
2. Textes en/fr.
3. `SettingsPage.tsx`, `handleBackupImport` : le commentaire « after an older backup, log the admin out until the backend restarts » ne vaut plus. Toute restauration déconnecte l'admin ; le rechargement automatique cacherait seulement le rapport (relevé à la revue de la PR #93).

## Critères d'acceptation

- [ ] Avant et après la restauration, l'admin sait qu'il devra se reconnecter et avec quel mot de passe.
- [ ] Aucun texte en dur.

## Tests à ajouter ou adapter

- `SettingsPage.test.tsx` : les textes de confirmation et de succès affichés (adapter les attentes existantes).

## Points d'attention

- Sauvegarde antérieure à v1.11.0 : jusqu'au redémarrage, la connexion répond 500 (avertissement de C-22 déjà affiché) ; la révocation a lieu au démarrage suivant (plancher de session de C-30). Le texte reste vrai dans les deux cas s'il parle de se reconnecter, sans dire quand la session se ferme.
- `SettingsPage.tsx` est aussi touché par C-25 : enchaîner.

## Journal

- 2026-10-11 : tâche créée pendant C-30.
- 2026-10-11 : revue de la PR #93 : ajout du commentaire de `SettingsPage.tsx` à mettre à jour ; la sauvegarde antérieure à v1.11.0 déconnecte aussi l'admin (au démarrage suivant).
