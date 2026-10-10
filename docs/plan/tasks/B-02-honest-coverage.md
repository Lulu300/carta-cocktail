---
id: B-02
title: "Couverture honnête : coverage.include + script delta-coverage corrigé et testé"
phase: B
lane: ci
criticite: haute
effort: M
status: done
owner: agent
depends_on: []
touches: [backend/vitest.config.ts, frontend/vitest.config.ts, .github/scripts/, .github/workflows/ci.yml]
sources: ["04-tests.md §2", "04-tests.md §3", "07-devops-history.md §3.2"]
branch: chore/B-02-honest-coverage
pr: "#52"
---

## Décisions validées (2026-10-08)

- **Seuils (cliquet)** : si un paquet passe sous 60 % une fois la couverture mesurée honnêtement, son seuil est fixé au chiffre mesuré, arrondi à l'entier inférieur. La valeur est notée dans la PR. Le seuil ne redescend jamais ; B-10 le remonte jusqu'à 60 %.

## Contexte

`AGENTS.md` exige 60 % de couverture globale et 80 % sur les lignes modifiées de chaque PR. Ces deux garde-fous ne mesurent pas ce qu'ils annoncent. Les fichiers jamais importés par un test sont absents du rapport, et le script de delta compte comme couverte toute ligne située dans une instruction exécutée, y compris le corps entier d'un handler Express déclaré au chargement du module. Exemple de la revue : `backup.ts`, couvert à 5,5 %, est noté 98,5 %. Tant que ce n'est pas corrigé, les exigences de test de toutes les autres tâches du plan sont invérifiables.

## Problème constaté

- `backend/vitest.config.ts:13-28` et `frontend/vitest.config.ts:13-29` : pas de `coverage.include`. Vitest 4 ne rapporte que les fichiers chargés pendant les tests. Côté frontend, une vingtaine de fichiers sans test (`App.tsx`, `MenuEditPage.tsx`, `MenuBottleEditPage.tsx`, `HomePage.tsx`, les deux layouts, `ImportCocktailWizard.tsx` et ses étapes, `Pagination.tsx`…) ne comptent ni dans le global ni dans le delta.
- `.github/scripts/delta-coverage.mjs` :
  - l.127-134 : chaque ligne entre `start.line` et `end.line` d'une instruction exécutée est marquée couverte. `router.get('/x', async () => { … })` est une instruction exécutée à l'import : tout le handler passe pour couvert. Même chose pour `const Comp = () => { … }` ;
  - l.141-145 : `isExecutable` a le même biais ;
  - l.117-121 : un fichier modifié absent du rapport est ignoré en silence ;
  - l.49-59 : si la base est introuvable, repli sur `HEAD~1`, puis `exit(0)` : le contrôle s'ouvre au lieu d'échouer ;
  - seules les instructions comptent, pas les branches ;
  - aucun test ; le parsing du diff est écrit à la main (l.62-91).
- `.github/workflows/ci.yml:50,94` : `${{ github.base_ref }}` interpolé directement dans `run:`.
- Les constats de la revue sont confirmés à la lecture du code. Les mesures citées (98,5 % contre 5,5 %) n'ont pas été refaites ici.

## Ce qu'il faut faire

1. **Configs Vitest**
   - Backend : `coverage.include: ['src/**/*.ts']` ; ajouter `'src/**/*.test.ts'` et `'src/**/*.d.ts'` aux `exclude` existants.
   - Frontend : `coverage.include: ['src/**/*.{ts,tsx}']` ; ajouter `'src/**/*.test.{ts,tsx}'` et `'src/types/**'` aux `exclude` existants.
