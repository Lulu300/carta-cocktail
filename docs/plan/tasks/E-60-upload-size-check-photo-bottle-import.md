---
id: E-60
title: "Photo et import de bouteilles : refuser dans le navigateur un fichier au-delà de la limite"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [E-58]
touches: [frontend/src/components/admin/cocktails/ImagePicker.tsx, frontend/src/components/import/ImportBottlesWizard.tsx, frontend/src/components/import/FileDropzone.tsx]
sources: []
branch:
pr:
---

## Contexte

Relevé pendant E-59. E-58 refuse dans le navigateur une archive de sauvegarde au-delà de `MAX_BACKUP_UPLOAD_BYTES`, avant l'envoi. Les deux autres envois de fichiers n'ont pas cette vérification : la photo de cocktail (`ImagePicker.tsx`, limite du backend `MAX_IMAGE_BYTES`, 5 Mio) et l'import de bouteilles (`ImportBottlesWizard.tsx` avec `FileDropzone.tsx`, limite `MAX_BOTTLE_IMPORT_BYTES`, 10 Mio). Voir « File Uploads » dans `backend/AGENTS.md`.

## Problème constaté

Un fichier trop gros part en entier. Jusqu'à 20 Mio, le backend répond un 413 JSON traduit après l'envoi complet. Au-delà, nginx (`client_max_body_size 20m`) répond 413 pendant l'envoi : d'après E-46 et E-58, Firefox ne lit pas ce 413 quand l'envoi dure plus que le `lingering_time` de nginx (30 s), renvoie la requête plusieurs fois, puis affiche une erreur réseau. Non mesuré pour la photo et l'import (mécanisme vérifié pour la sauvegarde dans Firefox, et pour une photo de 25 Mo dans Chrome).

## Ce qu'il faut faire

1. Refuser au choix du fichier une photo de plus de `MAX_IMAGE_BYTES` et un fichier d'import de plus de `MAX_BOTTLE_IMPORT_BYTES`, limite incluse (un fichier d'exactement la limite part), avec le message traduit existant `common.requestTooLarge`, comme E-58.
2. Ne pas dupliquer la vérification : une fonction partagée avec `SettingsPage.tsx` si elle s'y prête.

## Critères d'acceptation

- [ ] Photo et import : un fichier de limite - 1 et de limite octets part, un fichier de limite + 1 octets est refusé sans requête, avec le message traduit.
- [ ] Les limites du frontend renvoient par un commentaire aux constantes du backend.

## Tests à ajouter ou adapter

- Tests des composants à la frontière (taille simulée comme dans `SettingsPage.test.tsx`, sans gros fichier).

## Points d'attention

- Décision produit possible : afficher la limite dans le message (aujourd'hui `requestTooLarge` ne la donne pas, choix d'E-58).

## Journal

- 2026-11-24 : tâche créée pendant E-59.
