---
id: C-11
title: "Authentification : limitation des essais, révocation des tokens, profil sécurisé"
phase: C
lane: backend
criticite: haute
effort: M
status: done
owner: agent
depends_on: [C-01, C-03]
touches: [backend/src/bootstrap/, backend/src/routes/auth.ts, backend/src/middleware/auth.ts, backend/src/routes/settings.ts, backend/src/app.ts, backend/src/config.ts, backend/prisma/schema.prisma, backend/prisma/migrations/, backend/package.json, backend/package-lock.json, backend/src/test/helpers.ts, backend/src/i18n/, backend/src/validation/settings.ts, backend/AGENTS.md, frontend/src/pages/admin/SettingsPage.tsx, frontend/src/contexts/AuthContext.tsx, frontend/src/services/api.ts]
sources: ["03-security.md §4", "03-security.md §7", "03-security.md §12", "03-security.md §15", "04-tests.md §6"]
branch: feature/C-11-auth-hardening
pr: https://github.com/Lulu300/carta-cocktail/pull/82
---

## Contexte

L'admin est exposé sur Internet en même temps que la carte publique. Rien ne limite les essais de mot de passe, un token volé reste valable 7 jours même après un changement de mot de passe, et l'e-mail de connexion se change sans le mot de passe actuel. Cette tâche durcit l'authentification sans changer de modèle (JWT Bearer stocké dans `localStorage`).

## Problème constaté

- `routes/auth.ts:11` : `POST /login` sans limitation. `app.ts` ne règle pas `trust proxy` : derrière nginx, toutes les requêtes semblent venir du proxy.
- `routes/auth.ts:19-23` : e-mail inconnu → 401 immédiat, sans `bcrypt.compare` : le temps de réponse révèle les e-mails existants.
- `routes/auth.ts:13` : `email` et `password` non typés (réglé par C-04 si elle passe avant).
- `routes/auth.ts:31` : `jwt.sign({ userId }, secret, { expiresIn: '7d' })`, algorithme implicite.
- `middleware/auth.ts:18` : `jwt.verify` sans `algorithms`, sans vérifier que l'utilisateur existe encore ; aucun moyen de révoquer un token.
- `routes/settings.ts:71-73` : `email` modifié sans `currentPassword`. `:74-76` : aucune longueur minimale pour `newPassword`. Aucun contrôle du format d'e-mail.
- Deux règles de mot de passe depuis A-04 : `routes/settings.ts` (`PUT /profile`) hache avec `bcrypt.hash(newPassword, 10)` sans longueur minimale, alors que `bootstrap/ensureAdmin.ts` utilise `BCRYPT_COST = 12` et `MIN_ADMIN_PASSWORD_LENGTH = 12` (constantes non exportées). Un mot de passe changé depuis l'UI est donc plus faible et moins coûteux à casser que celui posé au démarrage.
- `app.ts:29` : `cors()` sans option (`Access-Control-Allow-Origin: *`). `app.ts:30` : `morgan('dev')` en production.
- Tests : `auth.test.ts` ne couvre ni token expiré, ni mauvais secret, ni utilisateur supprimé (revue tests §6).

## Ce qu'il faut faire

1. Limitation des essais : ajouter `express-rate-limit`. Dans `app.ts` :
   ```ts
   app.set('trust proxy', 1);
   const loginLimiter = rateLimit({
     windowMs: 15 * 60_000, limit: config.loginRateLimit, // LOGIN_RATE_LIMIT, défaut 10
     skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false,
     handler: (req, res) => res.status(429).json({ error: req.t('errors.tooManyAttempts') }),
   });
   app.use('/api/auth/login', loginLimiter);
   ```