2. **Mesurer** la couverture globale réelle des deux paquets après ce changement. Noter les chiffres dans la PR et le Journal.
3. **Seuils** : si un paquet passe sous 60 %, ne pas baisser le seuil sans accord. Proposer dans la PR : soit un seuil temporaire égal au chiffre mesuré arrondi à l'entier inférieur (cliquet), avec une tâche de remontée ; soit écrire d'abord les tests manquants (E-13). **Décision validée : cliquet (voir en tête).**
4. **Script** : le découper en deux fichiers.
   - `.github/scripts/delta-coverage-lib.mjs`, fonctions pures exportées :
     - `parseUnifiedDiff(text): Map<string, Set<number>>` : gère `+++ b/…`, `+++ /dev/null` (fichier supprimé, ignoré), les hunks `+a,b` avec `b = 0` et sans virgule, les renommages ;
     - `lineCoverage(fileCov): Map<number, number>` : sémantique Istanbul « lines ». Chaque instruction est attribuée **à sa seule ligne de début** ; une ligne est couverte si une instruction qui y commence a un compteur > 0 ;
     - `computeDelta({ changedLines, coverage, root, scope, ignore })` : ne retient que les fichiers `.ts`/`.tsx` sous `scope` (ex. `backend/src/`), hors tests. Un fichier du scope absent du rapport compte à 0 % (toutes ses lignes modifiées non vides), sauf s'il correspond à `ignore`.
   - `.github/scripts/delta-coverage.mjs` : CLI mince. Arguments : `--coverage <chemin> --threshold 80 --base <ref> --scope <dossier> [--ignore <glob>]…`. Base introuvable : message clair et **code de sortie 1**, plus de repli sur `HEAD~1`.
5. **Tests du script** : `.github/scripts/delta-coverage.test.mjs`, avec `node:test` et `node:assert` (aucune dépendance à installer).
6. **`ci.yml`**
   - Passer la base par `env:` (`BASE_REF: origin/${{ github.base_ref }}`) et l'utiliser en `"$BASE_REF"`.
   - Passer `--scope backend/src/` ou `--scope frontend/src/`, et les `--ignore` qui reprennent les `exclude` Vitest (`src/index.ts`, `src/main.tsx`, `src/i18n/**`…), avec un commentaire qui renvoie aux configs Vitest.
   - Ajouter l'étape `node --test .github/scripts/` (dans le job backend avant les tests, ou dans un petit job dédié).
7. À décider dans la PR : prendre aussi en compte les branches, ou documenter en tête du script que seules les lignes sont mesurées.

Hors périmètre : `tsc -b`, lint backend, audit, build Docker, `concurrency`, `permissions` (D-04) ; montée de Vitest (B-04) ; tests manquants des pages (E-13) ; `DATABASE_URL` inutile dans `ci.yml:42` (D-04).

## Critères d'acceptation

- [x] Les `coverage-final.json` des deux paquets listent tous les fichiers de `src/` hors exclusions, y compris ceux sans test (à 0 %).
- [x] Couverture globale réelle mesurée et notée ; seuils fixés selon la règle du cliquet.
- [x] Sur un rapport backend réel, le script donne pour `routes/backup.ts` un taux proche (±2 points) de la colonne « % Lines » du reporter `text`.
- [x] Un fichier nouveau sous `src/`, sans aucun test, fait échouer le delta.
- [x] Base introuvable : échec explicite, code de sortie différent de 0.
- [x] `node --test .github/scripts/` passe en local et en CI. *(lancé sous la forme `node --test '.github/scripts/*.test.mjs'`, voir Journal)*
- [x] Plus aucune interpolation `${{ github.base_ref }}` dans un `run:`.

## Tests à ajouter ou adapter

`.github/scripts/delta-coverage.test.mjs`, fixtures inline (petits objets `statementMap`/`s`, pas de vrais rapports) :
- `parseUnifiedDiff` : fichier modifié avec deux hunks ; nouveau fichier (`--- /dev/null`) ; fichier supprimé (`+++ /dev/null`, ignoré) ; hunk de pure suppression (`+12,0`) ; hunk sans compteur (`+7`) ; renommage avec modifications.
- `lineCoverage` : instruction des lignes 10 à 60 exécutée, seule la ligne 10 couverte ; instruction interne à la ligne 20 avec un compteur à 0, ligne 20 non couverte.
- `computeDelta` :
  - handler Express factice (instruction englobante exécutée, instructions internes à 0) : les lignes internes modifiées sont non couvertes ;
  - fichier du scope absent du rapport : 0 % ;
  - fichier hors scope (un fichier backend vu depuis le job frontend) : ignoré ;
  - fichier qui correspond à `--ignore` : ignoré ;
  - fichiers `.test.ts` : ignorés.

Vérification manuelle à décrire dans la PR : sur une branche jetable, ajouter une fonction non testée dans `backend/src/utils/` et constater l'échec du delta.

