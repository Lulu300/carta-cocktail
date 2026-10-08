---
id: A-04
title: "Seed non destructif et secrets obligatoires (JWT_SECRET, ADMIN_PASSWORD)"
phase: A
lane: backend
criticite: critique
effort: S
status: done
owner: mixed
depends_on: []
touches: [backend/prisma/seed.ts, backend/src/bootstrap/ensureAdmin.ts, backend/src/bootstrap/ensureAdmin.test.ts, backend/src/config.ts, backend/src/config.test.ts, docker-compose.yml, docker-compose.prod.yml, .env.example, README.md]
sources: ["03-security.md §1", "03-security.md §2", "07-devops-history.md §2.3", "02-backend-data-perf.md §5"]
branch: fix/A-04-secrets-seed
pr: 36
---

## Décisions validées (2026-10-08)

- **Seed** : l'admin est créé seulement s'il n'existe pas. Réinitialisation uniquement avec `ADMIN_RESET_PASSWORD=true`. Un mot de passe changé depuis l'interface survit aux redémarrages.
- **Secrets** : `JWT_SECRET` et `ADMIN_PASSWORD` sont contrôlés partout, développement compris, et pas seulement quand `NODE_ENV=production`.
- **Déploiement** : l'humain renseigne `JWT_SECRET` et `ADMIN_PASSWORD` dans le `.env` de production avant de déployer.

## Contexte

