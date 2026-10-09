# Revue sécurité : Carta Cocktail

**Périmètre :** backend Express 5 (`backend/src/**`, `prisma/seed.ts`), frontend React (`frontend/src/**`), nginx (`frontend/nginx.conf*`), Dockerfiles, `docker-compose*.yml`, `.env.example`, workflows CI, dépendances (`npm audit --omit=dev`).
**Méthode :** lecture du code en lecture seule, recherche de secrets dans les fichiers suivis et dans l'historique git, `npm audit --omit=dev --json` sur les deux packages.
**Niveau de risque global : ÉLEVÉ** si l'instance est déployée avec la configuration par défaut et exposée sur Internet. Si les secrets sont personnalisés, le risque descend à MOYEN, surtout à cause des fuites de données des routes publiques.

## Synthèse

| # | Sévérité | Constat | Emplacement |
|---|---|---|---|
| 1 | Critique | JWT_SECRET par défaut connu publiquement : n'importe qui peut forger un token admin | `backend/src/config.ts:8`, `docker-compose.yml:10`, `docker-compose.prod.yml:8` |
| 2 | Haute | Le seed remet le mot de passe admin à `admin123` à chaque démarrage du conteneur | `backend/Dockerfile:18`, `backend/prisma/seed.ts:8-15`, `docker-compose*.yml` |
| 3 | Haute | Contournement du contrôle `isPublic` : il suffit d'envoyer n'importe quel en-tête `Authorization` | `backend/src/routes/public.ts:72-80` |
| 4 | Haute | Aucune limite de débit ni verrouillage sur `/api/auth/login` | `backend/src/routes/auth.ts:11`, `backend/src/app.ts` |
| 5 | Moyenne | Fuite de données par les routes publiques : tous les cocktails par ID, `notes`, éléments `isHidden`, `purchasePrice`, `openedAt` | `backend/src/routes/public.ts:31-65, 106-123, 206-230` |
| 6 | Moyenne | Import de backup : fichiers arbitraires (.html/.svg/.js) servis sur la même origine (XSS stockée), base non validée, zip bomb | `backend/src/routes/backup.ts:12-15, 82-142` |
| 7 | Moyenne | Token JWT de 7 jours dans `localStorage`, aucune révocation, pas de CSP côté SPA | `frontend/src/contexts/AuthContext.tsx:17,34`, `backend/src/routes/auth.ts:31` |
| 8 | Moyenne | nginx ne pose aucun en-tête de sécurité (CSP, X-Frame-Options, HSTS, nosniff) | `frontend/nginx.conf.template:1-35` |
| 9 | Moyenne | Dépendances vulnérables : i18next-http-middleware (critique), adm-zip, multer, path-to-regexp, react-router… | `backend/package.json`, `frontend/package.json` |
| 10 | Moyenne | Backend publié directement sur l'hôte (3001), ce qui contourne nginx | `docker-compose.yml:6-7`, `docker-compose.prod.yml:4-5` |
| 11 | Basse | Conteneurs exécutés en root, image Node 20 en fin de vie | `backend/Dockerfile:1-18`, `frontend/Dockerfile:1` |
| 12 | Basse | Changement d'e-mail sans mot de passe actuel, pas de politique de mot de passe | `backend/src/routes/settings.ts:47-82` |
| 13 | Basse | Upload d'image : regex non ancrée, aucune vérification des magic bytes, fichiers orphelins | `backend/src/routes/cocktails.ts:32-41, 580-608` |
| 14 | Basse | Mass assignment `...rest` dans l'import de cocktail | `backend/src/routes/cocktails.ts:288-289, 307-308, 325-327, 341-342` |
| 15 | Basse | CORS `*`, morgan `dev` en production, énumération d'e-mail par timing | `backend/src/app.ts:29-30`, `backend/src/routes/auth.ts:19-29` |
| 16 | Info | Favicon : interpolation du `siteIcon` dans un SVG (pas exploitable, mais fragile) | `frontend/src/contexts/SiteSettingsContext.tsx:42` |

