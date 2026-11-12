---
id: C-47
title: "Limiter le débit de toute l'API, plus strictement sur /api/backup"
phase: C
lane: backend
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [D-35]
touches: [backend/src/app.ts, backend/src/middleware/rateLimit.ts, backend/src/config.ts, backend/src/config.test.ts, backend/src/i18n/, backend/src/routes/apiRateLimit.test.ts, backend/src/routes/backup.test.ts, backend/src/test/helpers.ts, backend/AGENTS.md, README.md, .env.example]
sources: ["03-security.md §4"]
branch:
pr:
---

## Contexte

Triage CodeQL de D-35. 19 alertes `js/missing-rate-limiting` (« high ») restent ouvertes sur `main` : #6 à #18 (`backend/src/app.ts`, lignes 74 à 86, un `app.use` par routeur protégé), #19 et #20 (`routes/auth.ts` : `GET /me`, `POST /logout-all`), #21 et #22 (`routes/backup.ts` : export et import), #25 (`routes/public.ts`, `router.use(optionalAuth)`) et #26 (`routes/settings.ts`, `PUT /profile`).

Le seul limiteur est `loginLimiter` (C-11), monté sur `/api/auth/login` dans `app.ts` : `rateLimit()` d'`express-rate-limit` (`^8.7.0`), fenêtre de 15 minutes, `limit: config.loginRateLimit` (`LOGIN_RATE_LIMIT`, 10 par défaut), `skipSuccessfulRequests`, `standardHeaders: 'draft-7'`, et un `handler` qui passe `new HttpError(429, 'errors.tooManyAttempts')` au gestionnaire d'erreurs (réponse JSON traduite). Le compteur est par `req.ip`, qui dépend de `app.set('trust proxy', config.trustProxy)` (`TRUST_PROXY`, `parseTrustProxy` dans `config.ts`, défaut `loopback, linklocal, uniquelocal`).

## Décisions validées

- 2026-11-12, humain (via D-35) : un limiteur global large sur `/api`, un limiteur plus strict sur `/api/backup`, tous deux par adresse IP selon `TRUST_PROXY`. Les clients d'un bar partagent souvent une seule adresse publique : les routes publiques doivent accepter au moins ~600 requêtes par minute et par IP.
- 2026-11-12, humain (via D-35) : les alertes `js/missing-rate-limiting` qui resteraient ouvertes une fois cette tâche arrivée sur `main` seront fermées en « won't fix ». CodeQL ne reconnaît pas toujours un limiteur monté sur un préfixe de chemin ; on ne déforme pas le code pour lui.

## Problème constaté

Hors login, aucune route de l'API n'est limitée. Un client peut appeler sans fin les routes publiques (la carte publique calcule les disponibilités à chaque appel) ou, avec un token, l'export de sauvegarde, qui crée un instantané de la base et compresse tout le dossier des photos à chaque requête.

## Ce qu'il faut faire

