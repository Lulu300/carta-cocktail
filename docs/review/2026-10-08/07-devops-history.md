# Revue 7 — Vue d'ensemble, historique, DevOps, documentation, dépendances

Projet : Carta Cocktail (`/Users/lulu/NAS-Lulu/Lulu/Workspace/Git_Projects/carta_cocktail`), branche `main` @ `8c8e58c` (v1.4.0).
Revue en lecture seule, menée le 2026-10-08. Aucun fichier du repo n'a été modifié et aucun test n'a été lancé. Seules commandes « réseau » : `npm outdated`, `npm audit --package-lock-only`, `gh api` / `gh pr list` / `gh run list` (lecture).

---

## 0. Synthèse

Le projet a été construit vite et proprement sur le plan fonctionnel. Depuis fin février, le workflow PR + CI + release est appliqué avec régularité. Les risques se concentrent sur l'exploitation en production Docker :

1. **Les images uploadées ne sont pas écrites dans le volume Docker** (`/uploads` au lieu de `/app/uploads`) et sont perdues à chaque recréation du conteneur.
2. **`prisma db push --accept-data-loss` s'exécute à chaque démarrage**, sans migrations versionnées (le dossier `migrations/` est même gitignoré). Avec `:latest` en prod, une mise à jour peut supprimer des colonnes sans prévenir.
3. **Secrets par défaut publics** (JWT, `admin123`), et le seed **réécrit le mot de passe admin à chaque redémarrage**, ce qui annule un changement fait depuis l'UI.
4. **nginx limite les requêtes à 1 Mo** (aucun `client_max_body_size`). Les uploads d'images (5 Mo), les imports ZIP (10 Mo) et la restauration de backup (500 Mo) échouent derrière nginx.
5. **Le contrôle « delta coverage 80 % » ne contrôle quasiment rien**. Démonstration : `backup.ts` est couvert à 5,5 % et le script le note 98,5 %.
6. **Dépendances** : 11 vulnérabilités en prod côté backend (dont 2 critiques), 2 high côté frontend, pas de Dependabot, aucune mise à jour depuis février. Les Dockerfiles sont en **Node 20, EOL depuis le 30/04/2026**, alors que la CI teste sur Node 24.

---

## 1. Historique Git

### 1.1 Chiffres

| Indicateur | Valeur |
|---|---|
| Commits totaux (main) | 91 : 66 commits « réels » + 25 merges |
| Période | 2026-02-06 → 2026-08-29 |
| Auteur | 1 personne, 3 identités : `Ludwig SIMON <lulu@MacBook-Pro-de-Ludwig.local>` (46), `Ludwig SIMON <ludwig@simonl.fr>` (24), `Lulu300 <ludwig@simonl.fr>` (21) |
| Commits co-écrits par Claude | 65 (trailer `Co-Authored-By: Claude`) |
| PR | 24, toutes mergées. 15 branches feature/fix, toutes mergées et jamais supprimées (`delete_branch_on_merge: false`) |
| Tags | v1.0.1, v1.0.2, v1.0.3, v1.1.0, v1.2.0, v1.2.1, v1.3.0, v1.4.0 (pas de v1.0.0) |
| Protection de branche | **Aucune** sur `main` (`gh api .../branches/main/protection` → 404). Repo **public** |

### 1.2 Chronologie

