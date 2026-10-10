---
id: B-10
title: "Remonter la couverture à 60 % (cliquet de B-02)"
phase: B
lane: frontend
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [B-02]
touches: [frontend/src/**/*.test.tsx, frontend/src/**/*.test.ts, frontend/vitest.config.ts, backend/vitest.config.ts]
sources: ["04-tests.md §2", "04-tests.md §6", "04-tests.md §8"]
branch:
pr:
---

## Décisions validées (2026-10-08)

- **Cliquet** : B-02 fixe le seuil d'un paquet au chiffre mesuré si celui-ci est sous 60 %. Le seuil ne redescend jamais. Cette tâche le remonte jusqu'à 60 %, en relevant le seuil à chaque PR.

## Contexte

Une fois `coverage.include` en place (B-02), les fichiers jamais importés par un test entrent dans le calcul. La revue estime la couverture frontend réelle autour de 55-60 %, sous le seuil exigé par `AGENTS.md`. La règle du cliquet garde la CI verte. Cette tâche rembourse la dette jusqu'à revenir à 60 %. **Sans objet si B-02 mesure déjà ≥ 60 % dans les deux paquets** : passer alors la tâche en `dropped` avec la mesure dans le Journal.

## Problème constaté

Fichiers sans aucun test d'après la revue (`04-tests.md §2`), par ordre de priorité :
- `pages/admin/MenuEditPage.tsx` (391 lignes) et `MenuBottleEditPage.tsx` (424 lignes) ;
- `components/import/ImportCocktailWizard.tsx` et ses étapes `ImportStepUpload`, `ImportStepResolve`, `ImportStepConfirm`, `ImportEntityRow` ;
- `App.tsx` (routes protégées, redirection vers `/login`) et `components/layout/AdminLayout.tsx`, `PublicLayout.tsx` ;
- `components/ui/Pagination.tsx` (24 %), `CategoryFilterInput.tsx` (47 %), `hooks/useSort.ts` (62 %), `usePagination.ts`, `useClickOutside.ts` ;
- `pages/admin/CocktailFormPage.tsx` (34 %, branches 19,8 %).

## Ce qu'il faut faire

1. Lire le seuil courant de chaque paquet dans `vitest.config.ts` (fixé par B-02) et la mesure réelle (`npm test -- --coverage`).
2. Écrire des tests de **comportement** (pas de classes CSS, pas de détails d'implémentation) en commençant par les fichiers ci-dessus. Les hooks et `Pagination` sont les plus rentables : courts, purs, faciles à tester.
3. À chaque PR, relever le seuil au nouveau chiffre mesuré arrondi à l'entier inférieur, sans jamais dépasser la mesure.
4. S'arrêter à 60 % sur les quatre métriques. Plusieurs petites PR valent mieux qu'une seule grosse : une PR par groupe de fichiers.
5. Ne pas dupliquer le travail des tâches qui ajoutent déjà des tests à ces fichiers : E-07 (éditeurs de menus), E-08 (assistants d'import), E-06 (formulaire cocktail). Si l'une est en cours, choisir d'autres fichiers.

## Critères d'acceptation

- [ ] Statements, branches, functions et lines ≥ 60 % dans les deux paquets, seuils remis à 60 dans `vitest.config.ts`.
- [ ] Chaque PR relève le seuil et ne le baisse jamais.
- [ ] Aucun test qui vérifie une classe CSS ou un détail d'implémentation.

## Tests à ajouter ou adapter

- `hooks/useSort.test.ts`, `usePagination.test.ts` : tri croissant/décroissant, page hors limite ramenée à la dernière page après filtrage.
- `components/ui/Pagination.test.tsx` : navigation, boutons désactivés en bord de liste.
- `App.test.tsx` : route admin sans token → redirection `/login` ; avec token → page admin.
- Tests de `MenuEditPage` et des étapes d'import si E-07 / E-08 ne les ont pas encore ajoutés.

## Points d'attention

- Si E-13 (MSW) est déjà mergée, utiliser ses handlers et factories plutôt que `vi.mock('services/api')`.
- Une couverture qui monte grâce à des tests vides (« renders title ») ne compte pas : la relecture doit le vérifier.

## Journal

- 2026-10-08 : tâche créée suite à la décision « cliquet » sur B-02.
- 2026-10-10 : point de départ fixé par B-02 (PR #52), remesuré sur `develop` après le merge d'E-03 (8c2af71). Seul le frontend est sous 60 %, sur deux métriques : `branches: 54` (mesuré 54,62 %, 1051/1924) et `functions: 54` (mesuré 54,74 %, 467/853) dans `frontend/vitest.config.ts`. `statements` (62,82 %) et `lines` (64,71 %) restent à 60. Backend au-dessus de 60 % partout, seuils inchangés. Il manque 104 branches et 45 fonctions couvertes pour revenir à 60 %. La tâche se limite donc à remonter ces deux seuils frontend jusqu'à 60.
