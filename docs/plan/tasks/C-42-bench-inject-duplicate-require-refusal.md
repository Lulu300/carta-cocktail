---
id: C-42
title: "Banc de mise à jour : avec --inject-duplicate, exiger le refus au lieu de seulement l'autoriser"
phase: C
lane: ci
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-41]
touches: [scripts/upgrade-test/]
sources: []
branch: chore/C-42-bench-inject-duplicate-require-refusal
pr: #149
---

## Contexte

C-41 (PR #137) a ajouté l'option `--inject-duplicate` au banc `scripts/upgrade-test/`. Elle ajoute une catégorie en double dans la copie de travail, puis attend que la migration `schema_integrity` (v1.8.0) refuse de démarrer : `allowedFailures` autorise `startup` et `allowedActionFailures` autorise l'échec de `checkDatabaseCopy` (`lib/expectations.mjs`), avec la raison du doublon injecté.

## Problème constaté

Relevé par la relecture de la PR #137 (points 1 à 4, non bloquants) :

- L'option **autorise** le refus, elle ne l'**exige** pas. Si une version qui a `profile.uniqueCategoryNames` démarre quand même (par exemple une version future qui dédoublonne avant de migrer), le rapport est OK. Il ne signale pas que le refus attendu n'a pas eu lieu, il n'y a ni `refusal message` ni contrôle `backupBeforeJump`, et la ligne de setup dit seulement qu'une ligne a été ajoutée.
- `markExpectedActions` attend **tout** échec de `checkDatabaseCopy`, y compris le résultat `copy started, n/m expected log lines, migrate status NOT up to date` (`lib/actions.mjs`). Ce résultat veut dire que la copie a démarré, donc que le doublon n'a pas été refusé, et la raison du doublon injecté le masque.
- Duplication : `loadRealHookFiles` (`test/versions.test.mjs`) reprend `loadHookFiles` de `run.mjs` (même `readdirSync` + `import`).
- Un jeu d'essai sans catégorie fait échouer `prepare()` avec un message clair, mais le run sort en code 1 (erreur de run) et pas en code 2 (option refusée).

## Ce qu'il faut faire

1. Avec `--inject-duplicate`, sur une étape dont le profil a `uniqueCategoryNames`, un démarrage réussi donne une ligne KO non autorisée (« refus attendu absent : le doublon injecté n'a pas été refusé »).
2. N'attendre, pour `checkDatabaseCopy`, que la copie refusée : par exemple un champ `refused: true` dans le résultat de l'action quand la copie sort sans démarrer, et `markExpectedActions` qui ne marque que ce cas.
3. Exporter le chargement des hooks (par exemple depuis `lib/versions.mjs`) et l'utiliser dans `run.mjs` et dans `test/versions.test.mjs`.
4. Jeu d'essai sans catégorie avec `--inject-duplicate` : refus de l'option (code 2), contrôlé au même endroit que le contrôle de l'index `Category_name_key`, avant `resolveImages`.

## Critères d'acceptation

- [x] Un démarrage réussi sur une étape `uniqueCategoryNames` avec l'option donne 1 échec inattendu (test unitaire avec une étape simulée).
- [x] Une copie `checkDatabaseCopy` qui démarre avec l'option reste un échec inattendu ; une copie refusée reste attendue.
- [x] `loadHookFiles` n'existe plus qu'une fois.
- [x] `--path 1.4.0,local --layout friend --inject-duplicate`, naïf et conforme, sur une copie du jeu d'essai : mêmes résultats qu'avec C-41 (0 échec inattendu, refus reconnu).
- [x] Tests unitaires du banc (`node --test scripts/upgrade-test/test/*.test.mjs`) verts.

## Tests à ajouter ou adapter

- `checks.test.mjs` : démarrage réussi avec l'option (échec inattendu) ; `markExpectedActions` avec une copie refusée et une copie démarrée.
- `versions.test.mjs` : utilise le chargement exporté.

## Points d'attention

- Le jeu d'essai reste hors du dépôt, et le rapport ne contient que des nombres.
- Le banc a besoin du hook `hooks/1.12.0.mjs` temporaire non commité tant que les notes de release ne l'ont pas ajouté (Journal de D-01).

## Journal

- 2026-10-13 : tâche créée par la PR docs de suivi du lot E-13/B-12/C-41/D-30, à partir de la relecture de la PR #137 (C-41).
- 2026-11-05 : fait (PR #149). Avec `--inject-duplicate`, chaque étape `uniqueCategoryNames` a une ligne `injected duplicate refused` (groupe `duplicateRefusal`, jamais autorisé) : OK si le backend refuse, KO « expected refusal missing » s'il démarre (`checkInjectedDuplicateRefused`, `lib/expectations.mjs`). `checkDatabaseCopy` renvoie `refused: true` quand la copie sort sans démarrer, et `markExpectedActions` ne marque plus que ce cas. `loadHookFiles` exporté par `lib/versions.mjs`, utilisé par `run.mjs` et `test/versions.test.mjs`. Jeu d'essai sans catégorie : refus de l'option (code 2) avec le contrôle de `Category_name_key`, par une seule lecture du helper (`readFixtureCategories`, `checkFixtureAcceptsDuplicate` dans `lib/database.mjs`), avant `resolveImages` ; la vérification dans `prepare()` disparaît. Banc sur une copie temporaire du jeu d'essai, layout `friend`, `1.4.0,local`, avec le `hooks/1.12.0.mjs` temporaire non commité : naïf et conforme OK, 0 échec inattendu, 2 échecs attendus chacun comme avec C-41 (759 lignes de référence, 761 après le saut, aucune perte), refus reconnu, ligne `injected duplicate refused` OK. Sonde de bout en bout (profil de 1.7.0 modifié pour l'essai, `1.4.0,1.7.0`, naïf) : démarrage, 1 échec inattendu `injected duplicate refused`, code 1. Copie sans catégorie : code 2 sans construire d'image.