---

## 1. [CRITIQUE] Secret JWT par défaut connu publiquement

**Catégorie :** A02 Cryptographic Failures / A07 Identification & Authentication Failures
**Emplacement :**
- `backend/src/config.ts:8` : `jwtSecret: process.env.JWT_SECRET || 'default-secret'`
- `docker-compose.yml:10` et `docker-compose.prod.yml:8` : `JWT_SECRET=${JWT_SECRET:-change-me-to-a-random-secret}`
- `README.md:148` documente cette valeur par défaut.

**Exploitabilité :** à distance, sans authentification, triviale.
**Impact :** contrôle admin complet. L'attaquant peut lire et modifier toutes les données, télécharger `/api/backup/export` (la base complète, hash bcrypt inclus), écraser la base avec `/api/backup/import` et déposer des fichiers dans `/uploads` (voir #6).

**Scénario :** l'utilisateur lance `docker compose -f docker-compose.prod.yml up -d` sans `.env`, ce que le README rend tout à fait possible. Un attaquant exécute :
```js
require('jsonwebtoken').sign({ userId: 1 }, 'change-me-to-a-random-secret')
```
puis envoie `Authorization: Bearer <token>` vers n'importe quelle route protégée. Rien n'avertit l'utilisateur.

**Correctif :** refuser de démarrer sans secret fort et retirer les valeurs par défaut du compose.
```ts
// BAD
jwtSecret: process.env.JWT_SECRET || 'default-secret',

// GOOD (config.ts)
const jwtSecret = process.env.JWT_SECRET;
const WEAK = new Set(['default-secret', 'change-me-to-a-random-secret', 'your-random-secret']);
if (process.env.NODE_ENV !== 'test' && (!jwtSecret || jwtSecret.length < 32 || WEAK.has(jwtSecret))) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 chars (openssl rand -hex 32)');
}
export const config = { jwtSecret: jwtSecret!, /* ... */ };
```
```yaml
# docker-compose*.yml : variable obligatoire, sans valeur par défaut
- JWT_SECRET=${JWT_SECRET:?JWT_SECRET must be set}
```
Autre option : générer un secret aléatoire au premier démarrage et le stocker dans le volume `db-data`. Il faut aussi épingler l'algorithme : `jwt.verify(token, secret, { algorithms: ['HS256'] })` (`middleware/auth.ts:18`).

---

## 2. [HAUTE] Le mot de passe admin revient à `admin123` à chaque redémarrage

**Catégorie :** A07 / A05 Security Misconfiguration
**Emplacement :**
- `backend/Dockerfile:18` : `CMD ... npx prisma db push --accept-data-loss && npm run db:seed && npm start`
- `backend/prisma/seed.ts:8-15` : si un admin existe, son `email` et son `passwordHash` sont **écrasés** par `ADMIN_EMAIL`/`ADMIN_PASSWORD`, avec `admin123` comme repli.
- `docker-compose*.yml:12/10` : `ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123}`, et `backend/src/config.ts:10`.

**Scénario :** l'admin change son mot de passe dans Réglages > Profil (`settings.ts:47`) et pense être protégé. Au prochain redémarrage (mise à jour d'image, reboot du NAS, `restart: unless-stopped`), le seed remet `admin@carta.local` / `admin123`, identifiants documentés dans `README.md:57` et `AGENTS.md`. N'importe qui peut alors se connecter. Le changement de mot de passe dans l'UI donne donc une fausse impression de sécurité.

