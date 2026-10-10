---
id: D-03
title: "Healthchecks, ordre de démarrage et port 3001 non publié"
phase: D
lane: infra
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [A-04, D-01]
touches: [backend/src/app.ts, backend/src/routes/health.ts, docker-compose.yml, docker-compose.prod.yml]
sources: ["07-devops-history.md §2.7", "07-devops-history.md §2.8", "03-security.md §10"]
branch:
pr:
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

- [ ] `GET /api/health` renvoie 200 `{ status: 'ok', version }` sans token.
- [ ] `GET /api/health` renvoie 503 si la requête SQL échoue.
- [ ] Les appels à `/api/health` n'apparaissent pas dans les logs morgan.
- [ ] `docker compose up -d --wait` rend la main quand les deux services sont `healthy`.
- [ ] `docker compose ps` affiche `healthy` pour les deux services.
- [ ] Avec le compose prod, `curl http://<hôte>:3001/api/health` échoue, `curl http://<hôte>/api/health` répond.
- [ ] `npm test`, `npx tsc --noEmit` et la couverture passent dans `backend/`.

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