Le dépôt est public. Une instance lancée sans `.env` accepte des JWT signés avec un secret connu de tous et ouvre l'admin avec `admin123`. Pire : le seed, relancé à chaque démarrage du conteneur, réécrit le mot de passe depuis l'environnement. Un mot de passe changé dans Réglages > Profil redevient donc `admin123` au prochain redémarrage (mise à jour d'image, reboot du NAS). L'admin se croit protégé alors qu'il ne l'est pas.

## Problème constaté

- `backend/src/config.ts:8` : `jwtSecret: process.env.JWT_SECRET || 'default-secret'`. Aucun contrôle de longueur ni de valeur connue.
- `docker-compose.yml:10,12` et `docker-compose.prod.yml:8,10` : `JWT_SECRET=${JWT_SECRET:-change-me-to-a-random-secret}` et `ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123}`.
- `.env.example:3,5` : mêmes valeurs. `README.md:57`, `README.md:101-103` et `README.md:148-150` les présentent comme défauts.
- `backend/prisma/seed.ts:8-20` : si un admin existe, son email et son hash sont **écrasés** par `ADMIN_EMAIL`/`ADMIN_PASSWORD` (repli `admin123`). Le seed tourne à chaque démarrage (`backend/Dockerfile:18`).
- `backend/src/routes/settings.ts:47-89` (`PUT /profile`) change le mot de passe en base ; le seed l'annule au redémarrage suivant.
- `config.adminEmail` et `config.adminPassword` (`config.ts:9-10`) ne sont lus nulle part : le seed lit `process.env` directement. Code mort, avec un défaut dangereux.

## Ce qu'il faut faire

1. **Secret JWT** (`backend/src/config.ts`)
   - Exporter une fonction pure `assertJwtSecret(secret: string | undefined, nodeEnv: string | undefined): string`. Elle lève une erreur si `nodeEnv !== 'test'` et que le secret est absent, fait moins de 32 caractères, ou appartient à `WEAK_SECRETS = ['default-secret', 'change-me-to-a-random-secret', 'your-random-secret', 'test-secret']`.
   - Message : `JWT_SECRET must be set to a random value of at least 32 characters (openssl rand -hex 32)`.
   - L'appeler pour construire `config.jwtSecret`. Supprimer le repli `'default-secret'`, `adminEmail` et `adminPassword`.
2. **Seed non destructif** : extraire la logique admin dans `backend/src/bootstrap/ensureAdmin.ts` (dans `src/`, donc compilé, typé et mesuré par la couverture).
   ```ts
   export async function ensureAdmin(
     prisma: PrismaClient,
     env: NodeJS.ProcessEnv = process.env,
   ): Promise<'created' | 'reset' | 'unchanged'>
   ```
   - Aucun utilisateur : email = `ADMIN_EMAIL` (défaut `admin@carta.local`) ; `ADMIN_PASSWORD` obligatoire, au moins 12 caractères, différent de `admin123` (contrôle levé si `NODE_ENV=test`). Sinon, erreur explicite. Hash bcrypt de coût 12.
   - Utilisateur existant et `ADMIN_RESET_PASSWORD !== 'true'` : ne rien modifier, renvoyer `'unchanged'`.
   - `ADMIN_RESET_PASSWORD=true` : réécrire email et hash avec les mêmes règles, journaliser `Admin credentials reset from environment`.
   - `backend/prisma/seed.ts` appelle `ensureAdmin(prisma)` à la place des l.7-20. Le reste du seed ne change pas.
3. **Compose** (les deux fichiers) :
   - `JWT_SECRET=${JWT_SECRET:?JWT_SECRET must be set (openssl rand -hex 32)}` ;
   - `ADMIN_PASSWORD=${ADMIN_PASSWORD:-}` : plus de valeur par défaut, requis seulement au premier démarrage (le seed échoue avec un message clair) ;
   - `ADMIN_RESET_PASSWORD=${ADMIN_RESET_PASSWORD:-false}`.
4. **`.env.example`** : `JWT_SECRET=` et `ADMIN_PASSWORD=` vides, avec en commentaire la commande `openssl rand -hex 32` et la règle des 12 caractères ; ligne commentée `# ADMIN_RESET_PASSWORD=true`.
5. **`README.md`** :
   - quick start : générer le secret et choisir un mot de passe avant `npm run db:seed` ;
   - remplacer « Default admin credentials » (l.57) par « identifiants définis dans `.env` » ;
   - section Docker prod : variables obligatoires ; avertissement « changez `JWT_SECRET` et `ADMIN_PASSWORD` avant toute exposition sur Internet » ;
   - tableau des variables : plus de défaut pour `JWT_SECRET` et `ADMIN_PASSWORD`, nouvelle ligne `ADMIN_RESET_PASSWORD` ;
   - procédure de récupération : `ADMIN_RESET_PASSWORD=true`, redémarrer, retirer le flag.

Hors périmètre : migrations Prisma (C-01) ; limitation des essais de connexion, `tokenVersion`, mot de passe actuel exigé pour changer l'email (C-11) ; port 3001 (D-03) ; guide d'exploitation et `AGENTS.md` (D-09).

## Critères d'acceptation

- [x] Hors `NODE_ENV=test`, le backend refuse de démarrer sans `JWT_SECRET`, avec un secret de moins de 32 caractères ou une valeur connue, et le message donne la commande de génération.
- [x] `docker compose -f docker-compose.prod.yml config` échoue si `JWT_SECRET` n'est pas défini.
- [x] Premier démarrage sans `ADMIN_PASSWORD` valide : erreur claire, aucun admin créé.
- [x] Mot de passe changé dans Réglages > Profil, puis redémarrage du conteneur : le nouveau mot de passe fonctionne toujours.
- [x] `ADMIN_RESET_PASSWORD=true` réinitialise email et mot de passe depuis l'environnement.
- [x] Plus aucune valeur par défaut `admin123`, `default-secret` ou `change-me-to-a-random-secret` dans `config.ts`, `seed.ts`, les compose et `.env.example`.
- [x] README à jour.

## Tests à ajouter ou adapter

- `backend/src/config.test.ts` : `assertJwtSecret` lève pour `undefined`, `''`, une chaîne de 31 caractères, `'change-me-to-a-random-secret'` et `'default-secret'` (avec `nodeEnv = 'production'` puis `undefined`) ; ne lève pas pour 64 caractères hexadécimaux ; ne lève jamais avec `nodeEnv = 'test'`.
- `backend/src/bootstrap/ensureAdmin.test.ts` (base de test, `cleanDatabase()` sans `seedRequiredData()`) :
  - aucun admin et mot de passe valide : `'created'`, `bcrypt.compare` réussit ;
  - aucun admin, `ADMIN_PASSWORD` absent ou `'admin123'`, `NODE_ENV: 'production'` passé dans `env` : rejet, zéro utilisateur ;
  - admin existant, autre `ADMIN_PASSWORD` : `'unchanged'`, hash identique ;
  - admin existant et `ADMIN_RESET_PASSWORD: 'true'` : `'reset'`, le nouveau mot de passe est valide.
- Les tests existants doivent passer sans changement (`backend/src/test/setup.ts` fixe `NODE_ENV=test` et `JWT_SECRET=test-secret`).

## Points d'attention

- **Changement cassant pour les instances existantes.** Un serveur qui tourne avec le compose actuel sans `.env` ne démarrera plus après la mise à jour. C'est voulu. Les notes de version doivent donner la marche à suivre : créer `.env` avec `JWT_SECRET` (et `ADMIN_PASSWORD` pour une installation neuve) avant le `pull`.
- Changer `JWT_SECRET` invalide les sessions en cours : l'admin devra se reconnecter. Aucun effet sur les données.
- Le commit `98ac1f5` avait rendu l'environnement prioritaire exprès (identifiants « réparés » au redémarrage). Ce comportement passe derrière `ADMIN_RESET_PASSWORD=true`. **Validé le 2026-10-08.**
- Dev local : `cp ../.env.example .env` ne suffit plus, il faut remplir `JWT_SECRET` et `ADMIN_PASSWORD`. Choix assumé (sécurisé par défaut). Validé le 2026-10-08 : contrôle partout, pas seulement en production.
- `seed.ts` importera un fichier de `src/` : ça fonctionne avec `tsx` (dev et image actuelle). D-01 devra compiler le seed.
- Conflits : A-01 modifie aussi `config.ts` et les compose, B-08 modifie `.env.example`. Enchaîner ces tâches.
- `AGENTS.md:116` cite encore `admin123` : corrigé dans D-09.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
- 2026-10-08 : fait dans la PR #36 (`fix/A-04-secrets-seed`). `assertJwtSecret` dans `config.ts`, `ensureAdmin` dans `src/bootstrap/`, compose, `.env.example` et README à jour. `seed.ts` charge lui-même `backend/.env` (il tourne hors de l'application ; Prisma 7 ne le fera plus implicitement). Aucun fichier hors `touches` : la CI et `src/test/setup.ts` fixent déjà `NODE_ENV=test`. Vérifié à la main : `docker compose config` sans `JWT_SECRET`, démarrage refusé, seed sur base jetable et image Docker (création, conservation, `ADMIN_RESET_PASSWORD=true`). Couverture des lignes modifiées : 100 %. Remarque : sur le partage NAS, la suite backend échoue de façon aléatoire (SQLite sur disque réseau) ; elle passe entièrement sur disque local.
