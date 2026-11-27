---
id: F-01
title: "Images optimisées à l'upload (sharp, WebP, srcset)"
phase: F
lane: backend
criticite: basse
effort: M
status: done
owner: agent
depends_on: [A-01, C-09, C-15]
touches: [backend/src/services/cocktail, backend/package.json, backend/package-lock.json, frontend/src/pages/public/, frontend/src/utils/uploads.ts, backend/src/routes/public.ts, backend/src/services/backupService.ts, backend/src/index.ts, backend/src/services/uploadsCheck.ts, backend/src/i18n/, backend/src/test/, backend/Dockerfile, backend/AGENTS.md, frontend/AGENTS.md, docs/operations.md, scripts/smoke/smoke.sh]
sources: ["06-frontend-ux-perf.md §1"]
branch: feature/F-01-optimized-images
pr: 287
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

- [x] Un upload JPEG de 4 Mo produit trois fichiers WebP, le plus grand fait moins de 400 Ko.
- [x] Les fichiers produits ne contiennent plus de bloc EXIF ni de GPS (`exiftool` ou `sharp(...).metadata()`).
- [x] Une photo prise en portrait s'affiche dans le bon sens.
- [x] La carte publique charge la variante 480 sur un viewport mobile (onglet Réseau).
- [x] Supprimer un cocktail supprime ses trois fichiers.
- [x] Les images importées avant la tâche s'affichent toujours, avec ou sans rattrapage.
- [x] Tests, `tsc` et couverture OK dans les deux paquets.

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
- Images hors carte (relevé en revue de A-05, impact faible) : `express.static(config.uploadDir)` (`app.ts`) et la `location ^~ /uploads/` de nginx servent tout fichier de `uploads/` sans contrôle d'accès. L'image d'un cocktail absent des menus publics reste accessible par `/uploads/<fichier>` à qui connaît le nom, même si A-05 ne publie plus son `imagePath`. Le nom actuel (`Date.now()-<aléa 0..1e9>.ext`) se devine mal mais n'est pas un secret. Puisque cette tâche change le nommage, prendre une base non devinable (`crypto.randomUUID()`) ; un vrai contrôle (servir l'image seulement si le cocktail est sur une carte publique) imposerait une route à la place du statique et casserait le cache long d'A-06 : non retenu sauf décision contraire.
- Noms uniques par upload : A-06 peut alors servir `/uploads/` avec un cache long et `immutable`.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : suivi des revues de la phase A. Point d'attention ajouté : images de cocktails hors carte toujours servies par `/uploads/<fichier>` ; base de nom non devinable à prévoir avec le nouveau nommage.
- 2026-11-26 : fait (PR #287). Décisions du coordinateur appliquées : variante JPEG `<base>-og.jpg` (1200 px) en plus des WebP, `og:image` de F-03 pointe dessus (repli sur la photo tant qu'elle manque) ; originaux existants jamais supprimés ni réécrits ; rattrapage idempotent qui n'ajoute que les copies manquantes. Choix restants : l'envoi lui-même n'est pas gardé (il garderait le GPS dans un fichier servi par `/uploads/`) ; limite de 5 Mio inchangée (décision produit non prise). Upload : multer en `memoryStorage`, sharp `rotate()` sans métadonnées, `<uuid>.webp` (1600 px, nom stocké), `-960.webp`, `-480.webp`, `-og.jpg`, qualité 80, écriture atomique (`.<nom>.partial` puis renommage), 400 `errors.invalidImage` pour un fichier illisible. Rattrapage (`backfillImageVariants`) en arrière-plan au démarrage et après une restauration, exécutions en file ; pas de commande `dist/scripts/` (la tâche laissait le choix, et la restauration a besoin du rattrapage dans le processus). Frontend : `getUploadSrcSet`, composant `UploadedPhoto` (`sizes`, `decoding="async"`, `onError` qui retire le `srcset` et affiche la photo elle-même), `loading="lazy"` sur les cartes, `fetchPriority="high"` sur la page cocktail. Critère « variante 480 sur mobile » : vrai en vue liste ; en vue grille la carte fait toute la largeur, un téléphone 2x charge la 960 et un 3x la 1600 (`sizes` décrit la vraie mise en page). Dockerfile : `--omit=optional` supprimait le binaire libvips de sharp (paquet optionnel `@img/sharp-linuxmusl-*`, échec vérifié) ; élagage en `--omit=dev` et coupe des pairs optionnels de l'outillage (typescript, magicast) par `prune-unused-deps.mjs` ; étape de build qui encode un WebP et un JPEG. `allowScripts` inchangé : sharp 0.35.5 n'a pas de script d'installation. Image backend : 135 → 143 Mo (amd64) et 134 → 143 Mo (arm64) compressés. Vérifié : image amd64 seule (JPEG de 3,9 Mo en portrait avec GPS → 186 Ko, droit, sans EXIF ; ancienne photo rattrapée au redémarrage ; sauvegarde sans copies restaurée puis rattrapée), smoke compose complet en arm64 natif (`carta-f-01`). Bundle public 137,61 kB (137,31 sur develop). Sondes de sabotage : toutes détectées sauf un mutant équivalent. `touches` complété (route publique, restauration, démarrage, i18n, helpers de test, Dockerfile, smoke, docs). F-11 créée (vignettes de l'admin).
- 2026-11-27 : décision de l'humain : on ne garde que les versions réduites. Le fichier envoyé n'est pas conservé, et une nouvelle photo fait au plus 1600 px (WebP). Suites de la relecture (approuvée sans bloquant) : `limitInputPixels` explicite à 100 Mpx (`MAX_INPUT_PIXELS`), testé à la limite et à la limite + 1 ligne de pixels (400, rien d'écrit ; sonde : sans la limite, le test échoue) ; l'entrée est décodée une seule fois, redressée et ramenée à 1600 px en pixels bruts, et les quatre fichiers (ou les copies manquantes du rattrapage) sont encodés depuis ce résultat, sans double compression.
- Notes de version : une nouvelle photo est enregistrée en WebP de 1600 px de large au plus, sans EXIF ni position GPS ; le fichier envoyé n'est pas gardé, ni sur le serveur ni dans les sauvegardes. Les photos existantes ne changent pas. Les aperçus de liens utilisent une copie JPEG. Un fichier illisible avec une extension acceptée (JPEG tronqué, HEIC renommé en `.jpg`) ou de plus de 100 Mpx reçoit maintenant un 400 avec un message clair, alors qu'il était stocké tel quel avant. Au premier démarrage, le backend ajoute en arrière-plan les copies réduites des photos existantes (environ 350 Ko par photo), sans toucher aux originaux ; de même après la restauration d'une sauvegarde plus ancienne. L'image backend grossit d'environ 9 Mo. Aucune action requise, `breaking: false`.
