---
id: C-16
title: "Signaler au démarrage un dossier d'uploads non monté ou des photos introuvables"
phase: C
lane: backend
criticite: haute
effort: S
status: todo
owner: agent
depends_on: []
touches: [backend/src/index.ts, backend/src/config.ts, backend/src/services/uploadsCheck.ts, backend/src/services/uploadsCheck.test.ts]
sources: ["07-devops-history.md §2.1"]
branch:
pr:
---

## Contexte

Depuis la v1.5.0, l'image backend fixe `UPLOAD_DIR=/app/uploads` (`backend/Dockerfile`, `resolveUploadDir` dans `backend/src/config.ts`). La v1.4.0 écrivait les photos dans `/uploads` : certaines instances montaient donc leurs photos sur `/uploads` (bind mount `./uploads:/uploads`).

Le banc de mise à jour (D-15) le montre sur une instance réelle : après la mise à jour, le backend lit et écrit dans `/app/uploads`, qui n'est pas monté. Aucune photo n'est servie (42 sur 42 en 404) alors qu'elles sont toujours sur l'hôte. Si l'on suit les notes de la v1.5.0, les photos recopiées dans `/app/uploads` vont dans le conteneur et disparaissent à la mise à jour suivante. Rien ne prévient l'administrateur.

## Problème constaté

- Le backend démarre sans rien signaler quand son dossier d'uploads n'est pas un montage (volume ou bind mount) : toute photo envoyée est perdue à la recréation du conteneur.
- Le backend ne signale pas non plus les photos référencées en base (`Cocktail.imagePath`) qui manquent dans le dossier d'uploads.

## Ce qu'il faut faire

1. Au démarrage, après la connexion à la base, vérifier le dossier d'uploads :
   - dans un conteneur (présence de `/.dockerenv` ou équivalent), signaler par un `warning` dans les logs que `UPLOAD_DIR` n'est pas un point de montage (comparer `/proc/self/mountinfo` au chemin résolu, ou le device du dossier à celui de son parent) ;
   - compter les `imagePath` de la table `Cocktail` dont le fichier manque dans le dossier d'uploads, et logguer le nombre (pas les noms de fichiers ni de cocktails) avec le chemin du dossier.
2. Ne jamais bloquer le démarrage : simple avertissement, en anglais, avec un renvoi vers `UPGRADING.md`.
3. Exposer le résultat pour F-09 (guide de mise à jour dans l'application), par exemple via une fonction de service réutilisable, afin que l'interface admin puisse afficher l'alerte.

## Critères d'acceptation

- [ ] Un backend dont le dossier d'uploads n'est pas un montage logge un avertissement explicite au démarrage, dans un conteneur.
- [ ] Le nombre de photos référencées introuvables est loggué au démarrage quand il est supérieur à 0.
- [ ] Le démarrage n'est jamais bloqué, et rien n'est loggué quand tout va bien.
- [ ] Le banc `scripts/upgrade-test/` (layout `friend`, à partir de 1.5.0) montre l'avertissement dans les logs.

## Tests à ajouter ou adapter

- Tests unitaires du service : dossier monté ou non (lecture de `mountinfo` simulée), photos présentes, manquantes, aucune photo référencée.

## Points d'attention

- Hors conteneur (développement local), le dossier n'est pas un montage : pas d'avertissement dans ce cas.
- Les logs ne doivent contenir ni noms de cocktails ni noms de fichiers : seulement des compteurs et le chemin du dossier.
- Coordination avec F-09 pour l'affichage dans l'interface.

## Journal

- 2026-10-10 : tâche créée pendant D-15 (anomalie du montage `/uploads` trouvée par le banc de mise à jour, PR #46).
