---
id: D-03
title: "Healthchecks, ordre de démarrage et port 3001 non publié"
phase: D
lane: infra
criticite: moyenne
effort: S
status: done
owner: agent
breaking: true
depends_on: [A-04, D-01]
touches: [backend/src/app.ts, backend/src/routes/health.ts, docker-compose.yml, docker-compose.prod.yml]
sources: ["07-devops-history.md §2.7", "07-devops-history.md §2.8", "03-security.md §10"]
branch: chore/D-03-healthchecks-compose
pr: "#117"
---

## Décisions validées (2026-10-10)

- **Port du frontend** : le conteneur frontend écoute sur 8080 (D-02, changement cassant).

## Contexte

Docker ne sait pas si le backend est prêt : il le considère démarré dès que le processus existe, même pendant les migrations ou si la base est inaccessible. nginx peut donc démarrer avant le backend et l'API est joignable sur le port 3001 en contournant nginx. Un endpoint de santé sert aussi au smoke test D-08 et à la supervision sur le NAS.

## Problème constaté

- `backend/src/app.ts:37-54` : aucune route `/health`.
- `docker-compose.yml:1-29`, `docker-compose.prod.yml:1-25` : aucun `healthcheck:`. `depends_on` sans condition (`docker-compose.yml:27-28`, `docker-compose.prod.yml:23-24`).
- `docker-compose.yml:6-7` et `docker-compose.prod.yml:4-5` : `ports: "3001:3001"`. L'API est publiée sur toutes les interfaces de l'hôte alors que nginx la proxifie déjà (`nginx.conf.template:8-14`). Cela contourne les en-têtes nginx (D-02) et tout rate limiting futur (C-11).
- `backend/src/app.ts:30` : `morgan('dev')` en production. Une fois le healthcheck en place, il loguerait aussi un appel toutes les 30 s.

## Ce qu'il faut faire

1. Créer `backend/src/routes/health.ts`. Utiliser le client Prisma partagé de C-02 (`src/lib/prisma.ts`) s'il existe.
   ```ts
   import { Router } from 'express';
   import { prisma } from '../lib/prisma';

   const router = Router();
   router.get('/', async (_req, res) => {
     try {
       await prisma.$queryRaw`SELECT 1`;
       res.json({ status: 'ok', version: process.env.APP_VERSION ?? 'dev' });
     } catch {
       res.status(503).json({ status: 'unavailable' });
     }
   });
   export default router;
   ```
   Ne rien renvoyer d'autre (pas de chemin de base, pas d'uptime détaillé) : la route est publique via nginx.
2. `backend/src/app.ts` : monter la route **avant** `morgan` et sans `authMiddleware` :
   `app.use('/api/health', healthRoutes);`
   Remplacer `morgan('dev')` par `morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev')`.
3. `docker-compose.yml` et `docker-compose.prod.yml`, service backend :
   ```yaml
   healthcheck:
     test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3001/api/health"]
     interval: 30s
     timeout: 5s
     retries: 3
     start_period: 60s
   ```
   `start_period` couvre la copie de sécurité, `migrate deploy` et le seed de C-01.
