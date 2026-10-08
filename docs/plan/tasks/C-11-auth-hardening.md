---
id: C-11
title: "Authentification : limitation des essais, révocation des tokens, profil sécurisé"
phase: C
lane: backend
criticite: haute
effort: M
status: todo
owner: agent
depends_on: [C-01, C-03]
touches: [backend/src/routes/auth.ts, backend/src/middleware/auth.ts, backend/src/routes/settings.ts, backend/src/app.ts, backend/src/config.ts, backend/prisma/schema.prisma, backend/prisma/migrations/, backend/package.json, backend/package-lock.json, backend/src/test/helpers.ts, backend/src/i18n/, frontend/src/pages/admin/SettingsPage.tsx]
sources: ["03-security.md §4", "03-security.md §7", "03-security.md §12", "03-security.md §15", "04-tests.md §6"]
branch:
pr:
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
   - si le mot de passe change : incrémenter `tokenVersion` et renvoyer un nouveau token, `{ id, email, token }`.
5. `frontend/src/pages/admin/SettingsPage.tsx:84` : si la réponse contient `token`, le stocker comme au login, pour ne pas déconnecter l'admin qui vient de changer son mot de passe.
6. `app.ts` : `cors({ origin: config.corsOrigin || false })` (`CORS_ORIGIN`, vide par défaut : l'app est same-origin derrière nginx et derrière le proxy Vite en dev) ; `morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev')`.
7. `config.ts` : `loginRateLimit`, `jwtExpiresIn`, `corsOrigin`.
8. `src/test/helpers.ts` : `getAuthToken` signe `{ userId, tv: 0 }` en HS256.
9. Clés i18n : `errors.tooManyAttempts`, `errors.passwordTooShort`, `errors.invalidEmail`, `auth.loggedOutEverywhere`.

## Critères d'acceptation

- [ ] 11e échec de login en 15 min depuis une même IP → 429 JSON traduit ; un login réussi ne compte pas.
- [ ] Après changement de mot de passe : l'ancien token → 401, le nouveau fonctionne, l'admin reste connecté dans l'UI.
- [ ] `POST /api/auth/logout-all` invalide tous les tokens existants.
- [ ] Token signé avec un autre secret, expiré, en `alg: none`, ou d'un utilisateur supprimé → 401.
- [ ] Changer l'e-mail sans `currentPassword` → refusé.
- [ ] `newPassword` de 11 caractères → 400.
- [ ] Plus d'en-tête `Access-Control-Allow-Origin: *`.

## Tests à ajouter ou adapter

- `auth.test.ts` :
  - rate limit avec `LOGIN_RATE_LIMIT=3` : 3 échecs puis 429 ; un succès intercalé ne compte pas ;
  - e-mail inconnu → 401, et `bcrypt.compare` est appelé (`vi.spyOn`), pas de mesure de temps ;
  - token expiré (`expiresIn: -1`), mauvais secret, `alg: none` forgé à la main, utilisateur supprimé, `tv` différent, `tv` absent → 401 ;
  - `logout-all`, puis l'ancien token → 401.
- `settings.test.ts` : e-mail sans mot de passe → refusé ; mot de passe trop court → 400 ; changement de mot de passe → `token` dans la réponse, ancien token 401, nouveau 200.
- `frontend/src/pages/admin/SettingsPage.test.tsx` : le token renvoyé est stocké.
- Les autres tests backend passent avec le `tv: 0` de `helpers.ts`.

## Points d'attention

- **Effet du déploiement** : les tokens émis avant la migration n'ont pas de `tv` et deviennent invalides. L'admin se reconnecte une fois : à annoncer dans la PR.
- Le middleware fait une requête par appel authentifié (clé primaire) : coût négligeable en mono-admin.
- `trust proxy = 1` suppose **un** proxy devant l'API. Tant que le port 3001 est publié (`docker-compose*.yml`), un client peut contourner nginx et forger `X-Forwarded-For`. D-03 retire ce port ; d'ici là, la limite est contournable.
- Le compteur d'`express-rate-limit` est en mémoire : remis à zéro au redémarrage, non partagé entre processus. Suffisant ici.
- **Décisions à confirmer** : durée de vie du token (24 h proposé, 7 j aujourd'hui) ; longueur minimale (12 proposé, appliquée aux nouveaux mots de passe seulement).
- Le passage à un cookie `HttpOnly` (sécurité §7) changerait le frontend et imposerait une protection CSRF : hors périmètre.
- Ordre : après C-01 (migration) et C-03 (erreurs), et après A-05 (`optionalAuth`) et A-10 (statut du mauvais mot de passe). Une seule tâche de schéma à la fois (C-07). `package.json` : couloir `deps`. `middleware/auth.ts` est aussi touché par C-12 : enchaîner.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
