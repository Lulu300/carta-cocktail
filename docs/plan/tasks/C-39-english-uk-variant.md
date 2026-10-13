---
id: C-39
title: "Langue English (UK) : en-GB, dates jour/mois"
phase: C
lane: frontend
criticite: basse
effort: S
status: todo
owner: mixed
depends_on: [C-35, E-10, E-27]
touches: [frontend/src/i18n/index.ts, frontend/src/i18n/index.test.ts, frontend/src/utils/localization.ts, frontend/src/utils/localization.test.ts, frontend/src/components/ui/LanguageSelector.tsx, frontend/src/components/ui/LanguageSelector.test.tsx, frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/utils/dates.ts, frontend/src/utils/dates.test.ts, backend/src/utils/importDates.ts, backend/src/utils/importDates.test.ts]
sources: []
branch:
pr:
---

## Décisions validées (2026-10-12)

- **Dates** : toutes les dates sont affichées et saisies selon la langue de l'application, quelle que soit leur origine (C-35 pour l'import, E-27 pour les formulaires).
- **`en` = English (US)** : en `en`, une date à barres ou à points se lit mois/jour/année (`12/03/2024` = 3 décembre 2024).
- **English (UK)** : une variante `en-GB` s'ajoute aux langues de l'application. Elle reprend les traductions `en` par le repli d'i18next (aucun fichier de traduction copié) ; seul le format de date change : jour/mois/année (`12/03/2024` = 12 mars 2024).
- **Libellés** : « English (US) » pour `en`, « English (UK) » pour `en-GB`.

## Contexte

C-35 lit les dates d'un fichier importé selon la langue de la requête (`Accept-Language`), avec une table de formats dans `backend/src/utils/importDates.ts`. La recherche essaie le code exact (`en-GB`), puis la langue de base (`en`), puis le repli `en`. L'entrée `en-GB` n'y est pas encore : sans la langue côté frontend, ce serait du code mort.

E-27 fait de même pour l'affichage et la saisie des dates, avec une table de formats dans `frontend/src/utils/dates.ts`.

Côté backend, `i18next-http-middleware` garde le code régional : `Accept-Language: en-GB` donne `req.language = 'en-GB'` (vérifié le 2026-10-12), et les messages d'erreur retombent sur `en`.

## Problème constaté

L'application ne connaît que `fr` et `en`, et réduit tout code régional à sa langue de base :

- `frontend/src/i18n/index.ts` : `SUPPORTED_LANGUAGES = ['fr', 'en']`, `supportedLngs` limité à ces deux codes, et `convertDetectedLanguage: getBaseLanguage` qui transforme le `en-GB` du navigateur en `en`. Le listener `languageChanged` écrit aussi `getBaseLanguage(...)` dans `<html lang>`.
- `frontend/src/components/ui/LanguageSelector.tsx` : deux entrées (`Français`, `English`), le drapeau britannique (`FlagGB`) associé à `en`, et `currentCode = getBaseLanguage(...)` qui ramènerait `en-GB` à `en`.
- `frontend/src/services/api.ts` envoie `i18n.resolvedLanguage ?? i18n.language`. Sans ressources propres à `en-GB`, i18next calcule `resolvedLanguage = 'en'` (première langue de la chaîne qui a des traductions) : le backend recevrait `en` et lirait les dates à l'américaine.

Un admin britannique ne peut donc ni choisir le format jour/mois en anglais, ni importer `12/03/2024` comme le 12 mars.

## Ce qu'il faut faire

