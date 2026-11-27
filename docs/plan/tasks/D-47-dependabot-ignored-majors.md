---
id: D-47
title: "Suivi des majeures ignorées par Dependabot (Prisma et better-sqlite3, Node et @types/node) et retrait de @types/bcryptjs"
phase: D
lane: deps
criticite: basse
effort: M
status: todo
owner: mixed
depends_on: [C-15, D-21]
touches: [AGENTS.md, README.md, docs/plan/README.md, backend/package.json, backend/package-lock.json, frontend/package.json, frontend/package-lock.json, .github/dependabot.yml, .nvmrc, backend/Dockerfile, frontend/Dockerfile]
sources: []
branch: chore/D-47-node-26
pr: 296
---

## Contexte

D-21 a réactivé les mises à jour de version npm de Dependabot. Hors TypeScript (suivi par F-07), les majeures encore ignorées dans `.github/dependabot.yml` sont suivies ici, pour qu'un `ignore` ne masque pas une majeure sans que personne ne la surveille.

**Prisma et better-sqlite3** (`prisma`, `@prisma/client`, `@prisma/adapter-better-sqlite3`, `better-sqlite3`, entrée npm `/backend`) :

- les trois paquets Prisma doivent monter ensemble (CLI, client généré et adapter à la même version) ; une majeure proposée par Dependabot arriverait en trois PR séparées ;
- `better-sqlite3` reste dans la plage de dépendance de `@prisma/adapter-better-sqlite3` (`^12.6.0` en 7.10.1) : une version 13 au premier niveau laisserait l'adapter avec un `better-sqlite3` 12 imbriqué, soit deux modules natifs ;
- une majeure de Prisma touche aussi la surcharge `"@prisma/config": { "effect": "^3.22.1" }` de B-24 (suivie dans B-22) et les coupes de l'image backend (D-30, `backend/docker/prune-unused-deps.mjs`).

Au 2026-11-25 : `prisma@latest` = 8.0.0-rc.35 (2026-11-23), la ligne stable 7.10.1 est sous le dist-tag `prev` ; `@prisma/client@latest` et `@prisma/adapter-better-sqlite3@latest` = 7.10.1 ; l'adapter n'a aucune version 8 publiée ; `better-sqlite3@latest` = 13.2.0. Dependabot ne propose pas la rc (il écarte les pré-versions tant que la version actuelle est stable, même quand `latest` en désigne une).