## Points d'attention

- **La couverture globale va baisser**, surtout côté frontend (estimation de la revue : 55 à 60 %). Sans décision sur les seuils, la CI de `develop` passera au rouge dès le merge. Mesurer avant d'ouvrir la PR.
- Les PR ouvertes au moment du merge verront leur delta recalculé avec la nouvelle méthode : certaines passeront du vert au rouge. Prévenir.
- Avec `coverage.include`, un fichier exclu n'apparaît pas dans le rapport : c'est le rôle de `--ignore` de ne pas le compter à 0 %. Les deux listes doivent rester synchronisées.
- En `pull_request`, `actions/checkout` récupère le commit de merge : `origin/<base>...HEAD` donne bien le diff de la PR. Garder `fetch-depth: 0`.
- B-04 (montée de Vitest) dépend de cette tâche : vérifier après la montée que le format de `coverage-final.json` reste compatible.
- Alternative écartée pour l'instant : `diff-cover` (Python) ou un service externe (Codecov). À reconsidérer si le script devient coûteux à maintenir.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
- 2026-10-10 : PR #52. Couverture avant (`origin/develop`) → après `coverage.include` (statements / branches / functions / lines). Backend : 83,36 / 75,81 / 98,38 / 84,18 → 83,16 / 75,81 / 98,38 / 83,98 (seule différence : les JSON i18n sortent du rapport). Frontend : 82,86 / 74,35 / 71,84 / 85,66 → 61,45 / **52,24** / **53,21** / 63,38 ; 11 fichiers entrent à 0 %. Seuils **non modifiés** à la demande du coordinateur : la CI frontend est rouge (branches et functions) jusqu'à la décision de l'humain. Cliquet proposé : `branches: 52`, `functions: 53`, le reste à 60 ; il manque 142 branches et 56 fonctions couvertes pour revenir à 60 %. Script : `routes/backup.ts` à 66,7 % contre 66,66 % dans « % Lines » (ancienne méthode : 100 %). Branche jetable non poussée avec `backend/src/utils/untestedDiscount.ts` : delta à 0 %, code de sortie 1. Point 7 : lignes seulement, documenté en tête de `delta-coverage-lib.mjs`. Écarts : `node --test <dossier>` ne marche plus depuis Node 22 (les arguments sont des globs), d'où `node --test '.github/scripts/*.test.mjs'` ; les `--ignore` sont relatifs à la racine du dépôt, comme `--scope` ; tests de bout en bout du CLI sur un dépôt git temporaire, en plus des tests demandés. Reste à l'humain : choisir entre cliquet, tests d'abord (E-13) ou exclusions, puis cocher le critère des seuils. Les PR ouvertes en même temps (B-01, C-03, E-03) verront leur delta recalculé après le merge.
- 2026-10-10 : décision de l'humain : option (a), cliquet. Seuils fixés dans `frontend/vitest.config.ts` au chiffre mesuré arrondi à l'entier inférieur : `branches: 52` (52,24 %) et `functions: 53` (53,21 %), avec un commentaire qui renvoie à B-10. `statements` et `lines` restent à 60, backend inchangé. Valeurs de départ notées dans le Journal de B-10 (fichier ajouté au périmètre de cette PR pour cette seule ligne).
- 2026-10-10 : corrections après la revue indépendante (sur 4108326). (1) Chemins avec espace ou caractères spéciaux : `git diff -c core.quotePath=false`, TAB final retiré, chemins entre guillemets décodés (échappements C), échec en code 1 si le décodage est impossible ; tests unitaires et test de bout en bout avec `backend/src/with space.ts` et `backend/src/quote"d.ts`. (2) Le test « +++ dans un hunk » utilise `+++ b/evil.ts`. (3) Le seuil est comparé sur le ratio exact (`covered * 100 >= threshold * changed`) ; le pourcentage affiché est arrondi à l'inférieur (399/499 s'affiche 79,9 % et échoue). `routes/backup.ts` s'affiche donc 66,6 % (reporter : 66,66 %). (4) Normalisation du `/` final de `--scope` déplacée dans `computeDelta` et testée. 38 tests, 100 % des lignes des deux scripts.
