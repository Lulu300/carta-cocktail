---
id: F-01
title: "Images optimisées à l'upload (sharp, WebP, srcset)"
phase: F
lane: backend
criticite: basse
effort: M
status: todo
owner: agent
depends_on: [A-01, C-09, C-15]
touches: [backend/src/services/cocktail, backend/package.json, backend/package-lock.json, frontend/src/pages/public/, frontend/src/utils/uploads.ts]
sources: ["06-frontend-ux-perf.md §1"]
branch:
pr:
---

## Contexte

Les invités consultent la carte sur leur téléphone, souvent sur le wifi du bar. Une photo de smartphone de 3 à 5 Mo s'affiche dans une vignette de 400 px : sur une carte de 30 cocktails, la page peut dépasser 100 Mo. Les photos gardent aussi leurs métadonnées EXIF, dont la position GPS du lieu de prise de vue.

## Problème constaté

- `backend/src/routes/cocktails.ts:19-41` : multer écrit le fichier tel quel (`Date.now()-random.ext`), limite 5 Mo, sans redimensionnement ni conversion. `:600` enregistre `imagePath = req.file.filename`.
- `backend/src/app.ts:35` : `express.static(config.uploadDir)` sert l'original, sans `Cache-Control` explicite.
- `frontend/src/pages/public/PublicCocktailItem.tsx:44-48` et `CocktailPublicPage.tsx:67-71` : `<img>` sans `srcset`, `sizes`, `loading="lazy"` ni `decoding="async"`.
- `frontend/src/utils/uploads.ts` : `getUploadUrl()` ne connaît qu'un seul fichier par image.
- Les métadonnées EXIF ne sont pas retirées (aucun traitement d'image dans le backend).

## Ce qu'il faut faire

1. Attendre C-09 : la logique d'upload et de suppression d'image doit déjà vivre dans `backend/src/services/cocktail/`.
2. Ajouter `sharp` aux dépendances backend.
3. Dans le service d'image, après l'upload multer (passer multer en `memoryStorage`) :
   - `sharp(buffer).rotate()` pour appliquer l'orientation EXIF, puis suppression des métadonnées (comportement par défaut de sharp en sortie) ;
   - écrire `<base>.webp` (largeur max 1600), `<base>-960.webp` et `<base>-480.webp`, qualité ~80 ;
   - `imagePath` garde le nom de base (`<base>.webp`). Les variantes se déduisent du nom, sans changement de schéma.
4. Suppression et remplacement d'image : supprimer aussi les variantes.
5. Script de rattrapage idempotent pour les images existantes (commande `node dist/scripts/image-variants.js` ou exécution au démarrage si une variante manque). Ne pas supprimer les originaux existants.
6. Frontend : ajouter dans `utils/uploads.ts` un `getUploadSrcSet(imagePath)` qui renvoie `"<480> 480w, <960> 960w, <base> 1600w"`, et l'utiliser dans les deux pages publiques avec `sizes`, `loading="lazy"` et `decoding="async"` (`fetchPriority="high"` sur l'image principale de `CocktailPublicPage`).

## Critères d'acceptation

- [ ] Un upload JPEG de 4 Mo produit trois fichiers WebP, le plus grand fait moins de 400 Ko.
- [ ] Les fichiers produits ne contiennent plus de bloc EXIF ni de GPS (`exiftool` ou `sharp(...).metadata()`).
- [ ] Une photo prise en portrait s'affiche dans le bon sens.
- [ ] La carte publique charge la variante 480 sur un viewport mobile (onglet Réseau).
- [ ] Supprimer un cocktail supprime ses trois fichiers.
- [ ] Les images importées avant la tâche s'affichent toujours, avec ou sans rattrapage.
- [ ] Tests, `tsc` et couverture OK dans les deux paquets.

## Tests à ajouter ou adapter

- Backend : tests du service avec une vraie petite image générée par sharp (pas `fake-png-data`) : variantes créées, dimensions, absence d'EXIF, rotation, suppression. Écrire dans le dossier temporaire d'A-01/B-03.
- Frontend : test de `getUploadSrcSet` et présence de `srcset`/`loading` dans `PublicCocktailItem`.
- Smoke D-08 : vérifier que l'upload de 2,5 Mo renvoie toujours 200 et une image servie.

## Points d'attention

- Décisions à valider avant de commencer :
  - garder ou non l'original non compressé (pour une réimpression haute qualité) ;
  - format : WebP seul, ou JPEG en plus pour les aperçus Open Graph de F-03 (WhatsApp gère mal le WebP en `og:image`) ;
  - relever la limite multer (5 Mo) maintenant que le serveur réduit les images, en cohérence avec `client_max_body_size` d'A-06.
- `touches` complété avec `frontend/src/utils/uploads.ts`.
- sharp embarque des binaires natifs par plateforme (`@img/sharp-linuxmusl-x64`, `-arm64`). Vérifier le build de l'image arm64 (D-05) et que le lockfile généré sur macOS contient bien les variantes Linux.
- Les backups (C-05) incluent tout `uploads/` : leur taille baisse, mais une restauration d'un ancien backup réintroduit des originaux sans variantes. Le rattrapage de l'étape 5 couvre ce cas.
- Noms uniques par upload : A-06 peut alors servir `/uploads/` avec un cache long et `immutable`.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