**Node et `@types/node`** (image `node` de l'entrée docker, `@types/node` des deux entrées npm) : décision du 2026-10-10, Node 24 LTS pour les images, la CI (`.nvmrc`) et le développement, `engines.node` à `>=24`. `@types/node` suit la majeure de Node. Au 2026-11-25 : Node 26 est LTS depuis la 26.13.0 (2026-10-28, « Lithium ») ; Node 24 (24.22.3) reste LTS de maintenance ; les images sont en `node:24.22-alpine` ; `@types/node@latest` = 26.6.7, le dépôt est en `^24.19.1`.

**`@types/bcryptjs`** (devDependency du backend, `^2.4.6`) : `bcryptjs` 3 fournit ses propres types (`umd/index.d.ts`), et `@types/bcryptjs` 3.0.0 est un stub déprécié (« bcryptjs provides its own type definitions, so you do not need this installed »). Dependabot écarte les versions dépréciées : le paquet ne bougera plus, sans servir à rien.

## Problème constaté

- Sans suivi, les `ignore` posés par D-21 masqueraient Prisma 8, `better-sqlite3` 13 et Node 26 indéfiniment.
- `@types/bcryptjs` est une dépendance inutile.

## Ce qu'il faut faire

Les trois volets sont indépendants et peuvent faire chacun leur PR (une seule tâche à la fois sur un même `package-lock.json`). La tâche reste `todo` tant qu'un volet reste, avec une ligne au Journal par volet fait ou revérifié.

**Volet 1 : retirer `@types/bcryptjs`** (faisable tout de suite)

1. `npm uninstall @types/bcryptjs` dans `backend/` ; le lockfile ne doit perdre que cette entrée.
2. `npx tsc --noEmit`, lint, `npm test`, build : les types viennent de `bcryptjs`.

**Volet 2 : Prisma 8 et better-sqlite3 13** (attendre la 8.0.0 stable)

1. Condition de départ : `prisma`, `@prisma/client` et `@prisma/adapter-better-sqlite3` ont une 8.x stable (`npm view <paquet> dist-tags`, `npm view <paquet> versions`). Sinon : ligne datée au Journal.
2. Lire le guide de migration et les notes de version de Prisma 8. Monter les trois paquets à la même version (épinglée, comme en 7), et `better-sqlite3` à la majeure que demande l'adapter. Vérifier `npm ls better-sqlite3` (une seule version) et `npm ls effect` ; retirer la surcharge `effect` si `@prisma/config` 8 la rend inutile (règle de B-22 et B-24).
3. Contrôles de C-15 : `npm ci`, `tsc`, lint, tests, `npm run db:check`, image backend (étage `prod-deps`, coupes D-30, `prisma --version`), smoke compose, banc de mise à jour sur une base existante.
4. Retirer de `.github/dependabot.yml` les entrées `ignore` de ces quatre paquets (ou les garder avec un nouveau renvoi).

**Volet 3 : passage à la LTS suivante de Node** (décision humaine)

1. **Humain** : décider du passage à Node 26 LTS (il remplace la décision du 2026-10-10). Sans décision : ligne datée au Journal.
2. Passer `.nvmrc`, les `FROM node:` des deux Dockerfiles (tag littéral épinglé sur la mineure, voir le commentaire de l'entrée docker), `engines.node` et `@types/node` (même majeure) dans les deux paquets ; chercher les autres mentions de Node 24 (`AGENTS.md`, `README.md`, `docs/operations.md`, banc de mise à jour). Ajouter à `touches` les fichiers en dehors de la liste.
3. `npm ci`, `tsc`, lint, tests, build dans les deux paquets, images, smoke compose. Un changement de `engines` ou d'image demande une ligne « Notes de version » (règle 9).
4. `.github/dependabot.yml` : garder les `ignore` de `node` (docker) et de `@types/node` (npm), qui suivent la nouvelle majeure, et mettre à jour le commentaire si besoin.

Après chaque modification de `.github/dependabot.yml` : `check-jsonschema --builtin-schema vendor.dependabot .github/dependabot.yml`.

## Critères d'acceptation

- [ ] Volet 1 : `@types/bcryptjs` retiré du backend ; `tsc`, lint, tests et build verts.
- [ ] Volet 2 : Prisma (CLI, client, adapter) sur la même version 8.x stable ; une seule version de `better-sqlite3` ; `npm audit --omit=dev --audit-level=high` à 0 ; image backend et smoke verts.
- [ ] Volet 3 : décision humaine consignée au Journal ; si le passage est fait, Node et `@types/node` sur la même majeure partout, CI, images et smoke verts.
- [ ] `.github/dependabot.yml` à jour et valide.

## Tests à ajouter ou adapter

La suite existante (backend : adapter, transactions sérialisées, migrations) ; des tests seulement si Prisma 8 ou Node 26 changent un comportement utilisé.

## Points d'attention

- `build.mjs --ready` la donne prête dès que ses dépendances sont faites : les conditions des volets 2 et 3, externe et humaine, ne se vérifient qu'au moment de les traiter (même situation que B-22).
- Ne pas passer sur une pré-version.
- `.github/dependabot.yml` n'est lu que sur la branche par défaut (`main`) : un changement d'`ignore` ne prend effet qu'après le merge `develop` → `main` suivant.
- Une majeure de Prisma peut changer le générateur ou `prisma.config.ts` : si la montée dépasse les fichiers de `touches`, découper ou élargir en le notant au Journal.

## Journal

- 2026-11-25 : tâche créée par D-21 (PR #220) pour suivre les majeures que Dependabot ignore. D-46 est réservé à une autre tâche du même lot (D-23), d'où le numéro 47. Élargie à la relecture de la PR #220 (décision du coordinateur) : Node et `@types/node`, puis retrait de `@types/bcryptjs`, en plus de Prisma et `better-sqlite3`.
- 2026-11-27 : volet 1 fait (`@types/bcryptjs` retiré du backend, le lockfile ne perd que cette entrée et la majeure d'`undici-types` qui suit `@types/node`). Volet 3 fait sur décision de l'humain (2026-11-27) : passage à Node 26 LTS, remplaçant la décision du 2026-10-10. `.nvmrc`, `node:26.13-alpine` (épinglé sur la mineure) dans les deux Dockerfiles, `engines.node` `>=26` et `@types/node` `^26.6.11` dans les deux paquets, README, AGENTS.md et décision de `docs/plan/README.md`. Les `ignore` Dependabot de `node` (docker) et de `@types/node` (npm) restent : ils portent désormais sur la majeure 27. Volet 2 revérifié (veille) : `prisma@latest` = 8.0.0-rc.36, la stable reste 7.10.1 (dist-tag `prev`) ; pas de 8.x stable, on ne passe pas sur une pré-version. La tâche reste `todo` pour ce volet.
- 2026-11-27 : Notes de version : l'image tourne désormais sous Node 26 (LTS), sans action requise ; le développement hors Docker demande Node 26 ou plus (`engines`). `breaking: false`.
