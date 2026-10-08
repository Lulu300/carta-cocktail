---
id: B-09
title: "Dépendances lot 6 : i18next 26 et react-i18next 17"
phase: B
lane: deps
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [A-07, A-08]
touches: [backend/package.json, backend/package-lock.json, frontend/package.json, frontend/package-lock.json, backend/src/i18n/, frontend/src/i18n/]
sources: ["08-dependencies.md §3.6", "08-dependencies.md §5"]
branch:
pr:
---

## Contexte

i18next 26 retire des options anciennes et la bannière console que l'on voit à chaque test backend. react-i18next 17 exige i18next ≥ 26.2 : les deux montent ensemble. Effort et risque faibles ; à faire après A-08, qui modifie la configuration i18n du frontend.

## Problème constaté

- `backend/src/i18n/index.ts` et `frontend/src/i18n/index.ts` n'utilisent que `resources`, `fallbackLng`, `preload`, `interpolation.escapeValue` (+ `supportedLngs` / `load` après A-08) : aucune option supprimée en 26.
- Aucun `<Trans>` dans le frontend, donc le seul changement cassant de react-i18next 17 ne s'applique pas.
- La bannière i18next (`showSupportNotice`) pollue la sortie des tests backend ; elle disparaît en 26.

## Ce qu'il faut faire

1. Backend : `npm install i18next@^26.4`.
2. Frontend : `npm install i18next@^26.4 react-i18next@^17`.
3. Lancer les tests des deux paquets. Côté backend, 122 appels `req.t` passent par `i18next-http-middleware` 3.9.9, qui n'a pas de peer sur i18next : les tests d'intégration font foi.
4. Vérifier à la main, frontend lancé : bascule FR/EN, noms traduits des catégories, messages d'erreur backend dans la bonne langue.

## Critères d'acceptation

- [ ] i18next 26 dans les deux paquets, react-i18next 17 côté frontend.
- [ ] Tests verts, plus de bannière i18next dans la sortie des tests backend.
- [ ] Bascule de langue vérifiée manuellement.

## Tests à ajouter ou adapter

Aucun. Si E-13 a introduit une vraie instance i18next dans les tests frontend, ils couvrent la montée.

## Points d'attention

- 26.4 met en cache la hiérarchie des langues : si du code modifie `load` ou `lowerCaseLng` à l'exécution, appeler `i18n.clearCache()`. Ce n'est pas le cas aujourd'hui.

## Journal

- 2026-10-08 : tâche créée à partir du rapport de dépendances.