1. Extraire la construction d'un limiteur dans `backend/src/middleware/rateLimit.ts` (par exemple `createRateLimiter({ windowMs, limit, messageKey, skipSuccessfulRequests })`), avec les réglages communs de `loginLimiter` : en-têtes `draft-7`, pas d'en-têtes `X-RateLimit-*`, `handler` qui passe un `HttpError(429, messageKey)`. `loginLimiter` l'utilise aussi : pas de deuxième copie de ces options.
2. Limiteur global sur `/api`, monté dans `app.ts` après `/api/health` (le healthcheck Docker reste hors limite) et après `i18nMiddleware` (le 429 est traduit), mais avant les deux parseurs JSON (un flood est refusé avant de lire des corps qui vont jusqu'à 5 Mo) et avant les routeurs et `authMiddleware` (les requêtes sans token comptent aussi) : fenêtre d'une minute, limite lue dans une nouvelle variable `API_RATE_LIMIT` (requêtes par minute et par IP, défaut 600). La lire avec le même analyseur que `LOGIN_RATE_LIMIT` : généraliser `parseLoginRateLimit` en un analyseur d'entier positif commun, avec le nom de la variable dans le message d'erreur, plutôt que le dupliquer.
3. Limiteur strict sur `/api/backup`, monté **après** `authMiddleware` sur ce préfixe (`app.use('/api/backup', authMiddleware, backupLimiter, backupRoutes)`) : il ne compte que les requêtes authentifiées. Raison à écrire en commentaire : `authMiddleware` refuse déjà à bas coût une requête sans token, et la limite globale couvre les floods sans token ; compter ces requêtes dans un compteur de 10 par 15 minutes permettrait à quiconque partage l'adresse de l'admin (tous les clients Internet dans les installs Docker rootless, Podman, Docker Desktop ou `docker-proxy` décrites dans le README) de bloquer les sauvegardes. Fenêtre et limite fixes dans le code (par exemple 10 requêtes par 15 minutes), à justifier en commentaire (export et import lourds, quelques usages par jour).
4. Nouvelle clé i18n `errors.tooManyRequests` (en, fr) pour les deux nouveaux limiteurs ; `errors.tooManyAttempts` reste celle du login.
5. Documenter `API_RATE_LIMIT` : tableau des variables du `README.md` (et la phrase qui liste les variables à ajouter au compose), `.env.example`, `backend/AGENTS.md` (paragraphe du login limité). Mettre à jour aussi la ligne `TRUST_PROXY` du tableau du README (elle ne parle que de l'adresse « que `LOGIN_RATE_LIMIT` compte ») et la section « Login limit behind a reverse proxy », qui ne traite que du compteur du login : elles valent désormais pour les trois limites. Rappeler que les clients qui partagent une adresse partagent le compteur.
6. Garder la suite existante verte : `backup.test.ts` envoie 42 requêtes à `/api/backup` (21 `exportBackup(`, 21 `importBackup(`, plus les cas 401 et 400), toutes depuis le loopback et vers la même instance de l'app ; avec 10 par 15 minutes, la onzième recevrait 429 (C-11 a eu le même problème avec `auth.test.ts`, voir son Journal). Remettre les compteurs à zéro entre les tests : chaque limiteur créé par la fabrique a son propre `MemoryStore` d'`express-rate-limit`, et `rateLimit.ts` exporte `resetRateLimits()` (appelle `resetAll()` sur chaque store), appelé dans le `beforeEach` de `backup.test.ts` (ou exposé par `src/test/helpers.ts`). Vérifier qu'aucun test seul n'envoie plus de 10 requêtes authentifiées à `/api/backup` ; sinon, rendre la limite réglable pour les tests comme `LOGIN_RATE_LIMIT` (`vi.hoisted`) plutôt que désactiver le limiteur.

## Critères d'acceptation

- [ ] Au-delà de `API_RATE_LIMIT` requêtes par minute depuis une même IP, l'API répond 429, en JSON traduit, avec `Retry-After`.
- [ ] `/api/health` n'est jamais limité.
- [ ] `/api/backup` est limité plus strictement pour les requêtes authentifiées ; une requête sans token y reçoit 401 et ne compte que dans la limite globale.
- [ ] `backup.test.ts` et les autres suites existantes passent sans limiteur désactivé.
- [ ] Le comptage suit `TRUST_PROXY` comme le login : deux clients distincts derrière nginx ont deux compteurs.
- [ ] `loginLimiter` garde son comportement (tests `loginRateLimit.test.ts` inchangés et verts) et utilise la fabrique commune.
- [ ] Une valeur invalide de `API_RATE_LIMIT` empêche le démarrage avec un message qui nomme la variable.
- [ ] `README.md`, `.env.example` et `backend/AGENTS.md` décrivent la variable.

## Tests à ajouter ou adapter

- `backend/src/routes/apiRateLimit.test.ts` (nouveau, sur le modèle de `loginRateLimit.test.ts` : limite basse posée par `vi.hoisted`, adresses distinctes par `X-Forwarded-For`) : 429 traduit au-delà de la limite sur une route publique et sur une route protégée ; compteurs séparés par client ; `/api/health` jamais limité ; 429 traduit (`Accept-Language: fr`). Pour `/api/backup` : ce fichier règle `API_RATE_LIMIT` (par `vi.hoisted`) au-dessus de la limite de `/api/backup`, sinon la limite globale répondrait 429 la première ; avec un token, 429 au-delà de la limite backup alors que la limite globale n'est pas atteinte ; sans token, 401 au-delà de la limite backup (seule la limite globale compte).
- `backup.test.ts` : `resetRateLimits()` dans `beforeEach`, aucun autre changement attendu.
- `config.test.ts` : défaut de `API_RATE_LIMIT`, valeurs refusées (`0`, `-1`, `abc`, `1.5`), message qui nomme la variable ; mêmes cas qu'avant pour `LOGIN_RATE_LIMIT`.

## Points d'attention

- Les suites de tests envoient toutes leurs requêtes depuis la même adresse, avec une instance de l'app par fichier. Vérifier qu'aucun fichier ne dépasse 600 requêtes par minute (`bottles.test.ts` est le plus chargé) ; sinon relever la limite pour l'environnement de test de façon explicite plutôt que désactiver le limiteur.
- Installs où tous les clients arrivent sous une même adresse privée (Docker rootless, Podman, Docker Desktop, IPv6 relayé par `docker-proxy`, voir le README) : tout le trafic partage un seul compteur global. 600 par minute doit rester large pour une carte consultée par une salle ; `API_RATE_LIMIT` permet de monter.
- Les compteurs sont en mémoire (comme le login) : un redémarrage les remet à zéro, ce qui suffit pour une instance unique.
- Ne pas ajouter de `limit_req` nginx en plus : une seule source de limites, testée côté backend.
- Recouvrement avec C-12 (`backend/src/i18n/`) : ne pas lancer les deux en parallèle.
- Notes de version : nouvelle variable facultative `API_RATE_LIMIT`, sans action obligatoire. Section « Required actions » de la PR : aucune action, mention de la variable.
- Après l'arrivée sur `main`, relever les alertes `js/missing-rate-limiting` encore ouvertes et les signaler au coordinateur, qui les ferme en « won't fix » (décision ci-dessus).

## Journal

- 2026-11-12 : tâche créée par D-35 (triage CodeQL) pour les alertes #6 à #22, #25 et #26.
