---
id: D-38
title: "Banc de mise à jour : vérifier quel refus la copie de la base a écrit"
phase: D
lane: ci
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-46]
touches: [scripts/upgrade-test/]
sources: []
branch:
pr:
---

## Contexte

Relecture de la PR #171 (C-46), point non bloquant 1. L'action `checkDatabaseCopy` du banc (`scripts/upgrade-test/lib/actions.mjs`, étape « Before 4 » du hook `1.6.0`) démarre l'image cible sur une seconde copie de la base, montée depuis un dossier de l'hôte (`db-check-<version>` dans le dossier de travail du run). `judgeDatabaseCopy` juge le résultat.

C-46 a appris au banc à distinguer, pour le démarrage de l'instance, le refus d'une migration en échec (`FAILED_MIGRATION_REFUSAL`) du refus « cannot write » de D-01 (`UNWRITABLE_REFUSAL`, `beforeMigrations: true`). La copie n'a pas reçu ce traitement.

## Problème constaté

Vérifié sur `develop` (923c4ed) :

- `judgeDatabaseCopy` marque toute copie refusée `refused: true`, sans lire ses logs, alors que `waitForStart` les renvoie aussi pour un démarrage refusé.
- Avec `--inject-duplicate`, `allowedActionFailures` (`lib/expectations.mjs`) attend le refus de `checkDatabaseCopy` avec la raison du doublon (`INJECTED_DUPLICATE_REASON`), et `markExpectedActions` le marque attendu sur le seul `refused: true`, sans vérifier quel refus la copie a écrit.
- Depuis v1.12.0, l'image tourne en uid 1000 et l'entrypoint vérifie l'écriture dans `/app/data` avant la sauvegarde et les migrations. Le dossier de la copie appartient à l'utilisateur de l'hôte, et le banc ne le donne pas à uid 1000 : `chownMounts` (hook `1.12.0`, « Before 3 ») ne traite que les montages de l'instance, et les hooks passent dans l'ordre des versions, donc `checkDatabaseCopy` (1.6.0) tourne avant.
- Sous Docker Desktop, le dossier monté est inscriptible et la copie est refusée par la migration, comme prévu. Sur un hôte Linux dont l'utilisateur n'est pas uid 1000, la copie serait refusée pour « cannot write », et ce refus serait compté comme le refus attendu du doublon. Même classe de problème que C-46, pour l'action cette fois ; il existait avant la PR #171.
- Sur le même hôte, sans `--inject-duplicate`, la copie refusée pour « cannot write » serait un échec inattendu de l'action : visible, mais sans rapport avec la base.

## Ce qu'il faut faire

1. Dans `judgeDatabaseCopy`, chercher le refus dans les logs de la copie refusée avec `findRefusal` et les refus connus de la version cible (ceux de `profile.refusals`, cumulés comme pour le démarrage), et le renvoyer avec le résultat.
2. Avec `--inject-duplicate`, n'attendre la copie refusée que si ce refus est `FAILED_MIGRATION_REFUSAL`. Un refus avant les migrations (`beforeMigrations`) n'a pas testé le doublon : action non applicable ou échec inattendu, au choix de l'agent, noté au Journal et dans `scripts/upgrade-test/README.md` (paragraphe `--inject-duplicate`). Un refus inconnu reste un échec inattendu.
3. Rendre la copie inscriptible par l'utilisateur de l'image avant de la démarrer, si l'agent juge que c'est le bon correctif pour le cas sans `--inject-duplicate` (par exemple avec le conteneur d'aide, comme `chownMounts`, ou `--user`). Le noter au Journal. Les notes de v1.6.0 et `UPGRADING.md` démarrent la copie avec l'image `:1.6.0`, qui tourne en root : le guide n'est pas concerné, seul le banc démarre la copie avec l'image cible.

## Critères d'acceptation

- [ ] Avec `--inject-duplicate`, une copie refusée pour « cannot write » n'est plus comptée comme le refus attendu du doublon ; une copie refusée par la migration en échec l'est toujours.
- [ ] Le détail de l'action nomme le refus trouvé dans les logs de la copie.
- [ ] `--layout official --path 1.4.0,<version ≥ 1.12.0> --mode both --inject-duplicate` et le layout `friend` donnent le même résultat qu'avant sous Docker Desktop.
- [ ] Tests `node --test scripts/upgrade-test/test/*.test.mjs` ajoutés et verts.

## Tests à ajouter ou adapter

- `actions.test.mjs` : `judgeDatabaseCopy` renvoie le refus trouvé dans les logs (migration en échec, « cannot write », aucun refus connu).
- Tests des attentes (`markExpectedActions`, `judgeStep`) : avec `--inject-duplicate`, la copie refusée par la migration est attendue ; refusée pour « cannot write » ou sans refus connu, elle ne l'est pas.

## Points d'attention

- `findRefusal` renvoie le premier refus de `profile.refusals` trouvé dans les logs, et `UNWRITABLE_REFUSAL` est listé avant `FAILED_MIGRATION_REFUSAL` dans le hook `1.12.0`. Des logs qui contiendraient les deux messages seraient donc lus comme un refus avant les migrations. Sans effet aujourd'hui : l'entrypoint vérifie l'écriture en premier à chaque redémarrage, et les propriétaires des dossiers ne changent pas entre deux redémarrages (relecture de la PR #171, point 2). À garder en tête si la copie ou l'instance changent de propriétaire en cours de démarrage.
- Le cas Linux n'est pas reproductible sous Docker Desktop (montages de dossiers inscriptibles quel que soit le propriétaire) : le couvrir par les tests unitaires, avec des logs qui contiennent le message de l'entrypoint.
- Le jeu d'essai reste hors du dépôt, et le rapport ne contient que des nombres.
- Banc et images à nom fixe : un verrou `mkdir` si deux agents le lancent en même temps.

## Journal

- 2026-11-12 : tâche créée par la PR docs de suivi du lot C-47/C-48/B-21/C-46, d'après la relecture de la PR #171 (points non bloquants 1 et 2). Vérifié sur `develop` (923c4ed) : `judgeDatabaseCopy` ne lit pas les logs d'une copie refusée, `allowedActionFailures` et `markExpectedActions` attendent tout refus de `checkDatabaseCopy` avec `--inject-duplicate`, `chownMounts` ne traite que les montages de l'instance, et `checkDatabaseCopy` démarre l'image cible (`ctx.target.images.backend`) sur un dossier de l'hôte. Le cas sans `--inject-duplicate` (échec inattendu sur un hôte Linux dont l'utilisateur n'est pas uid 1000) est ajouté par la PR docs, il n'était pas dans la relecture.
