---
id: A-08
title: "Langue : fr-FR/en-US mal reconnus et <html lang> figé"
phase: A
lane: frontend
criticite: haute
effort: S
status: done
owner: agent
depends_on: []
touches: [frontend/src/i18n/index.ts, frontend/src/components/ui/LanguageSelector.tsx, frontend/src/utils/localization.ts]
sources: ["06-frontend-ux-perf.md §3"]
branch: fix/A-08-i18n-language-detection
pr: 29
---

## Contexte

La langue de l'interface est détectée depuis le navigateur. Les navigateurs renvoient souvent `fr-FR` ou `en-US`, que le code compare à `fr` ou `en` sans normaliser. Résultat : un invité francophone voit l'interface en français mais les noms de catégories, d'ingrédients et d'unités en anglais ; un anglophone en `en-US` voit le sélecteur afficher « FR ». Enfin, `<html lang>` reste `en` en permanence : les lecteurs d'écran lisent la carte avec une voix anglaise et la césure du navigateur est fausse.

## Problème constaté

- `frontend/src/i18n/index.ts:7-19` : `LanguageDetector` sans `supportedLngs` ni `load`. `i18n.language` garde la valeur brute du navigateur (`fr-FR`). Les chaînes de l'UI s'affichent quand même en français grâce au repli de résolution d'i18next, ce qui masque le bug.
- `frontend/src/components/ui/LanguageSelector.tsx:41` : `languages.find(lang => lang.code === i18n.language) || languages[0]`. Avec `en-US`, rien ne correspond et le sélecteur affiche FR (premier élément) alors que l'UI est en anglais.
- `frontend/src/utils/localization.ts:11` : `t[locale]` avec `locale = 'fr-FR'` ne trouve rien et retombe sur `t['en']`. La fonction est appelée par `frontend/src/hooks/useLocalizedName.ts:10` avec `i18n.language`.
- `frontend/index.html:2` : `<html lang="en">`. Aucune mise à jour de `document.documentElement.lang` dans `src/` (0 occurrence).
- Les tests ne peuvent pas le voir : `frontend/src/test/setup.ts:17-24` mocke `react-i18next` avec `language: 'en'`.
- Constat de la revue confirmé.

## Ce qu'il faut faire

1. `frontend/src/i18n/index.ts` :
   ```ts
   export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;

   i18n.on('languageChanged', (lng) => {
     document.documentElement.lang = (lng || 'en').split('-')[0];
   });

   i18n
     .use(LanguageDetector)
     .use(initReactI18next)
     .init({
       resources: { en: { translation: en }, fr: { translation: fr } },
       supportedLngs: [...SUPPORTED_LANGUAGES],
       load: 'languageOnly',
       fallbackLng: 'en',
       interpolation: { escapeValue: false },
     });
   ```
   Avec `supportedLngs`, i18next retient le meilleur code supporté (`fr-FR` devient `fr`) et `i18n.language` vaut `fr`. Ne **pas** activer `nonExplicitSupportedLngs`, qui conserverait `fr-FR`. Enregistrer l'écouteur avant `init` pour couvrir la détection initiale.
2. `frontend/src/utils/localization.ts` : normaliser la locale, par défense en profondeur. Ordre : `t[locale]`, puis `t[locale.split('-')[0]]`, puis `t.en`, puis la première valeur non vide, puis `entity.name`.
3. `frontend/src/components/ui/LanguageSelector.tsx` :
   ```ts
   const currentCode = (i18n.resolvedLanguage ?? i18n.language ?? 'en').split('-')[0];
   const currentLanguage =
     languages.find((l) => l.code === currentCode) ?? languages.find((l) => l.code === 'en')!;
   ```
   Le repli doit être l'anglais (`fallbackLng`), pas le premier élément de la liste.
4. Vérifier à la main dans Chrome (langue `fr-FR`, puis `en-US`) et Firefox, avec un `localStorage` vide.

Hors périmètre : `aria-label="Change language"` en dur et pattern ARIA du menu (E-09, E-10) ; attribut `lang` initial de `index.html` (E-12) ; en-tête `Accept-Language` des appels API (A-10).

## Critères d'acceptation

