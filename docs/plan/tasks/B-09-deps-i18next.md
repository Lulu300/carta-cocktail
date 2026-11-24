---
id: B-09
title: "Dépendances lot 6 : i18next 27 et react-i18next 18 (tâche écrite pour 26 et 17)"
phase: B
lane: deps
criticite: basse
effort: S
status: done
owner: agent
depends_on: [A-07, A-08]
touches: [backend/package.json, backend/package-lock.json, frontend/package.json, frontend/package-lock.json, backend/src/i18n/, backend/src/middleware/errorHandler.ts, frontend/src/i18n/, AGENTS.md, frontend/AGENTS.md]
sources: ["08-dependencies.md §3.6", "08-dependencies.md §5"]
branch: chore/B-09-deps-i18next
pr: "#203"
---

## Contexte

i18next 26 retire des options anciennes et la bannière console que l'on voit à chaque test backend. react-i18next 17 exige i18next ≥ 26.2 : les deux montent ensemble. Effort et risque faibles ; à faire après A-08, qui modifie la configuration i18n du frontend.

## Problème constaté

- `backend/src/i18n/index.ts` n'utilise que `resources`, `fallbackLng` et `preload`. `frontend/src/i18n/index.ts` utilise `resources`, `fallbackLng`, `interpolation.escapeValue` et, depuis A-08, `supportedLngs`, `detection.order` et `detection.convertDetectedLanguage` (ces deux dernières sont lues par `i18next-browser-languagedetector` 8.2). A-08 n'a volontairement mis ni `load` ni `nonExplicitSupportedLngs`. Aucune de ces options n'est supprimée en 26.
- Aucun `<Trans>` dans le frontend, donc le seul changement cassant de react-i18next 17 ne s'applique pas.
- La bannière i18next (`showSupportNotice`) pollue la sortie des tests backend ; elle disparaît en 26.

## Ce qu'il faut faire

1. Backend : `npm install i18next@^26.4`.
2. Frontend : `npm install i18next@^26.4 react-i18next@^17`.
3. Lancer les tests des deux paquets. Côté backend, 122 appels `req.t` passent par `i18next-http-middleware` 3.9.9, qui n'a pas de peer sur i18next : les tests d'intégration font foi.
4. Vérifier à la main, frontend lancé : bascule FR/EN, noms traduits des catégories, messages d'erreur backend dans la bonne langue.

## Critères d'acceptation

- [x] i18next 26 dans les deux paquets, react-i18next 17 côté frontend (fait en 27 et 18, voir Journal).
- [x] Tests verts, plus de bannière i18next dans la sortie des tests backend.
- [x] Bascule de langue vérifiée manuellement (rendu Chrome sans interface et `curl`, voir Journal).

## Tests à ajouter ou adapter

Aucun nouveau test. `frontend/src/i18n/index.test.ts` (A-08) protège la détection de langue avec une vraie instance i18next : locale régionale ramenée à la langue de base (`fr-FR` → `fr`), `en-US` → `en`, langue non supportée → `en`, valeur régionale en cache dans `localStorage`, mise à jour de `<html lang>`. Il doit rester vert sans modification après la montée en 26 ; s'il casse, c'est un changement de comportement à corriger, pas un test à adapter. Si E-13 a introduit une vraie instance i18next dans d'autres tests frontend, ils couvrent aussi la montée.

## Points d'attention

- `i18next-browser-languagedetector` reste en 8.2 : vérifier qu'il n'impose pas de version d'i18next et que `convertDetectedLanguage` est toujours appelé avec i18next 26 (couvert par `index.test.ts`).
- 26.4 met en cache la hiérarchie des langues : si du code modifie `load` ou `lowerCaseLng` à l'exécution, appeler `i18n.clearCache()`. Ce n'est pas le cas aujourd'hui.

## Journal

