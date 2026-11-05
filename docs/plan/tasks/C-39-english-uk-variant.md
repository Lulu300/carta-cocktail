---
id: C-39
title: "Langue English (UK) : en-GB, dates jour/mois"
phase: C
lane: frontend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-35, E-10, E-27]
touches: [frontend/src/i18n/index.ts, frontend/src/i18n/index.test.ts, frontend/src/utils/localization.ts, frontend/src/utils/localization.test.ts, frontend/src/components/ui/LanguageSelector.tsx, frontend/src/components/ui/LanguageSelector.test.tsx, frontend/src/components/admin/TranslationFields.tsx, frontend/src/components/admin/TranslationFields.test.tsx, frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/utils/dates.ts, frontend/src/utils/dates.test.ts, backend/src/utils/importDates.ts, backend/src/utils/importDates.test.ts, backend/src/routes/bottles.test.ts, frontend/src/components/ui/DateInput.test.tsx, frontend/AGENTS.md, frontend/src/utils/languageChoice.ts, frontend/src/utils/languageChoice.test.ts]
sources: []
branch: feat/C-39-english-uk
pr: 160
---

## Décisions validées (2026-10-12)

- **Dates** : toutes les dates sont affichées et saisies selon la langue de l'application, quelle que soit leur origine (C-35 pour l'import, E-27 pour les formulaires).
- **`en` = English (US)** : en `en`, une date à barres ou à points se lit mois/jour/année (`12/03/2024` = 3 décembre 2024).
- **English (UK)** : une variante `en-GB` s'ajoute aux langues de l'application. Elle reprend les traductions `en` par le repli d'i18next (aucun fichier de traduction copié) ; seul le format de date change : jour/mois/année (`12/03/2024` = 12 mars 2024).
- **Libellés** : « English (US) » pour `en`, « English (UK) » pour `en-GB`.

## Décisions validées (2026-11-05)