**Correctif :** ne créer l'admin que s'il n'existe pas encore, et refuser les valeurs par défaut.
```ts
// BAD (seed.ts)
if (existingAdmin) {
  await prisma.user.update({ where: { id: existingAdmin.id }, data: { email: adminEmail, passwordHash } });
}

// GOOD
const existingAdmin = await prisma.user.findFirst();
if (!existingAdmin) {
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd || pwd === 'admin123' || pwd.length < 12) {
    throw new Error('ADMIN_PASSWORD must be set (>= 12 chars) for the initial admin');
  }
  await prisma.user.create({ data: { email: adminEmail, passwordHash: await bcrypt.hash(pwd, 12) } });
}
// Réinitialisation explicite seulement si ADMIN_RESET_PASSWORD=true
```
Dans le compose, utiliser `ADMIN_PASSWORD=${ADMIN_PASSWORD:?...}`. Sans lien direct avec la sécurité : `prisma db push --accept-data-loss` au démarrage peut supprimer des colonnes lors d'une mise à jour de schéma. Mieux vaut passer à `prisma migrate deploy`.

---

## 3. [HAUTE] Contournement de `isPublic` sur `/api/public/menus/:slug`

**Catégorie :** A01 Broken Access Control
**Emplacement :** `backend/src/routes/public.ts:72-80`
```ts
const token = req.headers.authorization?.replace('Bearer ', '');
const isAdmin = !!token; // If there's a token, user is logged in (admin)
if (!menu.isPublic && !isAdmin) { 404 }
```
Le token n'est **jamais vérifié** : n'importe quelle chaîne non vide suffit.

**Scénario :**
```
curl -H 'Authorization: x' https://bar.example/api/public/menus/menu-secret
```
renvoie un menu non publié avec toutes ses recettes et ses bouteilles. Les slugs se devinent facilement (`aperitifs`, `digestifs`, ou le nom du menu, puisque `menus.ts:77` dérive le slug du nom).

**Correctif :**
```ts
import jwt from 'jsonwebtoken';
import { config } from '../config';

function isValidAdmin(req: Request): boolean {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return false;
  try { jwt.verify(h.slice(7), config.jwtSecret, { algorithms: ['HS256'] }); return true; }
  catch { return false; }
}
// ...
const isAdmin = isValidAdmin(req);
```
Le mieux reste de factoriser un `optionalAuth` dans `middleware/auth.ts` et de l'utiliser sur toutes les routes publiques qui ont un mode « aperçu admin ».

---

## 4. [HAUTE] Aucune protection contre le brute-force du login

**Catégorie :** A07
**Emplacement :** `backend/src/routes/auth.ts:11`. Aucun `express-rate-limit` ni `limit_req` nginx. `trust proxy` n'est pas réglé (`app.ts`).

**Scénario :** l'interface est exposée sur Internet pour le menu public, et `/login` avec elle. bcrypt à coût 10 laisse passer quelques centaines d'essais par seconde en parallèle, rien ne bloque, et l'e-mail par défaut est connu (`admin@carta.local`). Avec #2, l'attaque n'a même pas besoin d'être un brute-force.