- 2026-10-08 : tâche créée à partir du rapport de dépendances.
- 2026-10-08 : suivi des revues de la phase A. Options réelles posées par A-08 (`supportedLngs`, `detection.order`, `detection.convertDetectedLanguage`, pas de `load`) et rôle de `frontend/src/i18n/index.test.ts` comme garde-fou de la montée.
- 2026-11-24 : après la release v1.14.0, Dependabot a ouvert deux alertes modérées (avis publié le 2026-11-23, alertes créées au merge de la PR #199 sur `main`) sur `i18next` < 26.3.4 (GHSA-6jcc-5g8w-32mx), #22 (backend) et #23 (frontend), sous le seuil `high` de l'audit de la CI. Cette tâche les ferme.
- 2026-11-24 : PR #203, sur `develop` (ba163af), Node 24.14.0, npm 11.9.0. Motif : alertes Dependabot #22 à #25, GHSA-6jcc-5g8w-32mx (`i18next` < 26.3.4, `moderate`, `deepExtend` via `addResourceBundle(…, deep, overwrite)` ; notre seul appel, `frontend/src/i18n/admin.ts`, passe `overwrite: false` sur des messages du dépôt : pas exposé). Depuis la rédaction, i18next 27 (2026-11-07, 27.2.7 le 2026-11-24) et react-i18next 18 (peer `i18next >= 27`) sont sortis ; react-i18next 17.1.13 accepte 26 et 27. Les deux montées essayées : 26.7.2 + 17.1.13 demande seulement le retrait de `showSupportNotice` (option et bannière supprimées en 26), 27.2.7 + 18.0.3 demande en plus `{}` au lieu de `undefined` pour les options de `t()` dans `errorHandler.ts` (types de 27) ; tests verts et bundle identique (135,71 kB contre 135,66 kB) : 27 retenue. Changements cassants de 26 et 27 confrontés au code : options retirées en 26 non utilisées sauf `showSupportNotice` ; `fallbackLng` déjà réglé ; aucune traduction vide (`returnEmptyString`) ; pas de `CustomTypeOptions` (`strictInterpolationChecks`) ; `escapeValue: false` des deux côtés (échappement de `/`) ; aucun `<Trans>`, `IcuTrans`, `useSSR`, `withTranslation` ; aucune comparaison de `i18n.language` avec une valeur précédente ; React 19. `i18next-browser-languagedetector` reste en 8.2.1 (pas de peer) ; `frontend/src/i18n/index.test.ts` passe sans modification. Lockfiles : `i18next` 27.2.7, `react-i18next` 18.0.3, `html-parse-stringify` 4.0.1 ; `use-sync-external-store`, `void-elements` (frontend) et `@babel/runtime` (backend) sortent ; aucune surcharge ajoutée. `npm ci`, lint, `tsc`, build, `npm test -- --coverage` (backend 1351 tests, frontend 1188) ; `npm audit` et `--omit=dev` à 0 dans les deux paquets ; plus de bannière. Bundle public 133,37 → 135,66 kB (`vendor-i18n` 17,65 → 19,95 kB), budget de 140 kB inchangé. `dist/` CommonJS du backend : `require('i18next')` charge `dist/cjs` et traduit. Vérification à la main (backend sur base temporaire, Vite) : erreurs de l'API en français pour `Accept-Language` `fr` et `fr-FR`, en anglais pour `en`, `EN` et `de`, `?lng=fr` respecté ; rendu Chrome sans interface : `?lng=fr`/`fr-FR` en français, `?lng=en-GB` en anglais avec `<html lang="en-GB">`, `?lng=de` passe au détecteur suivant, `/login` en FR et en EN ; l'extension Claude in Chrome n'étant pas connectée, le sélecteur de langue n'a pas été cliqué (couvert par les tests). Hors périmètre : B-25 (`i18next-http-middleware` 3.9.9 fait grandir `preload` à chaque langue inventée). Pas de ligne « Notes de version » : aucun effet visible.
