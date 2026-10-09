---
id: C-14
title: "Traductions et réglages : helpers partagés, réponses homogènes"
phase: C
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-03]
touches: [backend/src/utils/translations.ts, backend/src/routes/settings.ts, backend/src/routes/categoryTypes.ts, backend/src/routes/shortages.ts, backend/src/routes/categories.ts, backend/src/routes/units.ts, backend/src/routes/ingredients.ts, backend/src/routes/bottles.ts, backend/src/routes/cocktails.ts, backend/src/routes/public.ts, backend/src/routes/menus.ts, backend/src/services/settingsService.ts, backend/src/services/categoryTypeService.ts, backend/src/i18n/]
sources: ["01-backend-routes.md §M3", "01-backend-routes.md §M5", "01-backend-routes.md §R6", "02-backend-data-perf.md §2.1"]
branch:
pr:
---

## Contexte

Les traductions des noms (`nameTranslations`) sont stockées en chaîne JSON. L'écriture recopie la même ligne 12 fois sans validation, la lecture passe par deux helpers différents, et deux endpoints renvoient encore la chaîne brute. D'autres petites duplications (création paresseuse des réglages, création automatique d'un type de catégorie, enrichissement par type) se sont multipliées. Cette tâche les remplace par des helpers uniques. Les changements dans les routes sont mécaniques.

## Problème constaté

- Écriture : `nameTranslations ? JSON.stringify(nameTranslations) : null` à 12 endroits : `bottles.ts:197`, `categories.ts:76,100`, `categoryTypes.ts:51,76`, `ingredients.ts:63,84`, `cocktails.ts:289,308,342`, `units.ts:47,64`. Rien ne vérifie que la valeur est un objet `{ langue: texte }` : un tableau ou un nombre est stocké tel quel.
- Lecture : `utils/translations.ts:6-29` (`parseNameTranslations`) est récursif sur une liste de relations en dur (`:19-22`), modifie l'objet reçu, et un JSON invalide devient `null` sans log. `parseNT` est dupliqué (`cocktails.ts:10-13`, `public.ts:5-8`).
- `public.ts:195-202` : `/public/units` renvoie `nameTranslations` en chaîne ; `units.ts:12` renvoie l'objet.
- `menus.ts:23-63` (`GET /menus/:id`) et le PUT ne passent pas par `parseNameTranslations` : unités, bouteilles, catégories et ingrédients imbriqués gardent des chaînes.
- Réglages : création paresseuse en double (`settings.ts:12-15`, `public.ts:92-97`) par `findUnique` puis `create` : deux GET simultanés au premier démarrage donnent P2002. Le rapport dit que les valeurs par défaut diffèrent : **faux**. `create({ data: { id: 1 } })` prend les défauts du schéma (`"Carta Cocktail"`, `""`, `schema.prisma:186-187`), identiques à `public.ts:95`.
- `ensureCategoryType` en 3 exemplaires : `categories.ts:20-25`, `cocktails.ts:302-306`, `bottles.ts:185-189`.
- Enrichissement par `CategoryType` en 2 exemplaires : `categories.ts:10-17`, `shortages.ts:18-19,39`.
- `categoryTypes.ts:16-23` charge toutes les catégories pour les compter ; `shortages.ts:11-15` charge toutes les colonnes des bouteilles pour sommer `remainingPercent`.

## Ce qu'il faut faire

1. `utils/translations.ts` :
   ```ts
   export const SUPPORTED_LANGS = ['fr', 'en'] as const;
   export type Translations = Partial<Record<(typeof SUPPORTED_LANGS)[number], string>>;

   /** Entrée client → colonne. undefined : ne pas toucher ; null ou {} : effacer. */
   export function serializeTranslations(value: unknown): string | null | undefined;
   // objet simple, clés dans SUPPORTED_LANGS, valeurs string (trim, vides retirées) ;
   // sinon throw new BadRequestError('errors.invalidTranslations')

   /** Colonne → objet. console.warn si le JSON est invalide. */
   export function parseTranslations(raw: string | null | undefined): Translations | null;
   ```
   `parseNameTranslations` garde sa signature, s'appuie sur `parseTranslations` et renvoie une copie au lieu de modifier l'objet reçu.
2. Remplacer les 12 `JSON.stringify` par `serializeTranslations` (au PUT, `undefined` signifie champ absent) et les deux `parseNT` par `parseTranslations`.
3. `public.ts` `/public/units` et `menus.ts` GET/PUT : passer la réponse dans `parseNameTranslations`.
4. `src/services/settingsService.ts` : `getOrCreateSettings(db = prisma)` par `upsert({ where: { id: 1 }, update: {}, create: { id: 1 } })`, utilisé par `settings.ts` et `public.ts`.
5. `src/services/categoryTypeService.ts` : `ensureCategoryType(db, name)` (`upsert`, `color: 'gray'`) et `withCategoryType(categories, db)`. Remplacer les 3 + 2 copies.
6. `categoryTypes.ts` : compter avec `prisma.category.groupBy({ by: ['type'], _count: { _all: true } })`. `shortages.ts` : `include: { bottles: { select: { remainingPercent: true } } }`, puis `withCategoryType`.
7. Clé i18n `errors.invalidTranslations`.

## Critères d'acceptation

- [ ] `grep -rn "JSON.stringify(nameTranslations" backend/src` ne renvoie rien ; plus de `parseNT`.
- [ ] `POST /api/units` avec `nameTranslations: ['x']` ou `{ de: 'x' }` → 400.
- [ ] `/api/public/units` et `GET /api/menus/:id` renvoient des objets de traduction, jamais des chaînes.
- [ ] Deux `GET /api/public/settings` simultanés sur une base sans réglages → deux 200.
- [ ] Une seule implémentation de `ensureCategoryType` et de l'enrichissement par type.
- [ ] Réponses de `/category-types` et `/shortages` inchangées (mêmes champs).

## Tests à ajouter ou adapter

- `src/utils/translations.test.ts` : `serializeTranslations` (objet valide, `null`, `{}`, `undefined`, tableau, nombre, langue inconnue, valeurs vides retirées) ; `parseTranslations` (JSON invalide → `null` et `console.warn` espionné) ; `parseNameTranslations` ne modifie plus l'objet d'entrée.
- `public.test.ts` : `/api/public/units` renvoie `nameTranslations` en objet (compléter `:68-84`) ; `siteSettings.deleteMany()` puis deux GET en `Promise.all` → deux 200.
- `menus.test.ts` : `GET /api/menus/:id` avec une bouteille dont la catégorie a des traductions → objet.
- `categories.test.ts`, `categoryTypes.test.ts` : POST avec un type inconnu crée le `CategoryType` une seule fois ; compte par type correct.
- `shortages.test.ts` : inchangé, doit passer.

## Points d'attention

- `UnitConverter.tsx` n'utilise que l'abréviation et le facteur des unités publiques : passer `nameTranslations` en objet ne casse rien et aligne le type `Unit` du frontend.
- Langues limitées à `fr`/`en` : une base qui contient d'autres langues serait refusée à la prochaine écriture. Vérifier la prod (`SELECT nameTranslations FROM Category` …) ; au besoin, accepter toute clé de deux lettres.
- C-04 définit un schéma zod `Translations` : une seule règle doit exister. Faire passer C-14 avant C-04 évite le double travail ; sinon, C-14 aligne `serializeTranslations` sur le schéma existant.
- Touche beaucoup de routes de façon mécanique : conflits probables avec C-06, C-07, C-09, C-10, C-12, C-13. Enchaîner, ou rebaser en dernier.
- Le type `Json` natif de Prisma sur SQLite (rapport 02 §2.1) est hors périmètre : à réévaluer avec C-15.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
