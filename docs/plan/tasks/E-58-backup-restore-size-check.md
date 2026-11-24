---
id: E-58
title: "Restauration : refuser dans le navigateur une archive au-delà de la limite, avant l'envoi"
phase: E
lane: frontend
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: [E-46, E-50]
touches: [frontend/src/pages/admin/SettingsPage.tsx, frontend/src/pages/admin/SettingsPage.test.tsx]
sources: []
branch: fix/E-58-backup-restore-size-check
pr: https://github.com/Lulu300/carta-cocktail/pull/201
---

## Contexte

La restauration d'une sauvegarde (Settings > Backup & Restore) envoie l'archive à `POST /api/backup/import`. Le backend limite le fichier à 200 Mo (`MAX_BACKUP_UPLOAD_BYTES`, `backend/src/services/backupService.ts`), et nginx refuse un corps de plus de 210 Mo (`client_max_body_size 210m` dans `frontend/nginx.conf.template`) avec un 413 HTML, que le frontend traduit depuis E-46 en « The file or request is too large ».

## Problème constaté

Vérifié par le coordinateur le 2026-11-24 sur une stack v1.14.0 locale, archive de 250 Mo, envoi bridé à 4 Mo/s pour durer plus que le `lingering_time` de nginx (30 s) : nginx répond 413 puis ferme la connexion pendant que le navigateur envoie encore. Safari 27.2 lit le 413 et affiche le bon message ; Chrome aussi, d'après le même mécanisme vérifié avec une photo de 25 Mo à 500 ko/s (relecture de la PR #181). **Firefox 160 ne le lit pas** : il renvoie toute la requête dix fois (un 413 toutes les 30 s dans le journal de nginx), puis affiche au bout de 300 s le message d'E-50 « la restauration est peut-être encore en cours… ne la relancez pas », faux puisque rien n'a atteint le backend. Cas réel : restauration d'une grosse archive vers un serveur domestique sur un lien montant ordinaire. Déduit pour v1.13.0, non mesuré (mêmes limites nginx, même code frontend).

Décision de l'humain (2026-11-24), mot pour mot : « Code fix, next batch » — « Task (author + reviewer) in the next batch: the backup screen refuses a file larger than the backend's limit (200 MB) before sending it, with the translated 'too large' message; no request is sent, so every browser behaves the same. Shipped in the next release. »

## Ce qu'il faut faire

1. Dans l'écran de sauvegarde, avant l'appel de restauration : si `file.size` dépasse la limite du backend, afficher le message traduit existant `requestTooLarge` d'E-46 (« The file or request is too large », en/fr), sans rien envoyer. Choix du coordinateur, conforme à la décision (« with the translated 'too large' message ») : pas de nouvelle clé. Si un message qui donne la limite paraît nécessaire, écrire une question.
2. Une seule source pour la limite côté frontend (constante commentée qui renvoie à `MAX_BACKUP_UPLOAD_BYTES` du backend), sans dupliquer de logique ; garder la traduction du 413 d'E-46 pour les autres cas.
3. Vérifier ce que montre l'écran juste après le choix du fichier (refus dès la sélection, ou au clic sur « Restore Backup ») et choisir le plus clair, en le justifiant dans la PR.

## Critères d'acceptation

- [x] Une archive de plus de 200 Mo est refusée avant tout envoi (aucune requête vers `/api/backup/import`), avec le message `requestTooLarge` en/fr.
- [x] Une archive de 200 Mo ou moins part comme avant.
- [x] Le 413 du backend ou de nginx garde son message (E-46).
- [ ] Vérifié dans Firefox avec un envoi bridé (le coordinateur sait le faire : proxy local qui limite le débit montant).

## Tests à ajouter ou adapter

- `SettingsPage.test.tsx` : fichier au-delà de la limite (message, aucune requête), fichier sous la limite (requête envoyée) ; sondes de sabotage.

## Points d'attention

- La limite du backend peut changer : un commentaire relie les deux constantes, et un test vérifie la valeur si c'est simple.
- Pas de changement backend ni nginx.

## Journal

- 2026-11-24 : tâche créée par le coordinateur après le test bridé de la relecture de la PR #200 (voir le Journal d'E-46).
- 2026-11-24 : fait (PR #201). Archive refusée dès son choix, sous le sélecteur de fichier, avec `common.requestTooLarge` et sans requête : l'admin l'apprend avant la confirmation, et le message a son propre état, si bien que choisir un fichier n'efface pas l'avertissement d'E-50. Limite du frontend `MAX_BACKUP_UPLOAD_BYTES` dans `SettingsPage.tsx`, commentée vers celle du backend. Une archive d'exactement 200 Mo part toujours, mais busboy refuse un fichier qui atteint la limite (413 du backend, bon message, lu par tous les navigateurs) : tâche E-59 créée. Critère Firefox bridé laissé au coordinateur, après le merge.
- Notes de version : sur l'écran de sauvegarde, une archive de plus de 200 Mo est refusée dès qu'on la choisit, avant tout envoi (avant : envoi complet puis refus, ou, au-delà de 210 Mo dans Firefox, dix renvois puis un faux message « la restauration est peut-être encore en cours »). Aucune action requise.