- [x] Navigateur en `fr-FR` : UI en français, noms de catégories, d'ingrédients et d'unités en français, sélecteur sur FR, `<html lang="fr">`.
- [x] Navigateur en `en-US` : tout en anglais, sélecteur sur EN, `<html lang="en">`.
- [x] Navigateur en `de-DE` : anglais partout.
- [x] Changer de langue avec le sélecteur met `<html lang>` à jour immédiatement.
- [x] Une valeur `fr-FR` déjà stockée dans `localStorage.i18nextLng` est résolue en `fr`.

## Tests à ajouter ou adapter

- `frontend/src/utils/localization.test.ts` : avec `{ name: 'Rum', nameTranslations: { fr: 'Rhum', en: 'Rum' } }`, `'fr-FR'` donne `'Rhum'`, `'en-US'` donne `'Rum'`, `'de'` donne `'Rum'` ; `nameTranslations: null` donne `name`.
- `frontend/src/components/ui/LanguageSelector.test.tsx` : avec le mock `i18n: { language: 'en-US', resolvedLanguage: 'en' }`, le bouton affiche `en` ; avec `language: 'fr-FR'` sans `resolvedLanguage`, il affiche `fr` ; avec `language: 'de'`, il affiche `en`.
- `frontend/src/i18n/index.test.ts` (nouveau) : utiliser la vraie instance (`setup.ts` ne mocke que `react-i18next`, pas `i18next`). Vider `localStorage`, forcer `navigator.language` à `fr-FR` (`vi.spyOn(navigator, 'language', 'get')`), `vi.resetModules()` puis `await import('./index')`. Attendre `i18n.language === 'fr'` et `document.documentElement.lang === 'fr'`. Puis `await i18n.changeLanguage('en')` : `lang === 'en'`. `src/i18n/**` est exclu de la couverture : ce test sert de non-régression, pas de chiffre.

## Points d'attention

- Le détecteur lit d'abord `localStorage.i18nextLng`, puis le navigateur. Tester avec un `localStorage` vide, sinon la valeur en cache masque le résultat.
- `useLocalizedName` n'a pas besoin de changer : il recevra désormais `fr` ou `en`, et `localization.ts` normalise de toute façon.
- Le backend choisit la langue des messages d'erreur d'après l'`Accept-Language` du navigateur, pas d'après l'UI : traité dans A-10.
- `navigator.language` est en lecture seule dans jsdom : passer par `vi.spyOn(..., 'get')` ou `Object.defineProperty`, et restaurer après le test.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : traitée dans la PR #29 (branche `fix/A-08-i18n-language-detection`). Écarts par rapport au plan : pas de `load: 'languageOnly'` (dans i18next 25, `isSupportedCode()` retire alors la région et `fr-FR` reste dans `i18n.language`, comme avec `nonExplicitSupportedLngs`) ; ajout de `detection.convertDetectedLanguage` (codes détectés ramenés à la langue de base) et retrait du détecteur `htmlTag` de `detection.order` (sinon un navigateur qui n'annonce que `fr-FR` prendrait le `lang="en"` d'`index.html`, et un `de-DE` hériterait de la langue précédente écrite dans `<html lang>`). Retrait aussi de `cookie` (lecture sans try/catch, et aucun cookie n'est écrit : le cache est dans `localStorage`). `getBaseLanguage` et `FALLBACK_LANGUAGE` partagés depuis `utils/localization.ts`. Critères couverts par des tests automatiques.
- 2026-10-08 : étape 4 vérifiée dans de vrais navigateurs avec Playwright (script jetable hors dépôt, `vite preview` du build, page `/login`, profil neuf donc `localStorage` vide, sans backend). Chromium et WebKit : en `fr-FR` (`navigator.languages` = `fr-FR` seul), `<html lang="fr">`, `i18nextLng` = `fr`, titre « Connexion », sélecteur sur `fr` ; en `en-US`, `lang="en"`, `i18nextLng` = `en`, « Login », sélecteur sur `en` ; en `de-DE`, `lang="en"`, `i18nextLng` = `en`, « Login », sélecteur sur `en`. Firefox (Playwright 157) refuse de démarrer sur cette machine (« Could not find profile folder », aussi en lancement direct) : non vérifié, WebKit testé à la place.