| Période | Commits | Ce qui a été construit |
|---|---|---|
| 6–9 fév. | 43, **directement sur main** | Squelette Express/Prisma/React (`ee14d7c`, 11 250 lignes d'un coup), homepage publique, tags, système de disponibilité des ingrédients, sélecteur de langue, conversion d'unités (oz puis table en base), menus bouteilles apéritifs/digestifs avec synchro auto, sections de menu, recherche, page Settings, import/export de cocktails (JSON puis ZIP + wizard), traductions des entités (colonnes `nameTranslations`), CategoryType dynamiques, favicon/titre dynamiques |
| 22 fév. | 5 directs sur main, puis PR #1 à #3 | Emplacement des bouteilles, **CI/CD GitHub Actions**, README + LICENSE MIT, corrections ESLint/TS pour la CI. Début du flux PR : historique des bouteilles vides, filtres admin, backup/restore complet |
| 23 fév. | PR #4 à #10 | **Suite de tests** (361 tests, seuils 60 %, script delta-coverage), couverture frontend à 84 % en branches, fix des tags Docker en minuscules, `BACKEND_HOST` configurable pour nginx, fix des identifiants admin au redémarrage. Tags v1.0.1 et v1.0.2 |
| 30 mars – 1er avril | PR #11 à #16 | Fix des erreurs des pages publiques (401 sur les unités, drapeaux sous Brave), seuil de pénurie, montée de la CI en Node 24 / actions v5, création de bouteilles en lot et regroupement. v1.0.3, v1.1.0, v1.2.0 |
| 19 avril | PR #17–18 | Fix des vues publiques cocktail et de la gestion des uploads (nginx `^~ /uploads/`). v1.2.1 |
| 14 mai | PR #19 à #22 | Export (JSON/CSV) et import (JSON/CSV/ZIP) des bouteilles, wizard frontend. v1.3.0 |
| 29 août | PR #23–24 | Liste des menus publics et recherche de recettes. v1.4.0 |

**Rythme** : le travail se fait par sessions intenses d'un ou deux jours (19 commits le 8 février), séparées de semaines ou de mois d'inactivité. Rien n'a bougé depuis le 29 août, il y a 6 semaines.

### 1.3 Qualité des commits et des PR

**Ce qui va bien**
- Messages de commit clairs, à l'impératif, qui décrivent l'intention ; corps de message détaillés (ex. `98ac1f5` explique le pourquoi).
- Descriptions de PR conséquentes (284 à 3 584 caractères), titres de release explicites (« Release v1.3.0 — bottles import/export »).
- Depuis le 22 février, chaque PR passe la CI au vert (`gh run list` : toutes en `success`).
- Le schéma de tags SemVer est cohérent avec le contenu (patch pour les fix, minor pour les features).

**Ce qui ne va pas**
- **48 commits poussés directement sur `main`** avant l'adoption du workflow (6–22 février). C'est compréhensible en phase d'amorçage, mais ces commits n'ont jamais été validés par une CI.
- **Écarts au workflow feature → develop → main** décrit dans `AGENTS.md:28-37` :
  - PR #4 `feature/test-suite` → **`main`** directement, sans passer par develop. Il a fallu ensuite un commit de résolution de conflit sur `backend/package-lock.json` (`750fe3d`).
  - `6f35b38` (fix des tags Docker) et `9a69119` (couverture + AGENTS.md) ont été commités directement sur `develop`, sans branche dédiée.
- **Commits trop gros ou qui mélangent les sujets** : `e2557ba` (51 fichiers, +7 729 lignes), `e98d815` (« UI improvements, shortage threshold, **and CI upgrade** » : trois sujets dans un commit), `ee14d7c` (11 250 lignes).
- **Convention de message abandonnée** : Conventional Commits (`feat:`, `fix:`) sur les 19 premiers commits, puis style libre (« Add … », « Fix … »). Comme la release génère son changelog à partir des messages, l'absence de convention empêche de classer les entrées.
- **Identité Git non configurée** sur une machine : 46 commits sont signés `lulu@MacBook-Pro-de-Ludwig.local`, une adresse non rattachée au compte GitHub.
- Pas de protection de branche sur un repo public : rien n'empêche un push direct ou un merge avec la CI en échec.
- 15 branches mergées toujours présentes en local et sur `origin`.

**Propositions**
- (S, P2) Activer la protection de `main` et `develop` : PR obligatoire, checks `Backend` et `Frontend` requis, pas de force-push. Activer `delete_branch_on_merge`.
- (S, P3) Ajouter un `.mailmap` qui unifie les trois identités, et `git config --global user.email ludwig@simonl.fr` sur le Mac.
- (S, P3) Reprendre Conventional Commits, éventuellement avec `commitlint` en CI. Cela permettrait de générer un changelog classé (cf. §3.4).
- (S, P3) Nettoyer les branches mergées (`git branch --merged main | grep -v main | xargs git branch -d`, puis `git push origin --delete …`).

### 1.4 État actuel du working tree

`git status` montre des fichiers non suivis qui **devraient être ignorés** :

| Chemin | Nature | Ignoré ? | Action |
|---|---|---|---|
| `.omc/`, `backend/.omc/`, `frontend/.omc/` | État local du plugin oh-my-claudecode (sessions, `project-memory.json`) | **Non** | Ajouter `.omc/` au `.gitignore` racine (le motif sans `/` initial couvre aussi les sous-dossiers) |
| `backend/coverage/`, `frontend/coverage/` | Rapports Vitest | **Non** | Ajouter `coverage/` au `.gitignore` racine |
| `backend/prisma/prisma/test.db` | Base de test créée au mauvais endroit (cf. §2.9) | Oui (`*.db`) | Corriger le chemin |
| `backend/prisma/dev.db` (0 octet) | Résidu du 7 février | Oui | Supprimer |
| `uploads/*.png` (22 fichiers de 13 octets) | **Écrits par les tests** (`"fake-png-data"`, cf. §2.9) | Oui | Isoler le répertoire d'upload pendant les tests |
| `.DS_Store` dans 6 dossiers | macOS | Oui | RAS |

Autres observations sur les `.gitignore` :
- `.gitignore:32` ignore `backend/prisma/migrations/`. **C'est une décision dangereuse**, voir §2.2.
- `backend/.gitignore:5` contient `/src/generated/prisma`, alors que le générateur est `prisma-client-js` avec sa sortie par défaut dans `node_modules` (`schema.prisma:1-3`). Entrée obsolète.
- `.gitignore:21-25` ignore `.claude/` alors que les `AGENTS.md` sont versionnés : c'est cohérent.

---

## 2. Docker et déploiement

### 2.1 [P0, critique] Les uploads sont écrits hors du volume dans le conteneur backend

- `backend/src/config.ts:11` : `uploadDir: path.resolve(__dirname, '../../uploads')`.
- En dev (`tsx`, `__dirname = backend/src`), on obtient `<repo>/uploads`, ce qui est correct.
- Dans l'image, le code compilé est dans `/app/dist/config.js` (`tsconfig.json:6-7`, `rootDir ./src`, `outDir ./dist`). On a donc `__dirname = /app/dist`, et `../../uploads` donne **`/uploads`**.
- Or le volume est monté sur **`/app/uploads`** (`docker-compose.yml:16`, `docker-compose.prod.yml:14`), et le Dockerfile crée `/app/uploads` (`backend/Dockerfile:14`).
- Conséquence : multer (`routes/cocktails.ts:20-25`), le static (`app.ts:35`) et le backup (`routes/backup.ts:27,108`) travaillent tous dans `/uploads`, qui est dans la couche éphémère du conteneur. **Chaque `docker compose pull && up -d` (donc chaque mise à jour) perd toutes les photos de cocktails.** La base, elle, est bien persistée (`/app/data`), ce qui laisse des `imagePath` pointant vers des fichiers absents.
- Ce chemin n'a pas changé depuis le commit initial (`git log -- backend/src/config.ts` → `ee14d7c` uniquement). Le fix `1bcf20b` « uploads handling » a porté sur nginx et le frontend, pas sur ce point.
- Vérification à faire en production : `docker exec <backend> ls /uploads /app/uploads`.
- **Proposition (S)** : `uploadDir: process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'uploads')`, plus `UPLOAD_DIR=/app/uploads` dans les deux compose. Avant de déployer le fix, récupérer les fichiers existants avec `docker cp <backend>:/uploads/. ./uploads-rescue/`.

### 2.2 [P0, critique] `prisma db push --accept-data-loss` à chaque démarrage, sans migrations versionnées

- `backend/Dockerfile:18` : `npx prisma db push --accept-data-loss && npm run db:seed && npm start`.
- `.gitignore:32` exclut `backend/prisma/migrations/` ; aucun dossier de migrations n'existe.
- `package.json:13` déclare `db:migrate: prisma migrate dev`, mais ce script n'est jamais utilisé.
- `docker-compose.prod.yml:3,18` pointe sur `:latest`.
- Risque : `db push` calcule un diff entre le schéma et la base, et `--accept-data-loss` l'applique **sans confirmation**. Renommer un champ ou un modèle, passer une colonne de nullable à obligatoire, changer un type ou une clé unique : Prisma fait un DROP puis un ADD (ou recrée la table SQLite) et les données sont perdues. Comme `latest` bouge à chaque tag, un simple `pull` suffit à déclencher cette migration non revue.
- Au passage, `db push` relance `prisma generate` à chaque démarrage (absence de `--skip-generate`) et réécrit `node_modules` dans le conteneur.
- **Proposition (M)** :
  1. Retirer la ligne `.gitignore:32`.
  2. Créer une migration de base : `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`.
  3. Sur les bases existantes, marquer cette migration comme appliquée : `prisma migrate resolve --applied 0_init`. Cela peut se faire une seule fois via un script d'entrée qui détecte l'absence de `_prisma_migrations`.
  4. Remplacer `db push` par `prisma migrate deploy` dans le CMD.
  5. **Sauvegarder le fichier SQLite avant toute migration** dans l'entrypoint : `cp /app/data/carta_cocktail.db /app/data/backups/pre-migrate-$(date +%F-%H%M%S).db`, avec une rotation.
  6. Documenter l'épinglage d'une version (`:1.4.0`) comme mode par défaut en prod.

### 2.3 [P0, haute] Secrets par défaut, et seed qui écrase le mot de passe admin

- `docker-compose.yml:10-12` et `docker-compose.prod.yml:8-10` : `JWT_SECRET=${JWT_SECRET:-change-me-to-a-random-secret}`, `ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123}`. Ces valeurs sont **publiques** (repo public). Une instance lancée sans `.env` accepte des JWT forgés par n'importe qui et ouvre l'admin avec `admin123`.
- `backend/src/config.ts:8` a un autre fallback, `'default-secret'`, différent de celui du README (`README.md:148`).
- `backend/prisma/seed.ts:10-15` réécrit l'email et le hash admin **à chaque démarrage** (introduit volontairement par `98ac1f5`). Mais `routes/settings.ts:47-75` (`PUT /profile`) permet de changer le mot de passe depuis l'UI. Résultat : l'admin change son mot de passe dans l'UI, le conteneur redémarre, et le mot de passe redevient celui de l'environnement, c'est-à-dire `admin123` si rien n'est configuré. L'utilisateur croit être protégé alors qu'il ne l'est pas.
- **Propositions (S)** :
  - Au démarrage, refuser de lancer le serveur si `NODE_ENV=production` et que `JWT_SECRET` est absent, fait moins de 32 caractères ou vaut une valeur connue.
  - Dans le compose prod, utiliser `${JWT_SECRET:?JWT_SECRET must be set}`, qui fait échouer `docker compose up` quand la variable manque.
  - Seed : créer l'admin seulement s'il n'existe pas, et ne forcer la réinitialisation que si `ADMIN_RESET_PASSWORD=true`. Documenter ce flag comme procédure de récupération.

### 2.4 [P0, haute] nginx limite le corps des requêtes à 1 Mo

- `frontend/nginx.conf.template` ne contient **aucun** `client_max_body_size`, donc la valeur par défaut de nginx s'applique : 1 Mo.
- Limites côté backend : images 5 Mo (`routes/cocktails.ts:41`), imports bouteilles 10 Mo (`routes/bottles.ts:14`), restauration de backup 500 Mo (`routes/backup.ts:14`).
- En Docker, toute photo de plus de 1 Mo (cas courant pour une photo de smartphone) et toute restauration de backup réaliste reçoivent un **413 de nginx** avant d'atteindre Express. Les tests ne le détectent pas puisqu'ils attaquent Express directement.
- **Proposition (S)** : dans le bloc `location /api/`, ajouter `client_max_body_size 20m;`, et un bloc dédié `location /api/backup/import { client_max_body_size 512m; proxy_request_buffering off; proxy_read_timeout 300s; … }`.

### 2.5 [P1] Pas de `.dockerignore`

- Ni à la racine, ni dans `backend/`, ni dans `frontend/`.
- `backend/Dockerfile:11` et `frontend/Dockerfile:8` font `COPY . .`. Lors d'un build local (`docker compose up --build`, documenté dans `README.md:79-83`), le contexte inclut :
  - `node_modules/` de l'hôte (macOS), qui **écrase** le `node_modules` Linux installé par `npm ci`, y compris `node_modules/.prisma/client` généré pour darwin et les binaires natifs esbuild/rollup du frontend. Selon les cas, on obtient un échec du build Vite ou un Prisma engine introuvable au runtime.
  - `backend/.env` (secrets locaux), copié dans une couche de l'image.
  - `prisma/*.db` (base locale de 110 Ko, `test.db`), `coverage/`, `dist/`, `.omc/`.
- La release CI part d'un checkout propre et n'est donc pas touchée ; le problème concerne surtout le build local.
- **Proposition (S)** : créer `backend/.dockerignore` et `frontend/.dockerignore` avec `node_modules`, `dist`, `coverage`, `.env*`, `*.db`, `.omc`, `.DS_Store`, `**/*.test.*` et `src/test` (ces deux derniers pour le backend).

### 2.6 [P1] Image backend : un seul stage, devDependencies, root, outils de build au runtime

- `backend/Dockerfile:1-18` : un seul stage `node:20-alpine` et `npm ci` complet. L'image embarque TypeScript, Vitest, la CLI Prisma et tsx ; `backend/node_modules` pèse 342 Mo en local. L'image est probablement autour de 450–550 Mo (non mesuré, pas de build effectué).
- Le runtime **dépend** de devDependencies : la CLI `prisma` (`db push`), `tsx` (le seed est lancé via `tsx prisma/seed.ts`, `package.json:14`) et **`@prisma/client`, rangé en devDependencies** (`package.json:36`) alors que 16 fichiers de `src/` l'importent. Un `npm ci --omit=dev` casserait l'application, et `npm audit --omit=dev` ignore ce paquet.
- Pas de `USER` : le processus tourne en root.
- Pas de `HEALTHCHECK`, pas de `NODE_ENV=production`, et `morgan('dev')` est actif en prod (`app.ts:30`).
- **Proposition (M)** : Dockerfile multi-stage :
  - Stage `deps` : `npm ci`.
  - Stage `build` : `prisma generate`, `tsc`, et compilation du seed en JS (ou passage du seed dans `src/`).
  - Stage `runtime` : `node:22-alpine` ou `node:24-alpine` (LTS), `npm ci --omit=dev` (après avoir déplacé `@prisma/client` et `prisma` en `dependencies`, ou en copiant seulement `node_modules/.prisma` et `node_modules/@prisma`), `ENV NODE_ENV=production`, `USER node`, `chown` de `/app/data` et `/app/uploads`, puis un entrypoint `migrate deploy && node dist/seed.js && node dist/index.js`.
  - Utiliser `tini`, ou `exec` dans l'entrypoint, pour la propagation des signaux. Avec le `sh -c` actuel, SIGTERM n'atteint pas Node et l'arrêt prend 10 s avant un kill.

### 2.7 [P1] Healthchecks et dépendances entre services

- Pas d'endpoint `/health` (`app.ts:37-54`), pas de `healthcheck:` dans les compose, et `depends_on` sans `condition: service_healthy` (`docker-compose.yml:27-28`).
- nginx résout `${BACKEND_HOST}` au démarrage (`nginx.conf.template:9,18`). Si le backend n'est pas encore résolvable, nginx s'arrête sur « host not found in upstream » ; `restart: unless-stopped` masque le problème au prix d'un crash-loop.
- **Proposition (S)** :
  - Ajouter `GET /api/health`, qui renvoie 200 après un `SELECT 1` Prisma.
  - Ajouter dans le compose `healthcheck: test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/health"]` et, côté frontend, `depends_on: { carta-cocktail-backend: { condition: service_healthy } }`.
  - Optionnel : `resolver 127.0.0.11 valid=30s;` avec une variable dans `proxy_pass`, pour une résolution dynamique.

### 2.8 [P2] Compose prod et frontend

- `docker-compose.prod.yml:4-5` publie le port **3001** de l'API sur l'hôte. Comme nginx proxifie déjà `/api` et `/uploads`, ce port contourne inutilement le reverse proxy. **Proposition (S)** : le retirer, ou le remplacer par `expose`.
- `:latest` en prod : cf. §2.2. Le README (`README.md:106-111`) mentionne l'épinglage comme option ; il faudrait en faire le mode par défaut.
- `frontend/Dockerfile:11` : `nginx:alpine` non épinglé, master en root. Envisager `nginxinc/nginx-unprivileged:1.27-alpine` (port 8080). Le stage build utilise `node:20-alpine`, en EOL.
- `frontend/Dockerfile:16` : la valeur par défaut `ENV BACKEND_HOST=backend` ne correspond pas au nom du service `carta-cocktail-backend`. C'est sans effet avec les compose fournis (ils le surchargent), mais trompeur.
- `frontend/nginx.conf` n'est plus utilisé : le Dockerfile copie le `.template`. C'est un doublon avec `backend` codé en dur, alors que `frontend/AGENTS.md:106` le présente encore comme la config de production. À supprimer.
- `nginx.conf.template:31-34` : `expires 1y` et `immutable` s'appliquent aussi aux fichiers non hashés (favicon, PNG de `public/`). Il faudrait restreindre aux fichiers sous `/assets/`. Il manque aussi `gzip on` et les en-têtes de sécurité pour le HTML statique (helmet ne protège que les réponses Express).

### 2.9 [P2] Les tests polluent l'environnement de dev

- `backend/src/routes/cocktails.test.ts:542` envoie `fake-png-data` (13 octets). Le test utilise `config.uploadDir`, c'est-à-dire **le vrai dossier `<repo>/uploads`** : 22 fichiers de 13 octets s'y sont accumulés, à chaque exécution des tests. Rien ne les nettoie, et ils finissent dans les backups de dev.
- `backend/src/test/helpers.ts:10` déclare `TEST_DB_PATH = backend/prisma/test.db`. Mais `DATABASE_URL=file:./prisma/test.db` (`test/setup.ts:2`, `ci.yml:42`) est résolu par Prisma **relativement au dossier du schéma**, ce qui donne `backend/prisma/prisma/test.db`, le fichier effectivement présent (110 Ko, 8 octobre). Le nettoyage (`helpers.ts:23,50`) supprime donc un fichier qui n'existe pas. `README.md:77` (« created and destroyed automatically ») est faux. Ça fonctionne quand même grâce à `--force-reset`.
- **Proposition (S)** : `DATABASE_URL=file:./test.db`, qui se résout bien en `prisma/test.db`, et `UPLOAD_DIR` pointant vers un dossier temporaire (`os.tmpdir()`) défini dans `test/setup.ts`. Cela suppose le fix du §2.1.

### 2.10 [P2] Sauvegarde SQLite

**Ce qui va bien** : il existe un backup/restore intégré (ZIP contenant la base et les uploads, `routes/backup.ts`), et la base est sur un volume nommé.

**Ce qui ne va pas**
- `routes/backup.ts:18-21` lit `DATABASE_URL` tel quel et le traite comme un chemin relatif au **cwd**. En dev avec `.env.example` (`file:./carta_cocktail.db`), Prisma utilise `backend/prisma/carta_cocktail.db`, mais le backup cherche `backend/carta_cocktail.db` : **l'export échoue en dev** avec « Database file not found ». En Docker le chemin est absolu, donc pas de problème.
- Le fichier SQLite est copié à chaud (`backup.ts:58`) sans `VACUUM INTO` ni API de backup, ce qui expose à un risque d'incohérence si une écriture a lieu pendant la copie. La restauration (`backup.ts:113`) écrase le fichier alors que le PrismaClient a des connexions ouvertes, et elle ne garde aucune copie de sécurité de l'état précédent.
- `backup.ts:53` code `appVersion: '1.0.0'` en dur. La restauration d'une base au schéma ancien n'est pas migrée avant le prochain redémarrage, où elle passe par `db push --accept-data-loss`.
- La couverture de `backup.ts` est de **5,5 %** (4 instructions sur 77), alors que c'est la route la plus destructrice de l'application.
- Aucun backup automatique planifié n'est documenté.
- **Propositions** :
  - (S) Résoudre le chemin de la base comme Prisma le fait, ou exposer `DB_PATH` explicitement.
  - (M) `VACUUM INTO '/tmp/snap.db'` via `prisma.$executeRawUnsafe` avant l'archivage, et une copie `pre-restore-<date>.db` avant d'écraser la base.
  - (S) Documenter un cron hôte ou un sidecar (`sqlite3 /data/carta_cocktail.db ".backup ..."`, ou un `docker run --rm -v db-data:/data alpine tar …`).

---

## 3. CI/CD

### 3.1 Ce qui va bien
- Deux jobs parallèles (backend et frontend), cache npm par lockfile (`ci.yml:22-26,72-76`), `npm ci`, `fetch-depth: 0` pour le diff.
- Backend : `prisma generate`, `tsc`, build, tests avec couverture et seuils. Frontend : tsc, lint, build, tests.
- Artefacts de couverture conservés 7 jours.
- Release : Buildx avec cache GHA, nom de repo en minuscules, double tag version + `latest`, GitHub Release générée.

### 3.2 [P0, haute] Le delta-coverage ne contrôle presque rien

Script : `.github/scripts/delta-coverage.mjs`.

1. **Une instruction englobante couvre toutes ses lignes internes** (`:127-134`) : une ligne est comptée couverte dès qu'une instruction couvrant sa plage a été exécutée. Or `router.get('/x', async (req, res) => { …50 lignes… })` est une seule instruction exécutée à l'import, qui couvre tout le handler. Même chose pour `const Comp = () => { … }` côté React. `isExecutable` (`:142-144`) a le même biais.
   **Mesure réelle** sur `backend/coverage/coverage-final.json` :
   | Fichier | Méthode du script | Lignes Istanbul (ligne de début des instructions) |
   |---|---|---|
   | `routes/backup.ts` | **98,5 %** (129/131) | **5,5 %** (4/73) |
   | `routes/settings.ts` | 100 % (78/78) | 78,0 % (32/41) |
   Le seuil de 80 % est donc quasiment toujours atteint pour les routes Express et les composants déclarés en arrow function.
2. **Un fichier absent du rapport est ignoré en silence** (`:117-121`). Vitest 4 ne rapporte que les fichiers chargés pendant les tests, sauf si `coverage.include` est défini, ce qui n'est pas le cas dans `backend/vitest.config.ts:13-28` ni dans `frontend/vitest.config.ts:13-29`. Un nouveau fichier sans aucun test ne compte donc **ni dans le delta ni dans le seuil global de 60 %**. Côté frontend, 14 fichiers sources sont absents du rapport, en plus des exclusions volontaires (`main.tsx`, `i18n/`) : `App.tsx`, `MenuEditPage.tsx`, `MenuBottleEditPage.tsx`, `HomePage.tsx`, `AdminLayout.tsx`, `PublicLayout.tsx`, `ImportCocktailWizard.tsx` et ses 4 étapes, `LocationAutocomplete.tsx`, `UnitConverter.tsx`, `types/index.ts`. Les 80 % de lignes affichés côté frontend sont donc surestimés.
3. Le repli sur `HEAD~1` (`:50-59`) quand la base n'existe pas affaiblit le contrôle sans le signaler, et sortir avec le code 0 quand il n'y a pas de base revient à ignorer l'échec.
4. Seule la couverture d'instructions est prise en compte, pas les branches.
5. `${{ github.base_ref }}` est interpolé directement dans `run:` (`ci.yml:50,94`). Le risque est faible, car `base_ref` est limité à `main` ou `develop` par le filtre de déclenchement, mais la bonne pratique est de passer par une variable `env:`.

**Propositions**
- (S) Ajouter `coverage.include: ['src/**/*.{ts,tsx}']` dans les deux configs Vitest. Prévoir que le global va baisser, peut-être sous 60 % côté frontend : à mesurer, puis ajuster le seuil ou écrire les tests manquants.
- (S) Dans le script, attribuer chaque instruction **à sa seule ligne de début** (sémantique Istanbul « lines ») ou retenir l'instruction la plus interne par ligne. Compter un fichier modifié absent du rapport comme 0 % plutôt que de l'ignorer.
- (M) Alternative : remplacer le script maison par un outil maintenu (`diff-cover` avec `lcov`, ou Codecov/Coveralls avec un patch target à 80 %).

### 3.3 [P1] Étapes manquantes ou trompeuses
- **Node 24 en CI** (`ci.yml:24,74`), **Node 20 dans les Dockerfiles** (`backend/Dockerfile:1`, `frontend/Dockerfile:1`), « Node 20 » dans `AGENTS.md:52` et « Node 20+ » dans `README.md:31`. On ne teste pas le runtime livré, et Node 20 est en fin de vie depuis le 30/04/2026. **(S)** Aligner tout le monde sur Node 24 LTS (ou 22), ajouter `"engines"` dans les deux `package.json` et un `.nvmrc`.
- **L'étape « TypeScript check » du frontend ne vérifie rien** (`ci.yml:80-81`) : `frontend/tsconfig.json` contient `"files": []` et des `references`. Sans `-b`, `tsc --noEmit` ne compile aucun fichier. La vraie vérification se fait dans `npm run build` (`tsc -b`). Les `AGENTS.md` (`AGENTS.md:33`, `frontend/AGENTS.md:13`) recommandent pourtant cette commande. **(S)** Utiliser `npx tsc -b --noEmit`, ou supprimer l'étape et corriger la doc.
- **Pas de lint backend** : ni ESLint ni Prettier, aucun script `lint` dans `backend/package.json`. **(S)** ESLint flat config avec `typescript-eslint`, partagée avec le frontend, plus Prettier à la racine.
- **Pas de build Docker sur les PR** : un Dockerfile cassé n'est découvert qu'au moment du tag. L'historique en montre un exemple (`6f35b38`, fix des tags après une release). **(S)** Ajouter un job `docker/build-push-action` avec `push: false` sur les PR, ou au moins sur les PR vers `main`.
- **Pas d'audit de dépendances** (`npm audit --omit=dev --audit-level=high`), pas de CodeQL, pas de scan d'image (Trivy). **(S)**
- **Pas de tests E2E** : aucun test ne traverse nginx → Express → SQLite. Le bug des 1 Mo (§2.4) et celui des uploads hors volume (§2.1) auraient été détectés par un smoke test `docker compose up` suivi d'un `curl` d'upload. **(M)** Ajouter un job « smoke » avec compose, healthcheck, login, upload de 2 Mo, GET de l'image ; plus tard, Playwright sur 3 ou 4 parcours.
- Pas de `concurrency:` (les pushes successifs ne s'annulent pas), pas de `permissions: contents: read` dans `ci.yml` (le jeton a les droits par défaut), et les actions sont épinglées par tag plutôt que par SHA. **(S)**

### 3.4 [P1] Release
- **La release ne dépend pas de la CI** (`release.yml:3-6`) : n'importe quel tag `v*`, même posé sur un commit rouge ou hors `main`, publie `latest`. Pour v1.4.0, Release et CI de `main` ont tourné en parallèle (13:17 et 13:18). **(S)** Exécuter tests et build dans la release, ou vérifier `github.event.base_ref == 'refs/heads/main'` et réutiliser le workflow CI (`workflow_call`) en `needs:`.
- **Mono-architecture** : pas de `platforms:`, donc des images `linux/amd64` uniquement. Pour un déploiement sur NAS ou Raspberry Pi ARM, l'image ne démarre pas. **(S)** `docker/setup-qemu-action` et `platforms: linux/amd64,linux/arm64`.
- Pas de SBOM ni d'attestation explicites. **(S)** `sbom: true` et `provenance: mode=max` sur `build-push-action`.
- `latest` est déplacé par **n'importe quel** tag, y compris un correctif sur une branche de maintenance plus ancienne. **(S)** `docker/metadata-action` avec les tags semver `{{version}}`, `{{major}}.{{minor}}` et `latest` uniquement pour le tag le plus élevé.
- Changelog (`release.yml:73-95`) : `git log PREV..HEAD` liste surtout des lignes « Merge pull request #… from Lulu300/develop » (PR develop → main), et `PREV_TAG` est le deuxième tag par ordre de version, ce qui est faux si un tag est poussé hors ordre. **(S)** `softprops/action-gh-release` avec `generate_release_notes: true` (basé sur les PR), ou release-please, cohérent avec Conventional Commits.
- Versions jamais incrémentées : `backend/package.json:3` à `1.0.0`, `frontend/package.json:4` à `0.0.0`, `backup.ts:53` à `1.0.0`. **(S)** Injecter la version du tag (`ARG APP_VERSION` → env), et l'exposer dans `/api/health` et dans les métadonnées de backup.

### 3.5 [P1] Pas de Dependabot ni de Renovate
- `.github/` ne contient que `scripts/` et `workflows/`. Pas de `dependabot.yml`, ni de `CODEOWNERS` ou de modèle de PR, ce qui se comprend pour un projet solo.
- **Proposition (S)** : `dependabot.yml` couvrant `npm` (`/backend`, `/frontend`), `docker` (les deux Dockerfiles) et `github-actions`, en hebdomadaire, avec des groupes (`minor-and-patch` regroupés).

---

## 4. Dépendances

### 4.1 Vulnérabilités (`npm audit --package-lock-only`)

| Paquet | Dépendances prod | Toutes |
|---|---|---|
| backend | **11** : 2 critiques, 6 high, 2 moderate, 1 low | idem |
| frontend | **2 high** (`react-router`, `react-router-dom`) | 22 : 2 critiques, 14 high (vite, undici, etc., pour l'essentiel des devDependencies) |

Backend, dépendances prod concernées :
- `proxy-addr` (critique, via express) ;
- `i18next-http-middleware` (critique, dépendance directe) ;
- `multer` (high, directe) ;
- `adm-zip` (high, directe ; le correctif est en 0.6.x, majeure) ;
- `path-to-regexp` (high, ReDoS, via express 5) ;
- `qs`, `morgan`, `body-parser`, `lodash`, `minimatch`, `brace-expansion`.

Presque tout se corrige avec `npm audit fix`, sans changement de version majeure. Seul `adm-zip` passe en 0.6.

**Proposition (S, P0)** : `npm audit fix` dans les deux paquets, sur une branche `fix/deps-security`, puis exécution des tests et ajout de l'audit en CI (§3.3).

### 4.2 Versions obsolètes (`npm outdated`)

Rien n'a été mis à jour depuis février (les lockfiles datent du 23 février). Points notables :
- Backend : `@prisma/client`/`prisma` en 6.19.2, alors que la dernière est 7.10 (Prisma 7 change le générateur et la config : migration M à planifier). `vitest`/`@vitest/coverage-v8` en 4.0.18, dernière 5.0.3. `dotenv` 17 → 18, `archiver` 7 → 8, `i18next` 25 → 26. `multer` 2.0.2 → 2.4.0 et `helmet` 8.1 → 8.3, mises à jour sans changement de version majeure.
- Frontend : `vite` 7.3.1 → 8.3.4 (avec 7.3.7 disponible dans la plage), `eslint` 9 → 10, `@vitejs/plugin-react` 5 → 6, `react-i18next` 16 → 17, `jsdom` 28 → 29, `globals` 16 → 17. `react` 19.2.4 → 19.3.0, `react-router-dom` 7.13 → 7.18.4 (corrige l'alerte high), `tailwindcss` 4.1 → 4.3.
- TypeScript 5.9.3 → 7.0.2 (compilateur natif) : à évaluer séparément.

**Proposition** : (S) appliquer tous les « Wanted » (mineures et patchs) ; (M) une PR par majeure : Vitest 5, Vite 8, ESLint 10, puis Prisma 7 en dernier.

### 4.3 Dépendances mal rangées ou inutilisées
- **`@prisma/client` en devDependencies** (`backend/package.json:36`) alors qu'il sert au runtime : le déplacer en `dependencies`. `prisma` (la CLI) et `tsx` sont aussi nécessaires au runtime avec le Dockerfile actuel (§2.6).
- **`nodemon`** (`:48`) et **`ts-node`** (`:51`) ne sont référencés nulle part : `dev` utilise `tsx watch`. À supprimer. `backend/AGENTS.md:151` mentionne encore `ts-node`.
- `@types/node` en version 25 (backend) et 24 (frontend) : à aligner sur la version de Node réellement utilisée.
- Toutes les autres dépendances runtime sont bien importées (vérifié par grep : `adm-zip`, `archiver`, `bcryptjs`, `cors`, `dotenv`, `helmet`, `i18next`, `i18next-http-middleware`, `jsonwebtoken`, `morgan`, `multer` ; `jszip`, `react-i18next`, `react-router-dom`, `i18next-browser-languagedetector` côté frontend).
- `backend/package.json` : `"main": "index.js"`, `"description": ""` et `"license": "ISC"`, alors que le repo est sous MIT (`LICENSE`). Ajouter `"private": true`.
- `.env.example:9` contient `VITE_API_URL`, qui n'est utilisé nulle part : le frontend passe par le proxy `/api`.
- Pas d'ESLint ni de Prettier côté backend (§3.3), pas de Prettier côté frontend, pas d'`.editorconfig`.

---

## 5. Documentation

### 5.1 Ce qui va bien
- Trois `AGENTS.md` structurés (stack, workflow, exigences de test, patterns) et un README complet (fonctionnalités, quick start, Docker local et prod, variables, CI/CD, API).
- LICENSE MIT présente. Le workflow Git et les exigences de couverture sont écrits noir sur blanc.

### 5.2 Écarts entre la doc et le code

| Doc | Affirmation | Réalité |
|---|---|---|
| `AGENTS.md:63` | « Database Schema (14 models) » | **15** modèles dans `schema.prisma`. La liste qui suit en contient d'ailleurs 15 |
| `backend/AGENTS.md:74` | « (14 models) » | 15 (le README `:125` dit bien 15) |
| `AGENTS.md:52` | CI « on Node 20 » | Node 24 (`ci.yml:24,74`) |
| `AGENTS.md:33`, `frontend/AGENTS.md:13` | `npx tsc --noEmit` vérifie les types frontend | Ne vérifie rien (§3.3) |
| `README.md:119`, `backend/AGENTS.md:49` | « 14 route files » | 15 : `backup.ts` absent de l'arborescence `backend/AGENTS.md:50-63` |
| `backend/AGENTS.md:66-67` | utils = `translations.ts` | Il existe aussi `bottlesExport.ts` et `bottlesImport.ts` |
| `backend/AGENTS.md:70-72` | `i18n/locales/en.json` | `src/i18n/en.json` (pas de sous-dossier `locales`) |
| `backend/AGENTS.md:134` | Images « Stored in `/uploads/cocktails/` » | Racine de `uploads/` (`cocktails.ts:24`) |
| `backend/AGENTS.md:151` | Dev deps : `@prisma/client`, `ts-node` | Documente le mauvais rangement ; `ts-node` est inutilisé |
| `frontend/AGENTS.md:106` | `nginx.conf` est la config de prod | C'est `nginx.conf.template` |
| `frontend/AGENTS.md:69-97` | Arborescence | Il manque `ImportBottlesWizard`, `Pagination`, `SearchInput`, `SortableHeader`, `MultiSelectDropdown`, `LocationAutocomplete`, `CategoryFilterInput`, les hooks `useClickOutside`, `usePagination` et `useSort`, les utils `cocktailSearch` et `uploads`, et `PublicCocktailItem` |
| `frontend/AGENTS.md:175-180` | Scripts | Les scripts `test`, `test:watch` et `test:coverage` ne sont pas listés |
| `README.md:148` | Valeur par défaut de `JWT_SECRET` : `change-me-to-a-random-secret` | Le code utilise `default-secret` (`config.ts:8`) ; seul le compose utilise l'autre |
| `README.md:77` | test.db « created and destroyed automatically » | Elle reste dans `prisma/prisma/test.db` (§2.9) |
| `README.md:188-202` | Vue d'ensemble de l'API | Il manque `/api/backup/*`, `/api/bottles/import` et `/export`, `/api/category-types`, `/api/menu-bottles`, `/api/menu-sections`, `/api/auth/me` |
| `README.md:43` | `cp ../.env.example .env` | Avec ce `.env`, l'export de backup échoue en dev (§2.10) |

### 5.3 Ce qui manque
- **Guide d'exploitation** : procédure de mise à jour (sauvegarde avant `pull`, épinglage de version), restauration, rotation des secrets, récupération du mot de passe admin, HTTPS (reverse proxy Traefik/Caddy devant le port 80), emplacement des volumes.
- Avertissement de sécurité explicite dans le README : « changez `JWT_SECRET` et `ADMIN_PASSWORD` avant d'exposer l'application ».
- `CHANGELOG.md`, ou un renvoi aux GitHub Releases.
- Section « Architecture decisions », ou ADR, pour les choix structurants : traductions en chaînes JSON, `db push` plutôt que des migrations (choix à revoir), source polymorphe des ingrédients.
- **Proposition (S)** : corriger les écarts du §5.2 en une seule PR `docs/sync-agents-readme`. Pour limiter la dérive à l'avenir, remplacer les nombres en dur (« 14 routes », « 15 models ») par des formulations sans nombre.

---

## 6. Plan d'action priorisé

| # | Action | Effort | Priorité | Section |
|---|---|---|---|---|
| 1 | Corriger `uploadDir` (env `UPLOAD_DIR=/app/uploads`) et récupérer les images de `/uploads` dans les conteneurs existants | S | **P0** | 2.1 |
| 2 | `client_max_body_size` dans nginx (20m pour l'API, 512m pour la restauration de backup) | S | **P0** | 2.4 |
| 3 | Refuser de démarrer avec un `JWT_SECRET` par défaut ; `${VAR:?}` dans le compose prod ; seed qui ne réinitialise plus le mot de passe sans `ADMIN_RESET_PASSWORD` | S | **P0** | 2.3 |
| 4 | `npm audit fix` dans les deux paquets, `react-router-dom` ≥ 7.18, `adm-zip` 0.6 | S | **P0** | 4.1 |
| 5 | Migrations Prisma versionnées (baseline `0_init`), `migrate deploy`, sauvegarde SQLite automatique avant migration, version épinglée en prod | M | **P0** | 2.2 |
| 6 | Corriger le delta-coverage (ligne de début des instructions, fichiers absents comptés à 0 %) et `coverage.include` | S | P1 | 3.2 |
| 7 | Node 24 LTS partout (Dockerfiles, `engines`, `.nvmrc`, doc) | S | P1 | 3.3 |
| 8 | `.dockerignore` backend et frontend | S | P1 | 2.5 |
| 9 | Dockerfile backend multi-stage, `USER node`, `NODE_ENV=production`, `@prisma/client` en `dependencies`, suppression de nodemon et ts-node | M | P1 | 2.6, 4.3 |
| 10 | `/api/health`, healthchecks compose, `depends_on: service_healthy` | S | P1 | 2.7 |
| 11 | Release conditionnée aux tests ; multi-arch amd64/arm64 ; SBOM ; `metadata-action` ; `generate_release_notes` | S | P1 | 3.4 |
| 12 | Dependabot (npm ×2, docker, github-actions) | S | P1 | 3.5 |
| 13 | CI : build Docker sur PR, ESLint backend, audit, `tsc -b`, `concurrency`, `permissions` | S–M | P1 | 3.3 |
| 14 | Smoke test E2E via compose (login, upload de 2 Mo, image servie, export de backup) | M | P2 | 3.3 |
| 15 | Isolation des tests (dossier d'upload temporaire, chemin de `test.db`) et tests de `backup.ts` | S | P2 | 2.9, 2.10 |
| 16 | Backup : chemin de la base robuste, `VACUUM INTO`, copie de sécurité avant restauration, version réelle dans les métadonnées | M | P2 | 2.10 |
| 17 | Protection de branches, suppression automatique des branches, `.mailmap`, Conventional Commits | S | P2 | 1.3 |
| 18 | `.gitignore` : `.omc/`, `coverage/` ; retirer `migrations/` et l'entrée `src/generated/prisma` ; supprimer `dev.db` et `frontend/nginx.conf` | S | P2 | 1.4, 2.8 |
| 19 | Synchroniser `AGENTS.md`/README et ajouter le guide d'exploitation et sécurité | S | P2 | 5 |
| 20 | Retirer le port 3001 du compose prod, nginx non-root, gzip, cache limité à `/assets/` | S | P3 | 2.8 |
| 21 | Montées de version majeures (Vitest 5, Vite 8, ESLint 10, puis Prisma 7) | M–L | P3 | 4.2 |

---

## 7. Références (fichier:ligne)

- `backend/src/config.ts:8` : fallback `JWT_SECRET` à `'default-secret'`
- `backend/src/config.ts:11` : `uploadDir` relatif à `__dirname`, qui donne `/uploads` dans l'image
- `backend/Dockerfile:1,6,11,14,18` : Node 20, `npm ci` complet, `COPY . .`, mkdir `/app/uploads`, `db push --accept-data-loss`
- `frontend/Dockerfile:1,11,16` : Node 20, `nginx:alpine` non épinglé, `BACKEND_HOST=backend`
- `docker-compose.yml:10-12,16` / `docker-compose.prod.yml:3-5,8-10,14,18` : secrets par défaut, volume `/app/uploads`, `:latest`, port 3001 exposé
- `frontend/nginx.conf.template:1-35` : pas de `client_max_body_size`, cache `immutable` trop large
- `frontend/nginx.conf` : fichier mort
- `.gitignore:32` : migrations Prisma ignorées
- `backend/.gitignore:5` : entrée obsolète
- `backend/prisma/seed.ts:10-15` : mot de passe admin réécrit à chaque démarrage
- `backend/src/routes/settings.ts:47-75` : changement de mot de passe depuis l'UI, annulé par le seed
- `backend/src/routes/backup.ts:14,18-21,53,58,113-131` : limite de 500 Mo, chemin de base naïf, version codée en dur, copie à chaud, restauration destructive sans copie de sécurité
- `backend/src/routes/cocktails.ts:20-25,41` / `routes/bottles.ts:14` : limites multer de 5 et 10 Mo
- `backend/src/routes/cocktails.test.ts:542` : le test écrit dans le vrai dossier `uploads/`
- `backend/src/test/helpers.ts:10,27-31` / `test/setup.ts:2` : chemin de `test.db` incohérent
- `backend/package.json:3,19,36,48,51` : version jamais incrémentée, licence ISC, `@prisma/client` en dev, nodemon et ts-node inutilisés
- `frontend/tsconfig.json:2` : `"files": []`, donc `tsc --noEmit` ne vérifie rien
- `backend/vitest.config.ts:13-28`, `frontend/vitest.config.ts:13-29` : pas de `coverage.include`
- `.github/workflows/ci.yml:24,74,50,94,80-81` : Node 24, `base_ref` interpolé, tsc sans effet
- `.github/workflows/release.yml:3-6,41-61,73-95` : release non conditionnée à la CI, mono-arch, changelog fait de commits de merge
- `.github/scripts/delta-coverage.mjs:50-59,117-121,127-134,142-144` : repli silencieux, fichiers absents ignorés, sur-attribution de couverture
- `AGENTS.md:52,63` ; `backend/AGENTS.md:49,66-74,134,151` ; `frontend/AGENTS.md:13,69-97,106,175-180` ; `README.md:77,119,148,188-202` : écarts de documentation
