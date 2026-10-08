---
id: A-05
title: "Durcir l'API publique (JWT vérifié, éléments masqués, champs privés, cocktails hors menu)"
phase: A
lane: backend
criticite: haute
effort: M
status: done
owner: agent
depends_on: []
touches: [backend/src/routes/public.ts, backend/src/routes/public.test.ts, backend/src/middleware/auth.ts, backend/src/middleware/auth.test.ts, frontend/src/utils/cocktailSearch.ts, frontend/src/utils/cocktailSearch.test.ts, frontend/src/pages/admin/CocktailsPage.tsx]
sources: ["03-security.md §3", "03-security.md §5", "06-frontend-ux-perf.md §5", "02-backend-data-perf.md §5"]
branch: fix/A-05-public-api-hardening
pr: 33
---

## Décisions validées (2026-10-08)

- **Cocktails hors carte** : un cocktail visible dans aucun menu publié renvoie 404 sur l'API publique, y compris par lien direct.
- **Emplacement** : `location` reste public, rien à retirer côté affichage.

## Contexte

L'API publique est ouverte à tous, puisque la carte se partage par QR code. Elle sert aujourd'hui bien plus que la carte : n'importe quel en-tête `Authorization` ouvre les menus non publiés, n'importe quel cocktail est lisible par son id (brouillons compris), et les réponses contiennent les éléments masqués, les champs d'inventaire (prix d'achat, date d'ouverture, niveau restant) et les notes privées. Le filtrage n'est fait que côté client, donc visible dans l'onglet réseau de n'importe quel invité.

## Problème constaté

- **JWT non vérifié** : `backend/src/routes/public.ts:73-74` : `const isAdmin = !!token`. `curl -H 'Authorization: x' /api/public/menus/aperitifs` renvoie le menu non publié. Le test `backend/src/routes/public.test.ts:41-45` couvre l'aperçu avec un vrai token, aucun test ne vérifie le refus d'un faux.
- **Éléments masqués envoyés** : aucun `where: { isHidden: false }` dans `public.ts:39-63`. Le filtre n'existe que dans `frontend/src/pages/public/MenuPublicPage.tsx:185,211`. Les bouteilles vides sont déjà exclues (`public.ts:54-56`).
- **Toutes les colonnes renvoyées** : `include: { ..., bottle: true }` (l.44) et `bottle: { include: { category: true } }` (l.58-60, l.114, l.214) exposent `purchasePrice`, `openedAt`, `remainingPercent`, `createdAt`, `isApero`, `isDigestif`.
- **Cocktails hors menu** : `GET /cocktails/:id` (l.206-235) et `GET /cocktails/:id/export` (l.106-192) ne vérifient pas que le cocktail figure dans un menu public.
- **Notes et bouteilles préférées** renvoyées à tous (l.117, l.137, l.217), cachées seulement au rendu (`frontend/src/pages/public/CocktailPublicPage.tsx:84,111`). La recherche publique indexe `cocktail.notes` (`frontend/src/utils/cocktailSearch.ts:45`) : un invité peut deviner le contenu d'une note en tapant un mot.
- `GET /menus` (l.14-28) : `_count` compte aussi les éléments masqués.
- `backend/src/middleware/auth.ts:18` : `jwt.verify` sans liste d'algorithmes.
- **Précision sur la revue** : `location` est **affichée volontairement** aux invités sur la carte des bouteilles (`MenuPublicPage.tsx:139-155`). La retirer de l'API casserait cet affichage. Elle reste publique, sauf décision contraire.

## Ce qu'il faut faire

1. `backend/src/middleware/auth.ts` :
   - `verifyToken(token: string): { userId: number } | null`, avec `jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })`. `authMiddleware` l'utilise.
   - `optionalAuth(req, _res, next)` : si l'en-tête `Bearer` est valide, renseigne `req.userId` ; sinon continue **sans** 401. Un invité qui a un vieux token en `localStorage` doit voir la carte.
2. `public.ts` : `router.use(optionalAuth)` ; `const isAdmin = req.userId !== undefined`.
3. `GET /menus/:slug` :
   - filtrer pour tout le monde : `cocktails: { where: { isHidden: false }, ... }` et `bottles: { where: { isHidden: false, bottle: { remainingPercent: { gt: 0 } } }, ... }`. Le front masque déjà ces éléments, y compris pour l'admin ;
   - remplacer les `include` par des `select` explicites, déclarés en constantes en tête de fichier :
     - bouteille : `id, name, capacityMl, categoryId, alcoholPercentage, location`, `category: { select: { id, name, nameTranslations, type } }` ;
     - ligne d'ingrédient : `id, quantity, position, sourceType, unit`, `category` (id, name, nameTranslations, type), `ingredient` (id, name, nameTranslations, icon), `bottle` (id, name, alcoholPercentage, catégorie minimale) ;
     - cocktail : `id, name, description, imagePath, tags, isAvailable, ingredients, instructions`, plus `notes` seulement si `isAdmin` ;
   - menu non public sans admin vérifié : 404 (inchangé).
4. `GET /cocktails/:id` et `GET /cocktails/:id/export` :
   - invité : `findFirst({ where: { id, menuCocktails: { some: { isHidden: false, menu: { isPublic: true } } } } })`, sinon 404 ;
   - admin : tout cocktail (aperçu) ;
   - `notes` et `preferredBottles` seulement pour l'admin, dans le détail comme dans le payload d'export ;
   - id non numérique : 404, pas 500.
