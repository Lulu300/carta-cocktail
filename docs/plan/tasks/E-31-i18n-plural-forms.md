---
id: E-31
title: "i18n : pluriels i18next pour les messages écrits « bouteille(s) »"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [E-10, E-30]
touches: [frontend/src/i18n/locales/admin/, frontend/src/i18n/bundles.test.ts, frontend/src/components/import/]
sources: ["06-frontend-ux-perf.md §2"]
branch:
pr:
---

## Contexte

E-10 a remplacé les pluriels faits dans le code (« bouteille(s) » construit en TypeScript, « dose/doses ») par les formes `_one` / `_other` d'i18next. Il reste des messages dont le pluriel est écrit dans le texte même de la traduction : l'admin lit « 1 bouteille(s) importée(s) ». Ils n'ont pas été convertis dans E-10, parce que le budget du chargement public était dépassé de 90 octets et que chaque forme ajoutée l'alourdit. Depuis E-30, les locales sont scindées en paquets public et admin : ces messages sont tous dans `frontend/src/i18n/locales/admin/` et ne pèsent plus sur la carte publique.

## Problème constaté

14 clés, relevées sur la branche d'E-10 (le chiffre de 17 cité lors de la décision comptait les lignes du `grep`, dont `dashboard.shortageAlert`, déjà corrigé par E-10). Elles sont toutes dans `locales/admin/` ; la commande suivante trouve 28 lignes (14 clés × 2 langues) :

```bash
grep -rnE '\([a-z/]+\)' frontend/src/i18n/locales/ | grep '{{'
```

| Clé | en | fr |
|---|---|---|
| `bottles.importWizard.summaryCategories` | `{{count}} categor(y/ies) referenced` | `{{count}} catégorie(s) référencée(s)` |
| `bottles.importWizard.summaryBottles` | `{{count}} bottle(s) to import` | `{{count}} bouteille(s) à importer` |
| `bottles.importWizard.duplicateFlag` | `{{count}} existing duplicate(s)` | `{{count}} doublon(s) existant(s)` |
| `bottles.importWizard.duplicatesWarningBody` | `{{count}} row(s) match bottles…` | `{{count}} ligne(s) correspondent…` |
| `bottles.importWizard.unresolvedWarning` | `{{count}} bottle(s) have no category…` | `{{count}} bouteille(s) sans catégorie…` |
| `bottles.importWizard.successCount` | `{{count}} bottle(s) imported` | `{{count}} bouteille(s) importée(s)` |
| `bottles.importWizard.duplicatesCreatedRecap` | `{{count}} duplicate(s) added…` | `{{count}} doublon(s) ajouté(s)…` |
| `bottles.importWizard.skippedRecap` | `{{count}} row(s) skipped…` | `{{count}} ligne(s) ignorée(s)…` |
| `bottles.importWizard.rowErrors.title` | `{{count}} row(s) left out of the import` | `{{count}} ligne(s) écartée(s) de l'import` |
| `cocktails.importWizard.ingredientCount` | `{{count}} ingredient(s)` | `{{count}} ingrédient(s)` |
| `cocktails.importWizard.instructionCount` | `{{count}} step(s)` | `{{count}} étape(s)` |
| `cocktails.importWizard.unresolvedCount` | `{{count}} dependency(ies) to resolve` | `{{count}} dépendance(s) à résoudre` |
| `cocktails.importWizard.batchSummaryCount` | `{{success}} of {{total}} imported successfully` | `{{success}} sur {{total}} importé(s) avec succès` |
| `common.selected` | `{{count}} selected` | `{{count}} sélectionné(s)` |

Toutes ces clés reçoivent déjà `count`, sauf `batchSummaryCount` : `ImportCocktailResults.tsx` passe `{ success, total }`, sans `count`, donc i18next ne peut pas choisir la forme.

## Ce qu'il faut faire

1. Remplacer chaque clé par ses formes `_one` / `_other` dans les deux langues, en anglais comme en français (« 1 bottle imported », « 2 bottles imported » ; « 1 bouteille importée », « 2 bouteilles importées »). En anglais, `common.selected` n'a pas besoin de deux formes, mais le français en a besoin : écrire les deux formes dans les deux langues pour garder les mêmes clés.
2. `batchSummaryCount` : passer `count: successCount` en plus de `success` et `total` (« 1 sur 3 importé avec succès », « 2 sur 3 importés avec succès »).
3. En français, 0 prend la forme `_one` (« 0 bouteille importée ») : vérifier que chaque phrase reste correcte avec 0.

## Critères d'acceptation

- [ ] La commande `grep` ci-dessus ne trouve plus rien.
- [ ] `src/i18n/bundles.test.ts` passe : mêmes clés en `en` et `fr` dans chaque paquet, chaque `_one` a son `_other`, chaque clé `t('…')` existe dans un paquet.
- [ ] « 1 bouteille importée », « 0 bouteille importée », « 2 bouteilles importées », « 1 bottle imported » s'affichent correctement (test avec la vraie instance i18next, dans le bloc `plural forms` de `bundles.test.ts`).
- [ ] Budget du chargement public toujours respecté (les clés sont côté admin après E-30).

## Tests à ajouter ou adapter

- `bundles.test.ts`, bloc `plural forms` : quelques cas de pluriel réels (`successCount`, `batchSummaryCount`, `common.selected` en français). Ces clés sont dans le paquet admin : elles ne se résolvent qu'après `await import('./admin')`, comme dans le test de `cocktails.doses`.
- `ImportCocktailResults` : la clé reçoit `count` (mock `translateWithValues`).
- Les tests qui cherchent `bottles.importWizard.successCount` ou `cocktails.importWizard.unresolvedCount` avec le mock par défaut (`t = key => key`) restent valables.

## Points d'attention

- Tâche frontend qui touche les locales : ne pas la lancer en parallèle d'une autre tâche qui les modifie.

## Journal

- 2026-10-12 : tâche créée par E-10, sur décision de l'humain : le budget du chargement public était dépassé de 90 octets, E-30 scinde d'abord les locales, les pluriels écrits dans le texte passent dans cette tâche.
- 2026-10-13 : relecture de la PR #134 (E-10) : les contrôles prévus dans `locales.test.ts` sont dans `bundles.test.ts` ; renvois corrigés, point d'attention sur E-30 retiré (mergée, les 14 clés sont dans `locales/admin/`).