**Correctif (backend) :**
```ts
import rateLimit from 'express-rate-limit';
app.set('trust proxy', 1); // derrière nginx
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });
app.use('/api/auth/login', loginLimiter);
```
**Ou côté nginx :**
```nginx
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
location = /api/auth/login { limit_req zone=login burst=5 nodelay; proxy_pass http://${BACKEND_HOST}:3001/api/auth/login; }
```
Ce contrôle n'a de sens que si le port 3001 n'est plus publié (voir #10).

---

## 5. [MOYENNE] Fuites de données par les routes publiques

**Catégorie :** A01 / A04 Insecure Design (filtrage de confidentialité fait uniquement côté client)
**Emplacements et données exposées :**
- `public.ts:206-230` `GET /api/public/cocktails/:id` et `public.ts:106-187` `.../export` : **aucune vérification** que le cocktail figure dans un menu public. Une boucle sur `id=1..N` récupère toutes les recettes, y compris les brouillons et les recettes « secrètes ».
- Ces réponses incluent `notes`, que `CocktailPublicPage.tsx:84` ne cache qu'au rendu (`user && cocktail.notes`), les `preferredBottles` (cachées seulement côté client, l.111) et les objets `bottle` complets : `purchasePrice`, `openedAt`, `remainingPercent`, `location`.
- `public.ts:39-63` `GET /api/public/menus/:slug` : les `MenuCocktail`/`MenuBottle` marqués `isHidden` sont renvoyés. Le filtre n'existe que dans `MenuPublicPage.tsx:185,211`. Les bouteilles incluent aussi `purchasePrice`.
- `public.ts:44` : `include: { bottle: true }` renvoie toutes les colonnes Prisma.

**Scénario :** un visiteur du menu public ouvre l'onglet réseau et voit les prix d'achat et l'état du stock. Un script énumère `/api/public/cocktails/1..500` et récupère les recettes non publiées et les notes privées.

**Correctif :** filtrer côté serveur et utiliser des `select` explicites.
```ts
// GOOD : cocktail public seulement s'il est visible dans un menu public
const cocktail = await prisma.cocktail.findFirst({
  where: { id, menuCocktails: { some: { isHidden: false, menu: { isPublic: true } } } },
  select: {
    id: true, name: true, description: true, imagePath: true, tags: true,
    ingredients: { select: { quantity: true, sourceType: true, position: true,
      unit: true, category: { select: { id: true, name: true, nameTranslations: true, type: true } },
      ingredient: { select: { id: true, name: true, nameTranslations: true, icon: true } },
      bottle: { select: { id: true, name: true, alcoholPercentage: true } } },
      orderBy: { position: 'asc' } },
    instructions: { orderBy: { stepNumber: 'asc' } },
  },
});
// Menu : where: { isHidden: false } sur cocktails et bottles (sauf aperçu admin authentifié)
// bottle: { select: { id, name, alcoholPercentage, location?, category: {...} } } : jamais purchasePrice/openedAt
```
Les `notes` et `preferredBottles` ne doivent être renvoyées que si `optionalAuth` a validé le JWT.

---

## 6. [MOYENNE] Import de backup : XSS stockée, base non validée, déni de service

**Catégorie :** A08 Software & Data Integrity Failures / A03 (XSS)
**Emplacement :** `backend/src/routes/backup.ts`
- l.12-15 : `memoryStorage` avec une limite de **500 Mo** en RAM, puis `AdmZip(req.file.buffer)` et `getData()` décompressent tout en mémoire, sans contrôle de taille décompressée (zip bomb, crash OOM). adm-zip 0.5.16 a des CVE précises sur ce point (voir #9).
- l.116 : `fs.writeFileSync(dbPath, dbEntry.getData())` écrase la base SQLite **pendant que Prisma la tient ouverte**, sans vérifier l'en-tête `SQLite format 3\0`, l'intégrité ni le schéma. Risque de corruption et de base incohérente.
- l.125-129 : `unlinkSync` sur chaque entrée de `uploads/`. S'il s'y trouve un sous-dossier, une exception est levée **après** l'écrasement de la base, ce qui laisse un état partiel.
- l.135-141 : `path.basename()` empêche bien le path traversal. En revanche, **aucune extension n'est filtrée** : `uploads/evil.html`, `uploads/evil.svg` et `uploads/x.js` sont écrits puis servis par `express.static` (`app.ts:35`) via nginx sur **la même origine que la SPA**. La CSP par défaut de helmet (`script-src 'self'`) bloque le script inline, mais pas `<script src="/uploads/x.js">`. Le script peut alors lire `localStorage.token` (#7).
- Chaînage : une base importée peut contenir `Cocktail.imagePath = '../data/carta_cocktail.db'`. Supprimer ce cocktail exécute alors `path.join(uploadDir, imagePath)` puis `unlinkSync` (`cocktails.ts:566-568, 592-594`), soit une suppression de fichier arbitraire.

**Exploitabilité :** il faut un admin authentifié, ou un admin poussé par ingénierie sociale à importer une « sauvegarde » partagée. C'est réaliste pour une app de partage de recettes.

**Correctif :**
```ts
// 1. Limite raisonnable + stockage disque temporaire
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 100 * 1024 * 1024, files: 1 } });

// 2. Liste blanche d'extensions et limite de taille décompressée
const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp']);
let total = 0;
for (const e of entries) {
  total += e.header.size;
  if (total > 200 * 1024 * 1024) throw new Error('Backup too large');
}
// ...
const fileName = path.basename(entry.entryName);
if (!ALLOWED.has(path.extname(fileName).toLowerCase())) continue;

// 3. Valider la DB avant remplacement
const buf = dbEntry.getData();
if (buf.subarray(0, 16).toString('latin1') !== 'SQLite format 3\u0000') throw new Error('invalid db');
// écrire dans un fichier temporaire, ouvrir avec une connexion séparée, PRAGMA integrity_check,
// vérifier les tables attendues, puis prisma.$disconnect(), fs.renameSync(tmp, dbPath) atomique, reconnect.

// 4. Toujours confiner les chemins d'images
const safe = path.basename(cocktail.imagePath);
const p = path.join(config.uploadDir, safe);
```
Il faut aussi servir `/uploads` avec `Content-Disposition: attachment` ou une CSP `default-src 'none'` dédiée :
```ts
app.use('/uploads', (req, res, next) => { res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox"); next(); }, express.static(config.uploadDir, { dotfiles: 'deny' }));
```
Remarque fonctionnelle : nginx garde le `client_max_body_size` par défaut (1 Mo). Tout backup ou image de plus de 1 Mo est rejeté en 413 avant d'atteindre Express, malgré les limites multer (500 Mo et 5 Mo).

---

## 7. [MOYENNE] Gestion du token côté client

**Catégorie :** A07
**Emplacement :** `frontend/src/contexts/AuthContext.tsx:17,34`, `frontend/src/services/api.ts:12,97,270,290`, `backend/src/routes/auth.ts:31` (`expiresIn: '7d'`), `settings.ts:62-76`.
- JWT valable 7 jours dans `localStorage`, donc lisible par n'importe quelle XSS (#6) ou dépendance compromise.
- `logout` est purement client (`AuthContext.tsx:39-43`) : un token volé reste valide 7 jours.
- Changer le mot de passe ne révoque pas les tokens existants.
- Aucune CSP sur la SPA (#8) : rien ne vient limiter l'impact d'une XSS.

**Correctif (proportionné à une app mono-admin) :** ajouter un champ `tokenVersion Int @default(0)` sur `User`, l'inclure dans le JWT, le vérifier dans `authMiddleware`, et l'incrémenter au changement de mot de passe et au « logout partout ». Réduire `expiresIn` (12-24 h). L'idéal est un cookie `HttpOnly; Secure; SameSite=Strict`, l'app étant same-origin derrière nginx.
```ts
// auth.ts
const token = jwt.sign({ userId: user.id, tv: user.tokenVersion }, config.jwtSecret, { expiresIn: '12h', algorithm: 'HS256' });
// middleware/auth.ts
const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as { userId: number; tv: number };
const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { tokenVersion: true } });
if (!user || user.tokenVersion !== decoded.tv) return res.status(401).json({ error: 'Invalid token' });
```

---

## 8. [MOYENNE] nginx sans en-têtes de sécurité

**Emplacement :** `frontend/nginx.conf.template:1-35` (et `nginx.conf`). helmet (`app.ts:28`) ne protège que les réponses de l'API. `index.html` et les assets servis par nginx n'ont ni CSP, ni `X-Frame-Options`/`frame-ancestors` (clickjacking de l'admin), ni `X-Content-Type-Options`, ni `Referrer-Policy`, ni HSTS. `server_tokens` reste actif.

**Correctif :**
```nginx
server_tokens off;
client_max_body_size 20m;   # cohérent avec les limites multer
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
# add_header Strict-Transport-Security "max-age=31536000" always;  # si TLS terminé ici ou en amont
```
Attention : un `add_header` placé dans un `location` (cache des assets, l.31-34) annule ceux du niveau `server`. Il faut les répéter, ou passer par un `include` commun. `img-src data:` est nécessaire pour le favicon SVG en data-URI.

---

## 9. [MOYENNE] Dépendances vulnérables (`npm audit --omit=dev`)

**Backend : 11 vulnérabilités (2 critiques, 6 hautes, 2 modérées, 1 basse)**

| Paquet (installé) | Sévérité | Pertinence ici |
|---|---|---|
| `i18next-http-middleware` 3.9.2 (≤3.9.6) | Critique | Middleware global, joignable **sans auth** via `?lng=`, cookie et `Accept-Language`. Path traversal/SSRF non applicables (ressources inline, pas de backend loader), mais pollution de prototype et soucis de `Content-Language` possibles. **Mettre à jour en priorité.** |
| `proxy-addr` (via express) | Critique | Non exploitable : `trust proxy` n'est pas activé. Le devient si on l'active pour le rate limiting (#4). Mettre à jour. |
| `adm-zip` 0.5.16 (≤0.6.0) | Haute | Bombes de décompression et allocation de 4 Go dans `backup.ts` et `bottlesImport.ts`, routes admin uniquement. Le symlink overwrite ne s'applique pas (pas de `extractAllTo`). |
| `multer` 2.0.2 (≤2.2.0) | Haute | DoS. Routes multer derrière `authMiddleware`, donc admin uniquement. |
| `path-to-regexp` 8.3.0 | Haute | ReDoS limité aux motifs avec groupes optionnels ou wildcards multiples, absents ici. Faible. |
| `lodash`, `minimatch`, `brace-expansion` | Haute | Transitifs, pas d'entrée utilisateur identifiée. |
| `morgan` 1.10.1 | Modérée | Log forging. |
| `qs`, `body-parser` | Modérée/Basse | `urlencoded` n'est pas utilisé, impact faible. |

**Frontend : 2 vulnérabilités hautes.** `react-router`/`react-router-dom` 7.13.0 (≤7.18.1). La plupart des CVE visent le mode framework/SSR/RSC, non utilisé ici (SPA). Les open redirects via `<Link>`/`useNavigate` restent à corriger par la mise à jour.

**Correctif :** `npm update i18next-http-middleware adm-zip multer morgan express` dans `backend/`, `npm i react-router-dom@latest` dans `frontend/`, puis `npm audit` dans la CI (`npm audit --omit=dev --audit-level=high`). Autre remarque : `@prisma/client` est en `devDependencies` alors qu'il sert au runtime. Ça fonctionne aujourd'hui parce que le Dockerfile installe les devDeps, mais l'image en contient beaucoup trop (tsx, vitest…), ce qui élargit la surface d'attaque. Mieux vaut un build multi-stage avec `npm ci --omit=dev`.

---

## 10. [MOYENNE] Backend exposé directement sur l'hôte

**Emplacement :** `docker-compose.yml:6-7`, `docker-compose.prod.yml:4-5` : `ports: "3001:3001"`.
Le backend est joignable sans passer par nginx, donc en contournant tout rate limiting et tout en-tête ajouté côté nginx. Le frontend accède déjà au backend par le réseau Docker interne.
**Correctif :** supprimer `ports` du backend, ou utiliser `"127.0.0.1:3001:3001"`, ou `expose: ["3001"]`.

---

## 11. [BASSE] Conteneurs en root, image Node en fin de vie

- `backend/Dockerfile` n'a pas de directive `USER`, donc le processus Node tourne en root. Combiné aux écritures de fichiers de #6, une compromission donne root dans le conteneur. Ajouter `RUN chown -R node:node /app` puis `USER node`.
- `node:20-alpine` : Node 20 est en fin de vie depuis avril 2026 et ne reçoit plus de correctifs de sécurité. La CI tourne déjà sur Node 24 (`ci.yml:24,74`). Passer à `node:24-alpine` dans les deux Dockerfiles.
- Frontend : envisager `nginxinc/nginx-unprivileged`.
- Les actions GitHub sont épinglées par tag (`@v5`, `@v3`) plutôt que par SHA, ce qui est mineur.

Hors sécurité, mais important : `config.uploadDir = path.resolve(__dirname, '../../uploads')` (`config.ts:11`) donne `/uploads` en production (`__dirname` vaut `/app/dist`), alors que le volume est monté sur `/app/uploads`. Les images ne sont donc **pas persistées** et disparaissent quand le conteneur est recréé. À vérifier.

---

## 12. [BASSE] Profil admin

`backend/src/routes/settings.ts:47-82` :
- l'e-mail (l'identifiant de connexion) se change **sans le mot de passe actuel**. Avec un token volé, un attaquant peut modifier l'identité du compte. Exiger `currentPassword` pour tout changement.
- aucune longueur minimale pour `newPassword` (une chaîne d'un caractère passe). Imposer au moins 12 caractères.
- aucune validation du format de l'e-mail.

---

## 13. [BASSE] Upload d'image de cocktail

`backend/src/routes/cocktails.ts:32-41` :
- `/jpeg|jpg|png|webp/` n'est pas ancrée. `.xjpg` ou `image/png-whatever` passent. Le MIME et l'extension viennent du client.
- le contenu n'est pas vérifié (magic bytes), donc un polyglotte HTML/PNG passe. Il n'est pas exécuté grâce au `nosniff` de helmet et au type `image/png`, d'où l'impact faible.
- l.580-601 : si l'`id` n'existe pas, le fichier reste écrit sur disque (orphelin) et Prisma lève une erreur 500.

**Correctif :**
```ts
const ALLOWED = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' } as const;
fileFilter: (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase() as keyof typeof ALLOWED;
  cb(null, ALLOWED[ext] === file.mimetype);
},
filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
// Vérifier ensuite l'existence du cocktail avant/après upload, et supprimer req.file.path en cas d'erreur.
// Option : vérifier les magic bytes (package file-type) ou ré-encoder avec sharp.
```

---

## 14. [BASSE] Mass assignment dans l'import de cocktail

`backend/src/routes/cocktails.ts:288-289, 307-308, 325-327, 341-342` : `r.data` est étalé tel quel dans `tx.unit.create`, `tx.category.create`, `tx.bottle.create` et `tx.ingredient.create`. On peut donc forcer `id`, `createdAt`, `purchasePrice`… Le risque reste limité à l'admin, mais l'import traite des fichiers JSON venus de tiers et le frontend transmet `resolutions` presque tels quels.
**Correctif :** sélectionner explicitement les champs, comme le fait déjà `bottles.ts:190-198` :
```ts
const { name, abbreviation, conversionFactorToMl, nameTranslations } = r.data;
await tx.unit.create({ data: { name: String(name), abbreviation: String(abbreviation),
  conversionFactorToMl: typeof conversionFactorToMl === 'number' ? conversionFactorToMl : null,
  nameTranslations: nameTranslations ? JSON.stringify(nameTranslations) : null } });
```
Plus largement, aucune route n'utilise de schéma de validation (zod/valibot). Les types incorrects finissent en erreurs Prisma 500 au lieu de 400.

---

## 15. [BASSE] Divers backend

- `app.ts:29` : `cors()` sans options renvoie `Access-Control-Allow-Origin: *`. Peu d'impact, puisque l'authentification passe par un en-tête Bearer et non par des cookies, et que l'app est same-origin. À restreindre (`cors({ origin: false })` ou l'origine du site).
- `app.ts:30` : `morgan('dev')` en production. Préférer `combined` et ne pas journaliser les en-têtes `Authorization`.
- `auth.ts:19-29` : bcrypt n'est pas exécuté quand l'e-mail est inconnu. La différence de temps de réponse permet d'énumérer les e-mails. Exécuter un `bcrypt.compare` factice avec un hash constant.
- `auth.ts:13` : `email` et `password` ne sont pas contrôlés en type. `{ "email": { ... } }` provoque une erreur Prisma 500. Ajouter `typeof email === 'string'`.
- `index.ts` : aucun gestionnaire `unhandledRejection` ni d'arrêt propre. Mineur.

---

## 16. [INFO] Favicon

`frontend/src/contexts/SiteSettingsContext.tsx:42` interpole `siteIcon` dans un SVG sans échappement. Ce n'est pas exploitable : un SVG chargé comme favicon via `<link rel=icon>` n'exécute pas de script, et seul l'admin définit cette valeur. Un `<` ou un `&` casse simplement l'icône. Échapper `& < > "` ou limiter `siteIcon` à un graphème emoji côté backend (`settings.ts:26`).

---

## Ce qui est bien fait

- **Pas d'injection SQL** : tout passe par Prisma en requêtes paramétrées, sans aucun `$queryRaw` ni `$executeRaw`.
- **Mots de passe hachés avec bcrypt** (`auth.ts:25`, `settings.ts:75`). Le login renvoie le même message d'erreur pour un e-mail inconnu et un mot de passe faux.
- **jsonwebtoken 9.x** rejette `alg: none` par défaut. Le middleware vérifie bien la signature (`middleware/auth.ts:18`).
- **Toutes les routes d'écriture sont protégées** au montage (`app.ts:42-54`). multer s'exécute *après* `authMiddleware`, donc aucun upload anonyme n'est possible.
- **helmet est activé** sur l'API, avec `nosniff` et une CSP par défaut sur `/uploads`.
- **`express.json()`** garde sa limite par défaut de 100 ko.
- **Backup** : `path.basename()` sur les entrées du zip (pas de zip-slip), et `extractAllTo` n'est pas utilisé.
- **Import de bouteilles** : sélection explicite des champs (`bottles.ts:190-198`), contrairement à l'import de cocktails.
- **Frontend** : aucun `dangerouslySetInnerHTML`, `innerHTML` ni `eval`. React échappe tous les noms et traductions. Les liens externes ont `rel="noopener noreferrer"`.
- **Secrets** : `.env` est ignoré par git, aucun secret réel trouvé dans les fichiers suivis ni dans l'historique (les seules occurrences sont des placeholders du README et de `.env.example`).
- **CI** : `pull_request` (et non `pull_request_target`), `GITHUB_TOKEN` limité au workflow de release.
- **Messages d'erreur génériques** côté API, sans stack trace renvoyée au client.

## Ordre de correction recommandé

1. #1 et #2 : secrets et mot de passe obligatoires, seed non destructif. Corriger avant toute exposition Internet.
2. #3 et #5 : vérifier vraiment le JWT dans les routes publiques, filtrer `isHidden`, `isPublic` et les champs sensibles côté serveur.
3. #4 et #10 : rate limiting sur le login, ne plus publier le port 3001.
4. #9 : mise à jour des dépendances, en commençant par i18next-http-middleware.
5. #6, #7, #8 : durcir le backup, révoquer les tokens, ajouter les en-têtes nginx.
6. Les points de sévérité basse au fil de l'eau.

## Checklist

- [ ] Aucun secret codé en dur : **non**. Valeurs par défaut `default-secret`, `change-me-to-a-random-secret`, `admin123` dans le code et le compose.
- [ ] Toutes les entrées validées : **non**. Aucun schéma, mass assignment dans l'import de cocktail.
- [x] Prévention des injections : oui (Prisma, React).
- [ ] Authentification/autorisation vérifiées : **non**. Contournement dans `public.ts`, pas de rate limiting, pas de révocation.
- [x] Dépendances auditées : fait. 11 vulnérabilités backend, 2 frontend, mises à jour nécessaires.