5. `GET /menus` : `_count: { select: { cocktails: { where: { isHidden: false } }, bottles: { where: { isHidden: false } } } }`.
6. Front : retirer `cocktail.notes` de `matchesCocktailSearch` (`cocktailSearch.ts:45`). `MenuPublicPage.tsx` et `CocktailPublicPage.tsx` n'ont pas besoin de changer : ils filtrent déjà et ne lisent aucun champ retiré. Ils ont été retirés de `touches`.

Hors périmètre : factorisation de l'export admin/public (C-09) ; `/public/units` qui renvoie une chaîne JSON (C-14) ; cache HTTP ; aperçus Open Graph (F-03) ; UX de la carte (E-11) ; révocation des tokens (C-11).

## Critères d'acceptation

- [x] `Authorization: Bearer x`, ou un token signé avec un autre secret : menu non public en 404.
- [x] Token admin valide : aperçu du menu non public (200).
- [x] Token expiré sur un menu public : 200, pas de 401.
- [x] Aucun élément `isHidden` dans `/public/menus/:slug`, pour l'invité comme pour l'admin.
- [x] Aucune réponse publique ne contient `purchasePrice`, `openedAt` ni `remainingPercent`.
- [x] Cocktail absent de tout menu public, ou seulement masqué : 404 pour un invité (détail et export), 200 pour l'admin.
- [x] `notes` et `preferredBottles` absents pour un invité, présents pour l'admin.
- [ ] La carte publique et la fiche cocktail s'affichent comme avant (vérification manuelle en invité et en admin).

## Tests à ajouter ou adapter

`backend/src/routes/public.test.ts` :
- Adapter les tests qui lisent un cocktail hors menu (l.92-97, l.106-114, l.117-233, l.236-307) : rattacher le cocktail à un menu public, ou envoyer `authHeader()` quand le test vise l'aperçu admin.
- `Bearer x` sur `aperitifs` : 404 ; token signé avec `'autre-secret'` : 404 ; token expiré sur un menu public : 200.
- Menu public avec un cocktail visible et un masqué, une bouteille visible et une masquée : seuls les visibles reviennent.
- Bouteille avec `purchasePrice: 42` et `openedAt` : `JSON.stringify(res.body)` ne contient ni `purchasePrice`, ni `openedAt`, ni `remainingPercent`.
- Cocktail avec `notes` dans un menu public : invité, pas de clé `notes` ; admin, `notes` présent. Même vérification sur l'export.
- Cocktail dans aucun menu : 404 invité, 200 admin. Cocktail masqué dans son seul menu public : 404 invité.
- `GET /public/menus` : `_count.cocktails` exclut les masqués.

`backend/src/middleware/auth.test.ts` (nouveau) : `optionalAuth` appelle `next()` sans token, avec un token invalide (sans poser `userId`) et avec un token valide (`userId` posé) ; `authMiddleware` refuse un token signé en `HS512`.

`frontend/src/utils/cocktailSearch.test.ts` : un terme présent seulement dans `notes` ne trouve plus le cocktail.

## Points d'attention

- **Décision produit à confirmer** : un cocktail non publié ne sera plus consultable par lien direct. Des liens déjà partagés vers des cocktails hors carte renverront 404.
- **Décision à confirmer** : `location` reste publique. Si l'emplacement de stockage doit rester privé, il faut aussi retirer son affichage dans `MenuPublicPage` (E-11).
- Les types front (`Bottle`, `Cocktail`) déclarent des champs non optionnels qui ne seront plus renvoyés. Les pages publiques ne les lisent pas ; ne pas modifier les types ici (contrats partagés : F-05).
- `frontend/src/services/api.ts:17-19` envoie le token sur les routes publiques : c'est ce qui permet l'aperçu admin, ne pas le retirer.
- C-03 et C-11 modifieront aussi `middleware/auth.ts` : `verifyToken` doit rester le point unique de vérification.
- Le `where` dans `_count` est supporté par Prisma depuis la 4.3 : vérifier sur la 6.19 installée.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions humaines reportées en tête (cocktail hors carte en 404 même par lien direct, `location` reste public). `verifyToken` (HS256 seul, `userId` numérique exigé) et `optionalAuth` dans `middleware/auth.ts` ; `public.ts` : `optionalAuth`, éléments masqués filtrés pour tous, `select` explicites (aucun champ d'inventaire), cocktails réservés aux menus publics pour l'invité (détail et export), `notes` et `preferredBottles` réservés à l'admin, id non numérique en 404, `_count` sans éléments masqués (ni bouteilles vides, pour coller à l'affichage). Front : `matchesCocktailSearch` n'indexe plus les notes par défaut ; option `includeNotes` utilisée par la liste admin, d'où l'ajout de `frontend/src/pages/admin/CocktailsPage.tsx` à `touches` (sinon la recherche admin par note régressait, test existant). Tests : `auth.test.ts` (11) créé, `public.test.ts` adapté et complété (32 tests), `cocktailSearch.test.ts` (+2). Couverture delta 100 % backend et frontend. Critère « vérification manuelle » laissé à l'humain. Branche `fix/A-05-public-api-hardening`, PR #33.