1. `frontend/src/i18n/index.ts` : ajouter `en-GB` à `SUPPORTED_LANGUAGES` et à `supportedLngs`, sans ressources propres (le repli d'i18next sert les traductions `en`). Le détecteur garde un code exact supporté (`en-GB`) et réduit les autres à leur langue de base. `<html lang>` reçoit le code complet (`en-GB`).
2. `frontend/src/services/api.ts` : `Accept-Language` envoie le code choisi (`en-GB`), pas `resolvedLanguage`.
3. `LanguageSelector` : trois entrées, « Français », « English (US) » (`en`), « English (UK) » (`en-GB`) ; drapeau américain pour `en`, britannique pour `en-GB`. La langue courante est lue dans `i18n.language` et reconnue par son code exact : le composant calcule aujourd'hui `currentCode` à partir de `i18n.resolvedLanguage`, qui vaut `en` pour `en-GB`, comme dans `api.ts`.
4. `frontend/src/utils/dates.ts` (E-27) : entrée `en-GB` (jour/mois, gabarit `dd/mm/yyyy`) dans la table de formats.
5. `backend/src/utils/importDates.ts` (C-35) : entrée `en-GB` (`dayFirst`) dans `DAY_MONTH_ORDERS`.

## Critères d'acceptation

- [ ] Le sélecteur propose « English (US) » et « English (UK) » ; choisir English (UK) garde les textes anglais.
- [ ] En English (UK), la date d'ouverture s'affiche et se saisit en `dd/mm/yyyy` ; en English (US), en `mm/dd/yyyy`.
- [ ] En English (UK), un import CSV avec `12/03/2024` donne le 12 mars 2024 ; en English (US), le 3 décembre 2024.
- [ ] Un navigateur en `en-GB` sans choix enregistré démarre en English (UK) ; un navigateur en `de` démarre en anglais (repli `en`).
- [ ] Un admin qui avait choisi `en` (localStorage) reste en English (US).

## Tests à ajouter ou adapter

- `backend/src/utils/importDates.test.ts` : `en-GB` lit `12/03/2024` comme le 12 mars ; `en` et `en-US` restent mois/jour.
- `frontend/src/utils/dates.test.ts` : formats et gabarits `en-GB`.
- `frontend/src/components/ui/LanguageSelector.test.tsx` : trois entrées, choix de `en-GB`, drapeaux.
- `frontend/src/services/api.test.ts` : `Accept-Language: en-GB` quand English (UK) est choisi.
- `frontend/src/i18n/index.test.ts` : détecteur (`en-GB` gardé, `fr-FR` réduit à `fr`) et `<html lang>` (`en-GB`).

## Points d'attention

- **À confirmer par l'humain au lancement** : les autres variantes régionales de l'anglais qui écrivent aussi jour/mois (`en-AU`, `en-IE`, `en-NZ`, `en-IN`). Proposition : réduites à `en` (US) comme aujourd'hui, seul `en-GB` est demandé.
- Le bouton du sélecteur affiche le code en majuscules (`EN`) : choisir ce qu'il montre pour `en-GB` (`EN` avec le drapeau, ou `UK`).
- Ne mettre ni `nonExplicitSupportedLngs` ni `load: 'languageOnly'` (commentaire de `i18n/index.ts`) : le repli `en-GB` → `en` passe par la hiérarchie des codes d'i18next.
- Les noms traduits des entités (`nameTranslations`) restent indexés par `fr`/`en` : `getLocalizedName` essaie déjà le code exact, puis la langue de base. Aucun changement de schéma, `Translations` côté backend reste `fr`/`en`.
- E-10 touche `frontend/src/components/` et les fichiers de traduction : C-39 attend son merge. Les noms de langues du sélecteur sont aujourd'hui écrits dans leur propre langue, en dur dans `LanguageSelector` ; suivre la règle qu'E-10 aura fixée pour eux.

## Journal

- 2026-10-12 : tâche créée par C-35, sur décision de l'humain (`en` = English (US), English (UK) plus tard).
- 2026-10-13 : relecture de la PR #132 : `frontend/src/i18n/index.test.ts` ajouté à `touches`, `LanguageSelector` lit `i18n.language`.
- 2026-10-13 : E-30 (PR #133) : les tables de messages d'`i18n/index.ts` et d'`i18n/admin.ts` sont typées par `TRANSLATED_LANGUAGES` (langues qui ont leurs propres fichiers), dont part `SUPPORTED_LANGUAGES`. `en-GB` s'ajoute à `SUPPORTED_LANGUAGES` et à `LanguageSelector` seulement, pas à `TRANSLATED_LANGUAGES` ni aux tables : i18next lui sert les messages `en`.
