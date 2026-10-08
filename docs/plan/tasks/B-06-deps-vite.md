---
id: B-06
title: "Dépendances lot 5 : Vite 8 puis @vitejs/plugin-react 6"
phase: B
lane: deps
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [B-04, B-05]
touches: [frontend/package.json, frontend/package-lock.json, frontend/vite.config.ts, frontend/vitest.config.ts]
sources: ["08-dependencies.md §3.3", "08-dependencies.md §5"]
branch:
pr:
---

## Décisions validées (2026-10-08)

- **Cible navigateurs** : on garde la cible par défaut de Vite 8 (Safari et iOS ≥ 16.4, Chrome et Edge ≥ 111, Firefox ≥ 114). Pas de `build.target` personnalisé.

## Contexte

Vite 8 remplace Rollup par Rolldown et esbuild par Oxc. Le gain est surtout la vitesse de build et l'alignement avec l'écosystème (`@tailwindcss/vite` 4.3 et `vite-plugin-pwa` visent déjà Vite 8). Le risque est faible ici car la config Vite est minimale, mais le changement de cible navigateurs est une décision produit.

## Problème constaté

- `frontend/vite.config.ts` n'utilise que `react()`, `tailwindcss()` et le proxy de dev : pas de `rollupOptions`, `esbuild` ni `manualChunks`.
- Seul import CommonJS sensible : `jszip` (`import JSZip from 'jszip'` dans `src/components/import/ImportStepUpload.tsx` et `src/services/exportZip.ts`), concerné par les nouvelles règles d'interop CJS.
- Vite 8 relève la cible par défaut à Chrome/Edge 111, Firefox 114, **Safari 16.4 (iOS 16.4, mars 2023)**.

## Ce qu'il faut faire

Deux commits ou deux PR successives, pour isoler les régressions :

1. **Vite 8 avec plugin-react 5.2.0** (qui accepte déjà Vite 8) : `npm install -D vite@^8.3`.
   - `npm run build`, noter la taille des chunks avant/après dans la PR.
   - `npm test`.
   - Vérifier à la main l'import et l'export ZIP de cocktails (`npm run dev`, admin → Cocktails → Exporter / Importer).
2. **plugin-react 6** : `npm install -D @vitejs/plugin-react@^6.1`. Aucune option Babel n'est utilisée, donc pas de `@rolldown/plugin-babel` à ajouter. Rebuild et tests.
3. Si E-01 a déjà ajouté `build.rollupOptions.output.manualChunks`, le renommer en `build.rolldownOptions` (et passer la forme objet de `manualChunks` en fonction).

## Critères d'acceptation

- [ ] Vite 8.3.x et plugin-react 6.1.x installés.
- [ ] `npm run build`, `npm run lint`, `npm test` verts.
- [ ] Import et export ZIP vérifiés manuellement (capture ou description dans la PR).
- [ ] Taille du bundle avant/après dans la PR.
- [ ] Cible navigateurs par défaut de Vite 8 conservée (décision validée).

## Tests à ajouter ou adapter

Aucun test nouveau ; si `jszip` pose problème à l'exécution, ajouter un test unitaire de `services/exportZip.ts` qui génère réellement une archive.

## Points d'attention

- Cible navigateurs : décision validée (voir en tête). Les iPhone 7 et plus anciens (iOS 15) ne sont plus pris en charge.
- En cas de souci d'interop CJS, l'échappatoire temporaire est `legacy.inconsistentCjsInterop`, à documenter et retirer ensuite.

## Journal

- 2026-10-08 : tâche créée à partir du rapport de dépendances.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