4. Service frontend : `depends_on: { carta-cocktail-backend: { condition: service_healthy } }` et un healthcheck simple :
   `test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/"]` (port 80 si D-02 n'est pas encore mergé).
5. Port 3001 :
   - `docker-compose.prod.yml` : supprimer `ports` du backend, mettre `expose: ["3001"]` ;
   - `docker-compose.yml` (build local, usage dev) : `"127.0.0.1:3001:3001"`.

## Critères d'acceptation

- [x] `GET /api/health` renvoie 200 `{ status: 'ok', version }` sans token.
- [x] `GET /api/health` renvoie 503 si la requête SQL échoue.
- [x] Les appels à `/api/health` n'apparaissent pas dans les logs morgan.
- [x] `docker compose up -d --wait` rend la main quand les deux services sont `healthy`.
- [x] `docker compose ps` affiche `healthy` pour les deux services.
- [x] Avec le compose prod, `curl http://<hôte>:3001/api/health` échoue, `curl http://<hôte>/api/health` répond.
- [x] `npm test`, `npx tsc --noEmit` et la couverture passent dans `backend/`.

## Tests à ajouter ou adapter

- `backend/src/routes/health.test.ts` (supertest) : 200 sans en-tête `Authorization` ; 503 quand `prisma.$queryRaw` est mocké pour rejeter (`vi.spyOn`) ; `version` reprend `APP_VERSION` quand la variable est définie.
- Manuel : `docker compose up -d --build --wait` puis `docker inspect --format '{{.State.Health.Status}}'` sur chaque conteneur.

## Points d'attention

- Dépendance implicite à C-02 : si le singleton Prisma n'existe pas encore, créer un client local dans `health.ts` ajoute une connexion SQLite de plus. Mieux vaut attendre C-02 (suggestion : l'ajouter à `depends_on`).
- `wget` est fourni par busybox dans `node:24-alpine` et `nginx-unprivileged:*-alpine`. Une image distroless n'en aurait pas.
- Supprimer le port 3001 du compose prod casse les usages qui appellent l'API directement sur l'hôte (scripts, autre reverse proxy). Le signaler dans les notes de version (point suivant) et dans D-09.
- **Notes de version** (règle de D-11 : la PR ne touche ni `docs/releases/` ni `UPGRADING.md`). `breaking: true`. La description de la PR a une section « Required actions » et le Journal une ligne « Notes de version ». Actions attendues : *before* — remplacer tout appel direct à `http://<hôte>:3001/api/...` (scripts, reverse proxy) par `http://<hôte>/api/...` via nginx, ou republier le port dans un `docker-compose.override.yml` en le limitant à `127.0.0.1` ; *after* — `docker compose up -d --wait` puis vérifier que `docker compose ps` affiche `healthy` pour les deux services. Épinglage recommandé : `:<version>` avant D-05, `:<majeure>.<mineure>` ensuite.
- `APP_VERSION` est injectée par D-05. Avant D-05, la route renvoie `dev`.
- A-01, A-04 et D-02 modifient les mêmes fichiers compose : rebaser avant le merge.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-09 : point d'attention « Notes de version » (règle de D-11 décidée le 2026-10-09) : `breaking: true`, actions attendues, épinglage recommandé.
- 2026-10-12 : PR #117. `GET /api/health` (singleton Prisma, `SELECT 1`, 200 `{ status, version }` ou 503 `{ status: 'unavailable' }`), montée avant `morgan` et sans `authMiddleware` ; `morgan` passait déjà en `combined` en production. Healthchecks backend et frontend dans les deux compose (frontend : `wget -qO /dev/null` pour ne pas copier la page dans le journal de santé), frontend en `depends_on … service_healthy`. Port 3001 : `expose` seul dans le compose prod, `127.0.0.1:3001:3001` dans le compose de build local. Pas de `start_interval` (Docker Engine ≥ 25 exigé, Compose le refuse sur les NAS plus anciens). Tests : `health.test.ts` (200 sans token, `APP_VERSION`, 503), couverture delta 100 %. Vérifié à la main avec Docker 29 : `up --wait` rend la main avec les deux services `healthy`, appels de santé absents des logs, compose prod sans liaison du port 3001 sur l'hôte et `/api/health` joignable via nginx. Banc de mise à jour non lancé : il utilise ses propres modèles compose (`layouts/*/compose-<génération>.yml`), qui publient `127.0.0.1::3001` pour joindre le backend ; aucun hook temporaire nécessaire. À la release, le hook de cette version peut ajouter une génération `official` avec les healthchecks en gardant cette publication. Doc laissée à D-09 (dépend de D-03) : README « Login limit behind a reverse proxy » (« The compose files publish the backend port 3001 ») et `AGENTS.md` section Docker (« Backend on port 3001 »).
- Notes de version : `breaking: true`. Le compose prod ne publie plus le port 3001 du backend. Avant : (1) remplacer tout appel direct à `http://<hôte>:3001/api/...` ou `/uploads/...` (scripts, supervision) par `http://<hôte>:<port du frontend>/api/...` via nginx ; (2) un reverse proxy (SWAG, Traefik…) qui visait le port 3001 vise désormais le port du frontend ; si `TRUST_PROXY` est un nombre, l'augmenter de 1 (les requêtes traversent aussi nginx, sinon tous les clients partagent un seul compteur de connexion et 10 échecs bloquent tout le monde, admin compris, pendant 15 min) ; la valeur par défaut ne demande rien ; (3) un proxy qui joint `carta-cocktail-backend:3001` par un réseau Docker partagé n'est pas concerné (`expose` ne change rien entre conteneurs) ; (4) republier le port dans un `docker-compose.override.yml` limité à `127.0.0.1` (`"127.0.0.1:3001:3001"`) ne sert qu'aux processus de l'hôte lui-même : un proxy en conteneur ou sur une autre machine ne l'atteint pas (502) ; (5) un compose personnalisé reprend les blocs `healthcheck` et la condition `depends_on`. Après : `docker compose up -d --wait`, puis vérifier que `docker compose ps` affiche `healthy` pour les deux services et que `http://<hôte>:<port du frontend>/api/health` répond ; si le backend ne démarre pas, le frontend ne démarre pas non plus : lire `docker compose logs carta-cocktail-backend`, corriger, puis relancer `docker compose up -d`. Retour arrière vers une image antérieure (ou nouveau compose avec un tag plus ancien, ou compose récupéré sur `main` avant la publication de l'image `latest`) : l'image n'a pas `/api/health`, le backend reste `unhealthy` et le frontend ne démarre jamais ; revenir aussi au compose précédent, ou retirer le `healthcheck` du backend et la condition `depends_on`. Épinglage recommandé : `:<majeure>.<mineure>` (publié depuis D-05).
- 2026-10-12 : relecture indépendante de la PR #117 (changements demandés). « Required actions » et ligne « Notes de version » complétées : `TRUST_PROXY` numérique +1 pour un reverse proxy qui visait le port 3001, surcharge `127.0.0.1` réservée aux processus de l'hôte (proxy en conteneur ou distant : viser le port du frontend ; réseau Docker partagé non concerné), retour arrière vers une image sans `/api/health`, port du frontend explicite. Comportement « un backend qui ne démarre pas empêche le frontend de démarrer » (conséquence de `service_healthy`) : décision humaine demandée, phrase « After upgrading » préparée. `APP_VERSION` vide renvoie aussi `dev` (`||`), test ajouté. Tâche D-25 créée (sondes du healthcheck frontend dans l'access log nginx).
- 2026-10-12 : décision humaine « Accepter + documenter » : on garde `depends_on … condition: service_healthy`, même si un backend qui ne démarre pas empêche maintenant le frontend de démarrer (avant, nginx servait la SPA avec des erreurs d'API). La phrase « After upgrading » est conservée dans la PR et dans la ligne « Notes de version » (lire `docker compose logs carta-cocktail-backend`, corriger, relancer `docker compose up -d`). Rebasée sur `develop` après D-05 (PR #118), qui injecte `APP_VERSION` dans l'image backend (`dev` hors release) : `/api/health` renvoie la version du tag dans les images de release, et l'épinglage recommandé devient `:<majeure>.<mineure>`.
- 2026-10-12 : remarques de relecture hors périmètre (PR #117) : `SELECT 1` ne lit aucune page du fichier SQLite (un fichier devenu illisible sur un partage réseau n'est pas détecté) ; `SELECT 1 FROM _prisma_migrations LIMIT 1` serait plus parlant si besoin un jour. Le champ `breaking: true` du frontmatter n'est pas lu par `build.mjs` ni décrit dans `docs/plan/README.md` : la règle 9 le place dans la section « Required actions » de la PR, qui reste la référence.