- **Ordre** : E-27 d'abord, C-39 ensuite (E-27 est mergée, PR #158).
- **Autres variantes de l'anglais** (`en-AU`, `en-IE`, `en-NZ`, `en-IN`) : réduites à `en` (US), comme aujourd'hui. Seul `en-GB` lit jour/mois.
- **Bouton du sélecteur** : `UK` avec le drapeau britannique pour English (UK), `EN` avec le drapeau américain pour English (US).
- **Langue enregistrée** (point 1 de la relecture de la PR #160) : corrigé avant la rc. Seul un choix fait dans le sélecteur est enregistré ; une valeur `en` que personne n'a choisie est détectée à nouveau. Cela change le comportement des utilisateurs fr/en existants et demande un nouveau cycle de relecture.

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

- [x] Le sélecteur propose « English (US) » et « English (UK) » ; choisir English (UK) garde les textes anglais.
- [x] En English (UK), la date d'ouverture s'affiche et se saisit en `dd/mm/yyyy` ; en English (US), en `mm/dd/yyyy`.
- [x] En English (UK), un import CSV avec `12/03/2024` donne le 12 mars 2024 ; en English (US), le 3 décembre 2024.
- [x] Un navigateur en `en-GB` sans choix enregistré démarre en English (UK) ; un navigateur en `de` démarre en anglais (repli `en`).
- [x] Un admin qui avait choisi `en` (localStorage) reste en English (US), sauf sur un navigateur `en-GB` (cas résiduel, voir Journal).
- [x] Seule une langue choisie dans le sélecteur est enregistrée, et elle reste choisie après un rechargement ; une langue détectée ne l'est pas. Une valeur mise en cache par une version précédente et égale à ce que cette version détectait sur ce navigateur est abandonnée (`en` sur un navigateur `en-GB` donne English (UK)) ; une autre valeur est gardée comme un choix (`en` sur un navigateur français).

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
- 2026-10-13 : relecture d'E-10 (PR #134). E-10 ajoute une constante `LANGUAGE_NAMES` (`frontend/src/utils/localization.ts`), utilisée à la fois par `LanguageSelector` et par les libellés de `TranslationFields`. Si C-39 renomme `en` en « English (US) », le champ de traduction anglais prendra ce nom, alors que `nameTranslations.en` sert aussi à `en-GB`. Il faut séparer les noms affichés dans le sélecteur des noms des langues de contenu. La règle attendue au dernier point d'attention est fixée : les noms de langues sont des endonymes, jamais traduits, rangés dans `LANGUAGE_NAMES`. `frontend/src/components/admin/TranslationFields.tsx` (et son test) sont ajoutés à `touches`.
- 2026-11-05 : décisions de l'humain enregistrées (variantes `en-AU`… réduites à `en`, bouton `UK`), `owner: agent`.
- 2026-11-05 : réalisée (PR #160). `en-GB` dans `SUPPORTED_LANGUAGES`, `DATE_FORMATS` et `DAY_MONTH_ORDERS`. Le détecteur garde un code supporté (sans tenir compte de la casse : `en-gb`) et réduit les autres à leur langue de base. `Accept-Language` et `LanguageSelector` lisent `i18n.language`. Pour séparer les noms du sélecteur de ceux des champs de traduction, `LANGUAGE_NAMES` liste les langues de l'application et `CONTENT_LANGUAGE_NAMES` les langues des noms d'entités (le champ anglais reste « English »). Le menu passe de `w-40` à `w-48` pour les noms plus longs. `touches` complété : `backend/src/routes/bottles.test.ts` (import avec `Accept-Language: en-GB`), `frontend/src/components/ui/DateInput.test.tsx` (saisie en English (UK)) et `frontend/AGENTS.md` (paragraphe « Locale bundles »). Bundle public : 132,11 kB gzip (131,94 kB sur `develop`), budget 140 kB.
- 2026-11-05 : relecture de la PR #160 (approuvée), point 1 corrigé sur décision de l'humain. Le détecteur gardait en localStorage (`i18nextLng`) la langue détectée à la première visite : tout appareil passé par v1.11 a `en` enregistré sans que personne l'ait choisi, et serait resté en English (US). Désormais le détecteur n'enregistre rien (`caches: []`) et lit la clé `language`, écrite seulement par le sélecteur (`storeLanguageChoice`, `frontend/src/utils/languageChoice.ts`, dans `utils/` car `src/i18n/**` est exclu de la couverture). Au démarrage, `migrateLegacyLanguage` lit l'ancienne clé `i18nextLng` et la supprime. Une valeur dont la langue de base est celle que v1.11 détectait sur ce navigateur (la première langue du navigateur en `fr` ou `en`, sinon `en`) est abandonnée et la langue est détectée à nouveau. Une autre valeur ne peut venir que du sélecteur : elle est gardée comme un choix. Comparer à la détection de v1.11 plutôt qu'à la langue de base du seul `navigator.language` couvre aussi un navigateur `['de-DE', 'en-GB']` ou `de` (v1.11 y enregistrait `en`, le repli). Cas résiduel : quelqu'un qui avait choisi `en` sur un navigateur `en-GB` passe une fois en English (UK), et choisit de nouveau English (US) dans le menu. Vérifié dans Chrome (Playwright, `/api` simulé, `vite preview`) : invité en `en-GB` sans rien d'enregistré (`<html lang="en-GB">`, `Accept-Language: en-GB`, localStorage vide, même après un rechargement) ; choix English (US) puis Français gardés après un rechargement ; `i18nextLng=en` sur `en-GB` -> English (UK), clé supprimée ; `i18nextLng=en` sur `fr-FR` -> `en` gardé ; admin en `en-AU` -> `en`, puis English (UK) choisi et gardé. Nit 2 appliqué (commentaire de `LanguageSelector`). Rebasée sur `develop` (après E-36). Bundle public : 132,31 kB gzip.
- 2026-11-05 : seconde relecture de la PR #160 (tests seulement). Les tests « stockage bloqué » espionnaient `Storage.prototype`, alors que `src/test/setup.ts` installe un faux localStorage en objet simple : ils passaient sans les try/catch. Ils lèvent maintenant l'erreur par ce faux (`mockImplementationOnce`, rien ne fuit vers les tests suivants). Test ajouté à `LanguageSelector` : `setItem` lève, la langue change quand même. Vérifié : chaque test échoue quand on retire son try/catch.
- Notes de version : aucune action requise, pas de changement cassant. Nouveauté : English (UK) dans le sélecteur de langue, avec les dates jour/mois/année (champs, affichage, import de bouteilles). L'entrée anglaise du menu devient « English (US) », avec le drapeau américain. Seule une langue choisie dans le menu est désormais enregistrée : sans choix, l'application suit la langue du navigateur à chaque visite. À la mise à jour, une langue que les versions précédentes avaient enregistrée d'office (celle du navigateur) est oubliée, une langue choisie dans le menu est gardée. Cas résiduel : quelqu'un qui avait choisi l'anglais sur un navigateur en anglais britannique passe une fois en English (UK) et choisit de nouveau English (US) dans le menu.
