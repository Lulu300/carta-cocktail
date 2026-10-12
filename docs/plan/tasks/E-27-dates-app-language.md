---
id: E-27
title: "Dates affichées et saisies selon la langue de l'app"
phase: E
lane: frontend
criticite: basse
effort: M
status: todo
owner: agent
depends_on: []
touches: [frontend/src/components/admin/bottles/BottleFormModal.tsx, frontend/src/components/admin/bottles/bottleForm.ts, frontend/src/components/admin/bottles/BottleFormModal.test.tsx, frontend/src/components/ui/DateInput.tsx, frontend/src/components/ui/DateInput.test.tsx, frontend/src/utils/dates.ts, frontend/src/utils/dates.test.ts, frontend/src/i18n/locales/]
sources: []
branch:
pr:
---

## Décisions validées (2026-10-12)

- **Dates** : toutes les dates sont affichées et saisies selon la langue de l'application (fr : format français, en : format anglais, une future langue : son propre format), quelle que soit leur origine (saisie à la main ou import). Un seul format de stockage en base. La lecture des dates d'un fichier importé est traitée par C-35.

## Contexte

La seule date saisie dans l'application est la date d'ouverture d'une bouteille (`openedAt`), dans le formulaire de bouteille. L'API reçoit et renvoie de l'ISO 8601 (`NullableDate`, `backend/src/validation/common.ts`), et la base stocke un horodatage. Aucune date n'est encore affichée dans les listes : la ligne de bouteille ne montre qu'un badge « Ouverte » ou « Neuve » (`BottleRow.tsx`). Une date affichée plus tard devra suivre la même règle.

La langue de l'application vient de `i18n.language` (sélecteur `LanguageSelector`). Elle peut différer de celle du navigateur.

## Problème constaté

- `BottleFormModal.tsx` utilise `<input type="date">`. Son format d'affichage et de saisie (`jj/mm/aaaa` ou `mm/dd/yyyy`) est choisi par le navigateur d'après la langue du navigateur ou du système, jamais d'après celle de l'application. Un admin qui a choisi le français dans l'app sur un navigateur en anglais américain saisit en `mm/dd/yyyy`, et l'inverse.
- Aucun utilitaire commun ne formate une date selon `i18n.language` : chaque future date affichée risque de choisir son propre format.

## Ce qu'il faut faire

1. `frontend/src/utils/dates.ts` :
   - `formatDate(iso, language)` : affichage avec `Intl.DateTimeFormat(language, { dateStyle: 'short' })` (ou un format explicite par langue si `short` ne convient pas) ;
   - `parseDateInput(text, language)` : lit une saisie dans le format de la langue et renvoie `aaaa-mm-jj`, ou `null` si la saisie est invalide ou impossible (`31/02`) ;
   - `datePattern(language)` : le gabarit montré à l'utilisateur (`jj/mm/aaaa`, `mm/dd/yyyy`…), traduit.
   Une future langue ajoute son format en un seul endroit.
2. `components/ui/DateInput.tsx` : champ texte (ou sélecteur de date localisable) qui affiche et saisit dans le format de `i18n.language`, avec le gabarit en placeholder et un message d'erreur traduit sur une date invalide. Il expose une valeur ISO (`aaaa-mm-jj` ou chaîne vide) : `bottleForm.ts` et l'API ne changent pas.
3. Remplacer `<Input type="date">` par `DateInput` dans `BottleFormModal.tsx`. Changer de langue dans l'app réaffiche la date saisie dans le nouveau format, sans la modifier.
4. Toute date affichée ajoutée ensuite passe par `formatDate`.
5. Accessibilité (E-09) : libellé relié au champ, format annoncé (par `aria-describedby` vers le gabarit), erreur annoncée.

## Critères d'acceptation

- [ ] App en français : la date d'ouverture s'affiche et se saisit en `jj/mm/aaaa`, quelle que soit la langue du navigateur.
- [ ] App en anglais : elle s'affiche et se saisit au format anglais retenu (celui de C-35).
- [ ] `31/02/2024` ou `abc` affiche une erreur traduite et n'est pas envoyé.
- [ ] L'API reçoit toujours `aaaa-mm-jj` ; une bouteille enregistrée puis rouverte garde sa date.
- [ ] Changer de langue réaffiche la date saisie dans le nouveau format.

## Tests à ajouter ou adapter

- `src/utils/dates.test.ts` (nouveau) : `formatDate`, `parseDateInput` et `datePattern` en `fr` et `en`, dates impossibles.
- `src/components/ui/DateInput.test.tsx` (nouveau) : saisie valide, saisie invalide, changement de langue.
- `src/components/admin/bottles/BottleFormModal.test.tsx` (nouveau ou adapté) : la date saisie en français part en ISO.

## Points d'attention

- Le format de l'anglais (en-US `mm/dd/yyyy` ou en-GB `dd/mm/yyyy`) est la question posée à l'humain dans C-35. Les deux tâches doivent appliquer la même réponse.
- Un sélecteur de date tiers ajoute une dépendance (couloir `deps`, `package.json`) : à éviter si un champ texte avec gabarit suffit.
- `Intl.DateTimeFormat('en', { dateStyle: 'short' })` donne `3/12/24` (année sur deux chiffres) : préférer un format explicite à quatre chiffres.

## Journal

- 2026-10-12 : tâche créée par C-10, après la revue de la PR #113 et la décision de l'humain sur les dates.
