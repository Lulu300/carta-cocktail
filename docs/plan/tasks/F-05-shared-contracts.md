---
id: F-05
title: "Contrats partagés front/back (schémas zod communs)"
phase: F
lane: backend
criticite: basse
effort: L
status: done
owner: agent
depends_on: [C-04, E-06]
touches: [backend/src/validation/, backend/src/contracts/, backend/src/routes/responseContracts.test.ts, backend/src/test/helpers.ts, backend/package.json, backend/AGENTS.md, frontend/src/types/, frontend/src/test/, frontend/src/services/api.ts, frontend/src/queries/, frontend/src/pages/public/, frontend/src/utils/cocktailSearch.ts, frontend/src/components/admin/cocktails/, frontend/src/pages/admin/, frontend/src/components/admin/, frontend/src/components/import/, frontend/src/services/exportZip.ts, frontend/src/utils/menuType.ts, frontend/src/i18n/locales/public/, frontend/AGENTS.md, backend/src/routes/backup.test.ts, backend/src/routes/system.test.ts, backend/src/routes/cocktails.test.ts]
sources: ["05-frontend-archi.md §3.3", "04-tests.md §7"]
branch: feature/F-05-shared-contracts-2
pr: 301
---

## Contexte

Le frontend redéclare à la main tous les types de l'API. Chaque changement côté backend doit être recopié, et l'oubli ne se voit qu'en production : le bug de perte des sections de menu (A-02) vient en partie d'un champ absent du type frontend. Une fois C-04 (zod côté backend) et E-06 (zod dans le formulaire cocktail) en place, les mêmes schémas peuvent servir aux deux côtés.

## Problème constaté

- `frontend/src/types/index.ts` : 372 lignes écrites à la main, qui doublonnent les modèles Prisma et les sérialisations du backend.
- Dérives relevées par la revue (`05-frontend-archi.md §3.3`) : `menuSectionId` absent de `MenuInput` ; `Cocktail.tags: string` en lecture contre `CocktailInput.tags: string[]` en écriture ; `IngredientAvailability.sourceType: string` au lieu de l'union ; unions `MenuType` et `SourceType` répétées à plusieurs endroits.
- Les mocks des tests frontend sont typés `as never` (`04-tests.md §7`) : aucun test ne vérifie que front et back parlent le même format.

## Ce qu'il faut faire

Choix à valider avant de commencer :
- **Workspace npm.** `package.json` racine avec `workspaces: ["backend", "frontend", "shared"]`, paquet `@carta/contracts` dans `shared/`. Propre, mais les deux images Docker se construisent aujourd'hui avec `context: ./backend` et `./frontend` (`docker-compose.yml:4`, `release.yml:44,55`) : `shared/` est hors contexte. Il faut passer le contexte à la racine, revoir les deux Dockerfiles, les deux compose, `ci.yml` (`working-directory`, lockfile unique) et `release.yml`.
- **Dossier partagé sans workspace.** `shared/` contient des `.ts` sources, importés par alias (`paths` dans les deux tsconfig, `resolve.alias` dans Vite). Même problème de contexte Docker, moins de changements npm, mais deux copies de `zod` possibles.
- **Schémas dans le backend, types générés pour le frontend.** Les schémas zod vivent dans `backend/src/validation/`, un script exporte les types (`z.infer`) vers `frontend/src/types/generated.ts`, vérifié en CI. Aucun changement Docker, mais le frontend ne peut pas réutiliser les schémas pour valider ses formulaires.

Étapes communes, une fois l'option choisie :
1. Recenser les schémas de C-04 (entrées) et ceux de E-06 (formulaire cocktail).
2. Déclarer une seule fois les unions (`SourceType`, `MenuType`) et les DTO d'entrée.
3. Ajouter les schémas de sortie des routes publiques et des listes principales.
4. Remplacer progressivement `frontend/src/types/index.ts` par des réexports, entité par entité, une PR par lot si besoin.
5. Tests de contrat backend : chaque route couverte valide sa réponse avec le schéma de sortie (`schema.parse(res.body)`).

## Critères d'acceptation

- [x] Option choisie et notée dans le Journal.
- [x] Les unions `SourceType` et `MenuType` n'existent qu'à un endroit.
- [x] Les dérives listées ci-dessus sont corrigées.
- [x] Les tests backend valident la forme des réponses des routes publiques et cocktails.
- [x] Builds Docker, CI et smoke D-08 verts.

## Tests à ajouter ou adapter

- Tests de contrat backend (supertest + `schema.parse`).
- Frontend : remplacer les fixtures `as never` restantes par des objets typés par les contrats (avec E-13 si elle est faite).

