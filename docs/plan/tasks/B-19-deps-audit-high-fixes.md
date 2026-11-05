---
id: B-19
title: "Avis high en production : body-parser, multer et zod"
phase: B
lane: deps
criticite: haute
effort: S
status: done
owner: agent
depends_on: [B-11]
touches: [backend/package.json, backend/package-lock.json, docs/plan/tasks/B-20-deps-audit-moderate-cleanup.md]
sources: []
branch: chore/B-19-deps-audit-high-fixes
pr: "#146"
---

## Contexte

Depuis B-11, l'étape « Audit production dependencies » du job Backend de `.github/workflows/ci.yml` lance `npm audit --omit=dev --audit-level=high` dans `backend/`. Le job Backend est un check requis : quand il échoue, plus aucune PR ne peut fusionner.

## Problème constaté

Constat du coordinateur (2026-11-05) : le job Backend échoue sur `develop` et sur toutes les PR, à l'étape d'audit. Trois avis `high` touchent des dépendances de production, tous corrigés en amont :

- `body-parser` 2.0.0 à 2.3.0 (GHSA-27r3-jxmh-p828, déni de service par des octets en trop après un corps compressé), transitif via `express` 5.2.1 (`^2.2.1`) ; corrigé en 2.4.0 ;
- `multer` 2.0.0 à 2.4.0 (GHSA-q7qp-rjg7-q26m, déni de service par un `fileFilter` asynchrone encore en attente après la fermeture de la requête), dépendance directe ; corrigé en 2.5.0 ;
- `zod` < 4.6.6 (GHSA-mrhx-c7xc-m3w5, épuisement mémoire sur une collection bornée trop grande), dépendance directe ; corrigé en 4.6.6.

Criticité haute : `express.json()` lit le corps de toutes les requêtes avant l'authentification, donc l'avis `body-parser` est exploitable sans compte (`POST /api/auth/login` par exemple). Le blocage de toutes les fusions justifie aussi de passer cette PR en premier dans son lot.

## Ce qu'il faut faire

1. Monter chaque paquet à la plus petite version stable corrigée : bornes de `package.json` relevées pour `multer` et `zod`, lockfile seul pour `body-parser` (la borne d'`express` l'accepte déjà). Pas de surcharge (`overrides`) si une montée normale suffit.
2. Ne toucher ni à Prisma ni aux surcharges `deepmerge-ts` / `mysql2` (B-16).
3. Lire les notes de version et vérifier la validation zod, l'upload multer et les limites de corps.
4. `npm audit --omit=dev --audit-level=high` à 0 `high`, sans baisser le seuil de CI.

## Critères d'acceptation

- [x] `npm audit --omit=dev --audit-level=high` backend sort en 0 (0 `high`), seuil de `ci.yml` inchangé.
- [x] `multer` ≥ 2.5.0 et `zod` ≥ 4.6.6 dans `backend/package.json` ; `body-parser` 2.4.0 dans le lockfile ; aucune pré-version, aucune nouvelle surcharge.
- [x] `npm ci`, `tsc`, lint, build, `db:check` et `npm test` (couverture comprise) passent.
- [x] Les changements de comportement des paquets montés sont décrits dans la PR.
- [x] Les jobs « Docker build (backend) » et Smoke passent en CI.

## Tests à ajouter ou adapter

Aucun : aucune ligne de code ne change, la suite existante couvre la validation zod, les uploads multer et les limites de corps.

## Points d'attention

- Une seule tâche à la fois sur `backend/package-lock.json` : B-16 passe après celle-ci.
- Le `Dockerfile` backend coupe des arêtes du graphe de dépendances de la CLI Prisma (D-30) : la CI le vérifie, aucune dépendance de la CLI ne bouge ici.

## Journal

- 2026-11-05 : tâche créée et faite dans la PR #146. `body-parser` 2.3.0 → 2.4.0 (`npm update body-parser`, qui fait passer `qs` 6.16.0 → 6.17.1 : `body-parser` 2.4.0 demande `^6.16.1`), `multer` 2.4.0 → 2.5.0, `zod` 4.6.5 → 4.6.6 (4.6.7 existe, sa release ne contient que le commit de version). Aucune autre entrée du lockfile ne bouge. `npm audit --omit=dev` : de 3 `high` et 6 `moderate` à 0 `high` et 5 `moderate` ; audit complet : 14 `moderate`, 0 `high`. Notes de version lues. zod 4.6.6 (colinhacks/zod#6652) contrôle `.max()` d'un tableau avant d'en lire les éléments : une confirmation d'import (`BottleImportPayload`) de plus de 2 000 lignes reçoit un 400 avec un seul `too_big` sur `body.payload.bottles`, au lieu de ce `too_big` suivi des erreurs de chaque ligne et du résultat du `refine` (vérifié en local). L'interface n'envoie jamais plus de lignes que l'aperçu n'en accepte. multer 2.5.0 accepte un champ texte d'exactement `fieldSize` octets ; nous ne fixons pas `fieldSize`, et nos limites `fileSize`/`files` ainsi que le `fileFilter` des images ne changent pas. body-parser 2.4.0 décode désormais les corps `Content-Encoding: zstd` (Node 24) au lieu de répondre 415 ; la limite (100 ko, 5 Mo pour la confirmation d'import) s'applique toujours au corps décodé. Aucun changement visible pour l'utilisateur, pas d'action requise. `npm ci`, `tsc`, lint (0 erreur, 25 avertissements, comme sur `develop`), build, `db:check` et `npm test` (1180 tests, couverture 99,23 / 95,03 / 99,81 / 99,54 %) passent ; en CI, Backend (audit compris), Frontend, « Docker build (backend) », « Docker build (frontend) » et Smoke sont verts. Les `moderate` restants (`fast-uri`, `ip-address`, `minimatch`) existaient déjà : B-20 créée (ajoutée à `touches`).
