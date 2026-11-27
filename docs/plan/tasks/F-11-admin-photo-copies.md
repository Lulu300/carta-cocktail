---
id: F-11
title: "Admin : vignettes de cocktails dans la copie réduite de la photo"
phase: F
lane: frontend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [F-01]
touches: [frontend/src/components/admin/cocktails/CocktailThumbnail.tsx, frontend/src/components/admin/cocktails/ImagePicker.tsx, frontend/src/components/ui/UploadedPhoto.tsx]
sources: []
branch: fix/F-11-admin-photo-copies
pr:
---

## Contexte

Relevé pendant F-01. Le backend stocke maintenant chaque photo en WebP de 1600 px au plus, avec des copies de 960 et 480 px (`backend/src/services/cocktail/imageVariants.ts`). Les pages publiques choisissent la copie avec `srcset` et `sizes` (`frontend/src/components/ui/UploadedPhoto.tsx`).

## Problème constaté

- `frontend/src/components/admin/cocktails/CocktailThumbnail.tsx` (liste et cartes de `CocktailsPage`) et `ImagePicker.tsx` (formulaire) chargent toujours la photo elle-même : `src={getUploadUrl(imagePath)}`, sans `srcset`, `sizes` ni `loading="lazy"`.
- Depuis F-01, c'est un WebP de 1600 px (environ 200 Ko pour une photo de téléphone) au lieu de l'original de 3 à 5 Mo : le poids a beaucoup baissé, mais une vignette de 64 px charge encore 1600 px. Pour une photo importée avant F-01, l'original reste chargé tel quel.

## Ce qu'il faut faire

1. Déplacer `UploadedPhoto` dans `frontend/src/components/ui/` (ou un dossier partagé) pour que l'admin la réutilise, sans dupliquer le repli sur la photo d'origine quand une copie manque.
2. L'utiliser dans `CocktailThumbnail` avec `sizes` selon la variante (`cover`, vignette de liste) et `loading="lazy"`.
3. Garder l'aperçu local (`URL.createObjectURL`) d'`ImagePicker` tel quel, et utiliser `UploadedPhoto` pour la photo déjà enregistrée.

## Critères d'acceptation

- [x] La liste des cocktails de l'admin charge la copie de 480 px sur un écran de téléphone (onglet Réseau).
- [x] Une photo sans copies (sauvegarde ancienne pas encore rattrapée) s'affiche toujours dans l'admin.
- [x] Le bundle public reste sous 140 kB.
- [x] Tests, `tsc` et couverture OK.

## Tests à ajouter ou adapter

- `CocktailThumbnail` : `srcset`, `sizes` et `loading` présents.
- Tests existants d'`UploadedPhoto` déplacés avec le composant.

## Points d'attention

- `UploadedPhoto` fait partie du premier chargement de la carte publique : le déplacer ne doit pas tirer de code admin dans ce bundle.

## Journal

- 2026-11-26 : tâche créée pendant F-01.
- 2026-11-27 : `UploadedPhoto` déplacé dans `components/ui/`, utilisé par `CocktailThumbnail` et `ImagePicker` (photo enregistrée). Notes de version : les vignettes de l'admin chargent la copie réduite de la photo (moins de données sur la liste des cocktails).