2. Login : utilisateur inconnu → `await bcrypt.compare(password, DUMMY_HASH)` (hash constant calculé au chargement du module) avant le 401. Signer avec `{ algorithm: 'HS256', expiresIn: config.jwtExpiresIn }` (`JWT_EXPIRES_IN`, défaut `'24h'`).
3. Révocation :
   - `schema.prisma` : `User.tokenVersion Int @default(0)`, puis `npx prisma migrate dev --name user_token_version` ;
   - contenu du JWT : `{ userId, tv: user.tokenVersion }` ;
   - extraire `verifyToken(token): Promise<number | null>` dans `middleware/auth.ts` : `jwt.verify(token, secret, { algorithms: ['HS256'] })`, puis `prisma.user.findUnique({ where: { id }, select: { tokenVersion: true } })` ; `null` si l'utilisateur n'existe pas ou si `tv` est absent ou différent ;
   - `authMiddleware` devient `async` et s'appuie dessus ; l'`optionalAuth` de A-05 aussi ;
   - `POST /api/auth/logout-all` (authentifié) : incrémente `tokenVersion`, répond `{ message }`.
4. Profil (`PUT /api/settings/profile`) :
   - `currentPassword` obligatoire dès que `email` ou `newPassword` change ; mot de passe faux → le statut fixé par A-10 ;
   - `email` au format valide (`errors.invalidEmail`) ; `newPassword` d'au moins 12 caractères (`errors.passwordTooShort`) ;
   - une seule règle de mot de passe : exporter le coût bcrypt et la longueur minimale depuis un seul endroit (par exemple `hashPassword()` et `MIN_PASSWORD_LENGTH` dans `src/bootstrap/password.ts`), utilisés par `ensureAdmin` et par `PUT /profile`. Plus de `bcrypt.hash(…, 10)` ni de `12` recopié dans `settings.ts`. L'exception `NODE_ENV=test` reste propre à `ensureAdmin` (le `ADMIN_PASSWORD` fixe de la suite de tests est court) ; `PUT /profile` applique la longueur minimale sans exception, et les tests de `settings.test.ts` passent à des mots de passe d'au moins 12 caractères (`newpass123`, `newpass456` aujourd'hui) ;
   - si le mot de passe change : incrémenter `tokenVersion` et renvoyer un nouveau token, `{ id, email, token }`.
5. `frontend/src/pages/admin/SettingsPage.tsx:84` : si la réponse contient `token`, le stocker comme au login, pour ne pas déconnecter l'admin qui vient de changer son mot de passe.
6. `app.ts` : `cors({ origin: config.corsOrigin || false })` (`CORS_ORIGIN`, vide par défaut : l'app est same-origin derrière nginx et derrière le proxy Vite en dev) ; `morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev')`.
7. `config.ts` : `loginRateLimit`, `jwtExpiresIn`, `corsOrigin`.
8. `src/test/helpers.ts` : `getAuthToken` signe `{ userId, tv: 0 }` en HS256.
9. Clés i18n : `errors.tooManyAttempts`, `errors.passwordTooShort`, `errors.invalidEmail`, `auth.loggedOutEverywhere`.

## Critères d'acceptation

- [x] 11e échec de login en 15 min depuis une même IP → 429 JSON traduit ; un login réussi ne compte pas.
- [x] Après changement de mot de passe : l'ancien token → 401, le nouveau fonctionne, l'admin reste connecté dans l'UI.
- [x] `POST /api/auth/logout-all` invalide tous les tokens existants.
- [x] Token signé avec un autre secret, expiré, en `alg: none`, ou d'un utilisateur supprimé → 401.
- [x] Changer l'e-mail sans `currentPassword` → refusé.
- [x] `newPassword` de 11 caractères → 400.
- [x] `PUT /settings/profile` et `ensureAdmin` partagent le même coût bcrypt et la même longueur minimale (une seule définition dans le code).
- [x] Plus d'en-tête `Access-Control-Allow-Origin: *`.

## Tests à ajouter ou adapter

- `auth.test.ts` :
  - rate limit avec `LOGIN_RATE_LIMIT=3` : 3 échecs puis 429 ; un succès intercalé ne compte pas ;
  - e-mail inconnu → 401, et `bcrypt.compare` est appelé (`vi.spyOn`), pas de mesure de temps ;
  - token expiré (`expiresIn: -1`), mauvais secret, `alg: none` forgé à la main, utilisateur supprimé, `tv` différent, `tv` absent → 401 ;
  - `logout-all`, puis l'ancien token → 401.
- `settings.test.ts` : e-mail sans mot de passe → refusé ; mot de passe trop court → 400 ; le hash enregistré après changement utilise le coût 12 (`bcrypt.getRounds(hash) === 12`) ; changement de mot de passe → `token` dans la réponse, ancien token 401, nouveau 200.
- `frontend/src/pages/admin/SettingsPage.test.tsx` : le token renvoyé est stocké.
- Les autres tests backend passent avec le `tv: 0` de `helpers.ts`.

## Points d'attention

- **Effet du déploiement** : les tokens émis avant la migration n'ont pas de `tv` et deviennent invalides. L'admin se reconnecte une fois : à annoncer dans la PR.
- Le middleware fait une requête par appel authentifié (clé primaire) : coût négligeable en mono-admin.
- `trust proxy = 1` suppose **un** proxy devant l'API. Tant que le port 3001 est publié (`docker-compose*.yml`), un client peut contourner nginx et forger `X-Forwarded-For`. D-03 retire ce port ; d'ici là, la limite est contournable.
- Le compteur d'`express-rate-limit` est en mémoire : remis à zéro au redémarrage, non partagé entre processus. Suffisant ici.
- **Décisions à confirmer** : durée de vie du token (24 h proposé, 7 j aujourd'hui). Longueur minimale : 12, déjà imposée par A-04 à `ADMIN_PASSWORD` ; elle s'applique aux nouveaux mots de passe seulement (pas de reconnexion forcée pour un mot de passe existant plus court).
- **Validation du token au démarrage** (relevé en revue de A-10) : `frontend/src/contexts/AuthContext.tsx` appelle `/auth/me` puis `.catch(logout)`. Une erreur 5xx ou réseau efface donc le token, alors que seul un 401 devrait le faire (l'API gère déjà le 401 via `setUnauthorizedHandler`). Pour le corriger ici, ajouter ce fichier à `touches` ; sinon, en faire une tâche E.
- Le passage à un cookie `HttpOnly` (sécurité §7) changerait le frontend et imposerait une protection CSRF : hors périmètre.
- Ordre : après C-01 (migration) et C-03 (erreurs), et après A-05 (`optionalAuth`) et A-10 (statut du mauvais mot de passe). Une seule tâche de schéma à la fois (C-07). `package.json` : couloir `deps`. `middleware/auth.ts` est aussi touché par C-12 : enchaîner.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : suivi des revues de la phase A. Alignement de `PUT /settings/profile` (coût bcrypt 10, sans minimum) sur `ensureAdmin` (coût 12, 12 caractères) via une règle partagée ; `backend/src/bootstrap/` ajouté à `touches`. La note d'A-10 sur `.catch(logout)` dans `AuthContext` est bien présente dans les Points d'attention.
- 2026-10-09 : revue de la PR #37. `touches` élargi au dossier `backend/src/bootstrap/` (module partagé du mot de passe) ; l'exception `NODE_ENV=test` reste propre à `ensureAdmin`, et les tests de `settings.test.ts` passent à des mots de passe d'au moins 12 caractères.
- 2026-10-11 : décisions humaines. Durée de vie du token inchangée (7 jours, `JWT_EXPIRES_IN` par défaut `7d`). Reconnexion unique après déploiement non annoncée. Longueur minimale 12 pour les nouveaux mots de passe seulement.
- 2026-10-11 : fait (PR #82). `express-rate-limit` 8.7.0 sur `/api/auth/login` (`trust proxy` 1, 429 via `errorHandler`). `bootstrap/password.ts` : `hashPassword` (coût 12), `MIN_PASSWORD_LENGTH`, `verifyPassword` (comparaison factice pour un e-mail inconnu, hash calculé au premier usage et non au chargement, pour ne pas coûter ~200 ms à chaque fichier de test). Migration `20261011120000_user_token_version` écrite à la main (`ALTER TABLE ADD COLUMN`, Prisma reconstruisait la table), `db:check` sans écart ; appliquée sur une copie temporaire du jeu d'essai réel (3 migrations, 1 utilisateur, 42 cocktails, 149 bouteilles conservés), banc Docker non lancé. `signToken`/`verifyToken` (async) dans `middleware/auth.ts`. Profil : `currentPassword` exigé aussi pour l'e-mail (schéma zod), `errors.invalidEmail`, `errors.passwordTooShort`, nouveau token renvoyé. Frontend : `updateSession(user, token?)` dans `AuthContext` (stocke le token, met à jour l'e-mail), champ mot de passe actuel `required` si l'e-mail ou le mot de passe change. Ajouts à `touches` : `backend/src/validation/settings.ts` (schéma du profil), `frontend/src/contexts/AuthContext.tsx` et `frontend/src/services/api.ts` (stockage du token, type de la réponse), `backend/AGENTS.md` (règles d'auth). Tests du rate limit dans `routes/loginRateLimit.test.ts` (`LOGIN_RATE_LIMIT=3` posé par `vi.hoisted`, une IP `X-Forwarded-For` par test) plutôt que dans `auth.test.ts`, dont les échecs de connexion partagent le compteur. Backend 767 tests, frontend 545 tests, couverture des lignes modifiées 100 % des deux côtés. Restaurer une sauvegarde antérieure à la migration donne des 500 sur la connexion jusqu'au redémarrage (limite connue, voir C-22). Nouvelles tâches : C-25 (bouton « Se déconnecter partout », `.catch(logout)` d'`AuthContext`), C-27 (documentation des trois variables, `README.md` et `.env.example` étant pris par D-13).
- 2026-10-11 : banc de mise à jour sur l'image construite depuis la PR (head 4d7cce1), chemin 1.4.0 → 1.10.0 → local (suit les notes v1.11.0), jeu d'essai réel : layouts `friend` et `official`, modes naïf et conforme : OK (seuls les échecs déjà attendus aux étapes précédentes, photos du mode naïf). Démarrage, migration appliquée (3 migrations), connexion admin et `/auth/me` en 200 après chaque saut, aucune ligne perdue.
- 2026-10-11 : suites de la revue de la PR #82 (décisions humaines). (1) `trust proxy` par défaut `loopback, linklocal, uniquelocal` et nouvelle variable `TRUST_PROXY` (nombre de sauts ou liste Express, validée au démarrage) : derrière SWAG puis nginx, chaque client a son compteur ; une adresse forgée par un client d'Internet reste ignorée ; ajoutée à C-27. (2) Restauration d'une sauvegarde antérieure : C-22 passe en criticité `haute`, prérequis de la release qui livre C-11 ; ligne ajoutée aux notes de version suggérées de la PR. (3) `needsRehash()` dans `password.ts` : un login réussi refait au coût 12 un hash d'un autre coût (le hash coût 10 d'une instance réelle rendait la comparaison d'un e-mail connu plus rapide que la comparaison factice). (4) `schema.prisma` réduit au seul changement de `User`. (5) Ligne ajoutée à C-25 sur les tokens révoqués que ramène une restauration. Branche rebasée sur `develop` (E-05 partie 1).
- 2026-10-11 : deuxième revue de la PR #82. Décision humaine : le défaut `loopback, linklocal, uniquelocal` est confirmé en connaissance de cause. Là où le premier proxy voit un client d'Internet sous une adresse privée (Docker rootless ou Podman, IPv6 relayé par `docker-proxy` sans IPv6 dans le démon, Docker Desktop), la limite est contournable (adresse forgée dans `X-Forwarded-For`), comme sur `develop` avant C-11 ; `TRUST_PROXY=1`, ou `2` derrière SWAG, y donne un compteur partagé à la place. Texte de la PR et paragraphe `TRUST_PROXY` de C-27 corrigés. Un échec d'écriture du rehash est journalisé (`console.warn`) et ne fait plus échouer une connexion correcte (test ajouté). Branche rebasée sur `develop` (E-05 partie 2, frontend seulement : banc non relancé).