## Points d'attention

- Les deux premières options modifient des fichiers hors `touches` (Dockerfiles, compose, workflows) et entrent en conflit avec D-01, D-04, D-05 et D-08. Faire F-05 après la phase D et mettre à jour `touches` une fois l'option choisie.
- Le backend est en CommonJS (`backend/package.json:20`), le frontend en ESM : un paquet partagé doit être consommé en sources TypeScript, ou compilé dans les deux formats.
- Une seule version de `zod` des deux côtés. Deux instances différentes cassent `instanceof ZodError`.
- Tâche de taille L : la découper (unions et DTO d'entrée d'abord, schémas de sortie ensuite).

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-11-27 : décision de l'humain, troisième option : les schémas zod restent dans `backend/src/validation/`, un script génère les types du frontend (`frontend/src/types/generated.ts`) à partir de `z.infer`, un test échoue si le fichier généré n'est pas à jour ; aucun changement Docker ni workspace npm ; le frontend ne réutilise pas les schémas pour valider ses formulaires. `shared/` sort donc de `touches`.
- 2026-11-27 : premier lot, branche `feature/F-05-shared-contracts`, PR #298. Schémas de réponse stricts (`z.strictObject`) des routes publiques, des cocktails et des bouteilles ; tests de contrat dans `backend/src/routes/responseContracts.test.ts` ; générateur `backend/src/contracts/` (`npm run contracts:generate`), qui imprime les types inférés par le compilateur TypeScript depuis `frontendTypes.ts`, et son test de fraîcheur, exécuté par le job Backend de la CI. `SourceType` et `MenuType` déclarés une seule fois ; DTO d'entrée générés (cocktail, ligne de recette, bouteille, menu). Dérives corrigées : `menuSectionId` (corps de mise à jour de menu généré), `tags` (lecture et écriture issues du contrat), `sourceType` de la disponibilité et de l'export, réponse de l'envoi de photo (cocktail sans recette, typée `Cocktail` jusque-là). Le bloc « Autres » du menu public de bouteilles est retiré avec sa traduction : la route publique envoie toujours la catégorie.
- Étape suivante (deuxième lot) : schémas de réponse et tests de contrat des autres routes (menus admin, sections, bouteilles de menu, catégories, types de catégorie, ingrédients, unités admin, disponibilité, pénuries, réglages, imports et exports), puis remplacement des interfaces restantes de `frontend/src/types/index.ts` par des réexports. La tâche reste en `todo` jusque-là ; le dernier critère (Docker, CI, smoke) se coche avec ce dernier lot.
- 2026-11-27 : deuxième lot, branche `feature/F-05-shared-contracts-2`. Décision de l'humain rappelée : les schémas zod restent dans le backend, le frontend n'a que les types générés (`z.strictObject`, vérifiés en CI). Schémas de réponse et tests de contrat de toutes les routes JSON restantes : catégories (liste, détail, pénuries), types de catégorie, ingrédients, unités admin, cartes admin (liste, détail de l'éditeur, création, mise à jour), sections, bouteilles de carte (exclusions, synchronisation), disponibilité, profil, auth, système (notice de mise à jour), santé, imports et exports de cocktails et de bouteilles, restauration de sauvegarde. L'export de sauvegarde (ZIP) et les pages d'aperçu de lien (HTML) n'ont pas de schéma JSON. `/api/settings` garde le schéma `AdminSiteSettings` de F-10. `expectContract()` passe dans `src/test/helpers.ts` ; la restauration et la notice sont vérifiées dans `backup.test.ts` et `system.test.ts`, qui ont leur mise en place. `frontend/src/types/index.ts` ne fait plus que réexporter ; `types/importWizard.ts` garde l'état propre aux assistants d'import (vue commune des quatre sortes d'entités, nombres vidés à `null` pendant la saisie), plus large ou plus étroit que le contrat. Les listes de catégories et de types ont leurs propres types (`CategoryListItem`, `CategoryTypeListItem`), le menu admin `MenuSummary`, `MenuDetail`, `MenuRow`, `UpdatedMenu` à la place de l'unique `Menu` aux champs optionnels. Nits de #298 : en-tête de `common.ts`, gardes devenues inutiles retirées (`useMenuFilter.ts`, et `hasBottle`/`MenuBottleEntry` et les `?? []` de l'éditeur de cartes), `SOURCE_TYPES` dans `cocktails.test.ts`. Le générateur imprime `Record<string, never>` pour un objet strict vide. Deux tests de page qui envoyaient une catégorie sans type, cas que le contrat exclut, sont retirés : `useCategoryTypeName.test.ts` couvre ce repli.
