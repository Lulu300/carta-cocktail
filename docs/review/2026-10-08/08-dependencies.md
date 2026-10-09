# Revue 8 : montées de version majeures (Carta Cocktail)

Date : 2026-10-08. Périmètre : `backend/` et `frontend/` (deux `package.json` distincts). Revue en lecture seule : rien n'a été modifié ni installé dans le repo. Les métadonnées (engines, peerDependencies, exports) viennent de `npm view` sur le registre npm. Pour archiver 8, @types/archiver 8, adm-zip 0.6.1 et eslint-plugin-react-refresh 0.5.7, j'ai téléchargé le tarball dans le scratchpad pour lire les exports réels.

Légende. Effort : S < 1/2 j, M ≈ 1-2 j, L ≥ 3 j. Risque : B (bas), M (moyen), H (haut).

## 1. Tableau récapitulatif

| Paquet | Actuel | Cible | Type | Impact repo | Effort | Risque | Reco |
|---|---|---|---|---|---|---|---|
| prisma / @prisma/client | 6.19.2 | 7.10.0 (pas 8.0 rc) | major | schema.prisma, nouveau prisma.config.ts, 15 `new PrismaClient()`, test helpers, Dockerfile, adapter better-sqlite3, chemins SQLite | L | H | Planifier (lot 7), avant les features backend |
| vitest + @vitest/coverage-v8 | 4.0.18 | 5.0.3 | major | 2 × vitest.config.ts (globs coverage), Node ≥ 22.12 | S | M | Faire (lot 4) |
| vite | 7.3.1 | 8.3.4 | major | vite.config.ts inchangé a priori, cible navigateurs relevée | S | B-M | Faire (lot 5) |
| @vitejs/plugin-react | 5.1.4 | 6.1.2 | major | Aucun (pas d'options Babel) ; exige Vite 8 | S | B | Faire après Vite 8 (lot 5) |
| eslint + @eslint/js | 9.39 | 10.12.0 / 10.0.1 | major | eslint.config.js déjà en flat config ; 3 nouvelles règles recommended | S | B | Faire (lot 3), ESLint 9 est EOL |
| globals | 16 | 17.x | major | `globals.browser` non concerné | S | B | Faire (lot 3) |
| eslint-plugin-react-refresh | 0.4.26 | 0.5.7 | major (0.x) | Export par défaut `configs.vite` conservé | S | B | Faire (lot 3) |
| typescript | 5.9.3 | 7.0.2 | major | tsconfig backend (moduleResolution implicite node10, types) ; typescript-eslint bloquant | M | H | Attendre ; 6.0.3 en option comme étape |
| i18next | 25.8.4 | 26.4.2 | major | Options utilisées non touchées | S | B | Faire (lot 6) |
| react-i18next | 16.5.4 | 17.0.16 | major | Pas de `<Trans>`, mock complet en test | S | B | Faire avec i18next 26 (lot 6) |
| adm-zip | 0.5.16 | 0.6.1 | major (0.x) | backup.ts, bottlesImport.ts ; supprimer @types/adm-zip | S | B | Faire maintenant (lot 2, CVE) |
| archiver (+@types) | 7.0.1 | 8.0.0 | major | backup.ts : `archiver('zip')` n'existe plus, utiliser `new ZipArchive()` ; paquet ESM-only | S | M | Faire (lot 2), avec un test |
| dotenv | 17.2.4 | 18.0.6 | major | config.ts : `dotenv.config({ path })` inchangé | S | B | Faire (lot 2) |
| jsdom | 28 | 29.1.1 (pas 30) | major | Node ≥ 22.13 ; refonte CSSOM | S | B-M | Faire (lot 4) |
| @testing-library/jest-dom | 6.9.1 | 7.0.1 | major | Node ≥ 22 ; @testing-library/dom devient peer requis (déjà présent via RTL) | S | B | Faire (lot 4) |
| @types/node | 25 (back) / 24 (front) | 26 | major | Doit suivre le runtime (Node 24) | S | B | Ignorer 26 ; aligner les deux sur ^24 |

Hors majors, à traiter dans le lot 1 : `i18next-http-middleware` 3.9.9 (CVE critiques/hautes), `multer` 2.4.0, `react-router-dom` 7.18.4, transitifs d'Express (proxy-addr, path-to-regexp, qs, body-parser) via `npm audit fix` sans `--force`.

## 2. Contexte runtime

### Node.js (calendrier officiel nodejs/Release)

| Version | Statut au 2026-10-08 | Fin de vie |
|---|---|---|
| 20 | **EOL depuis le 2026-04-30** | — |
| 22 | Maintenance LTS | 2027-04-30 |
| 24 | Active LTS, passe en Maintenance le 2026-10-20 | 2028-04-30 |
| 26 | Current, devient Active LTS le 2026-10-28 | 2029-04-30 |

Les deux Dockerfiles (`backend/Dockerfile`, `frontend/Dockerfile`) utilisent encore `node:20-alpine`, une version qui ne reçoit plus de correctifs de sécurité. La CI tourne déjà sur Node 24. Plusieurs cibles excluent Node 20 : Vitest 5 (`^22.12 || ^24 || >=26`), jest-dom 7 (`>=22`), better-sqlite3 13 (`>=22`).

Recommandation : passer les deux images sur `node:24-alpine`, épinglées sur une version mineure ou un digest. On reste ainsi aligné sur la CI, avec un support jusqu'en avril 2028. Node 26 peut attendre 2027, le temps de confirmer les binaires précompilés musl de better-sqlite3 et sharp. Ajouter aussi `"engines": { "node": ">=22.13" }` (ou `.nvmrc` = 24) dans les deux paquets.

Point local : le poste est en Node 24.14.0. jsdom 30 (dernier tag npm 30.1.2) exige `^24.15.0`, d'où le choix de jsdom 29 comme cible.

### Express

`express@latest` = 5.2.1, déjà installé. Il n'existe pas de 5.3. Les vulnérabilités signalées sous Express (proxy-addr critique, path-to-regexp, qs, body-parser) viennent des dépendances transitives et se corrigent par mise à jour du lockfile (`npm update` / `npm audit fix`).

## 3. Détail par montée majeure

### 3.1 Prisma 6 → 7

**Breaking changes (guide officiel)**
- Le générateur `prisma-client-js` est déprécié, remplacé par `prisma-client` (client sans moteur Rust). Le champ `output` devient obligatoire et le client n'est plus généré dans `node_modules`. On importe ensuite depuis `<output>/client`.
- Prisma est livré « ESM-first ». La doc du générateur `prisma-client` prévoit `moduleFormat = "cjs"` pour les projets CommonJS comme ce backend (`"type": "commonjs"`, `module: commonjs`). Le guide officiel recommande de passer en `"type": "module"`, mais ce n'est pas obligatoire grâce à `moduleFormat`.
- **Driver adapter obligatoire pour toutes les bases.** Pour SQLite : `@prisma/adapter-better-sqlite3` (classe `PrismaBetterSqlite3({ url })`), qui dépend de `better-sqlite3 ^12.6` (module natif).
- `url` dans le bloc `datasource` du schéma : le guide le dit « déprécié », mais plusieurs retours terrain signalent une erreur bloquante (« The datasource property `url` is no longer supported in schema files »). L'URL passe dans `prisma.config.ts` (`defineConfig`, `env()` de `prisma/config`).
- Le `.env` n'est plus chargé automatiquement, ni par le CLI ni par le client. Il faut `import 'dotenv/config'` dans `prisma.config.ts`.
- `--skip-generate` est supprimé de `db push` et `migrate dev`. Ces commandes ne lancent plus `generate`. Le seed n'est plus lancé automatiquement et se configure via `migrations.seed` dans `prisma.config.ts`.
- `$use()` et Metrics sont supprimés (non utilisés ici). Minimums : Node 20.19, TypeScript 5.4.

**Usage réel dans le repo**
- `backend/prisma/schema.prisma` : `provider = "prisma-client-js"`, `url = env("DATABASE_URL")`.
- **15 instanciations `new PrismaClient()`** : 13 fichiers de routes, `services/availabilityService.ts`, plus `prisma/seed.ts` et `src/test/helpers.ts`. Chacune devra recevoir l'adapter. La migration est l'occasion de créer un singleton `src/lib/prisma.ts` (un seul client, une seule connexion SQLite) et de mettre à jour `backend/AGENTS.md`, qui documente le pattern « un client par fichier ».
- `src/test/helpers.ts` : `npx prisma db push --skip-generate --force-reset` cassera. Il faut retirer `--skip-generate`.
- `backend/Dockerfile` : `COPY prisma ./prisma` puis `RUN npx prisma generate` avant `COPY . .`. Il faudra aussi copier `prisma.config.ts` avant `generate`. Si la config appelle `env('DATABASE_URL')` alors que la variable n'existe pas au build, `generate` risque d'échouer : prévoir une valeur par défaut ou un `ARG` (point à vérifier). Le `CMD` (`prisma db push --accept-data-loss && npm run db:seed`) reste valable.
- Gestion d'erreurs `error.code === 'P2002' / 'P2025'` (ingredients, menus, menuBottles, cocktails). Prisma mappe en principe les erreurs des adapters vers ces codes, mais je n'ai pas trouvé de confirmation explicite pour SQLite. Les tests d'intégration existants doivent le valider.
- **Résolution des chemins SQLite relatifs (piège concret).** Avec Prisma 6, `file:./x.db` est résolu par rapport au dossier du schéma. Le repo le montre : la base de test existe dans `backend/prisma/prisma/test.db` et la base de dev dans `backend/prisma/carta_cocktail.db` (`.env` : `file:./carta_cocktail.db`). Avec l'adapter better-sqlite3, la chaîne est très probablement passée telle quelle, donc résolue par rapport au `cwd`. Ce point n'est pas confirmé par la doc officielle. Si c'est le cas, le backend de dev ouvrirait une base vide `backend/carta_cocktail.db`. Utiliser des chemins absolus partout. En prod, `file:/app/data/carta_cocktail.db` est déjà absolu, donc non concerné.
  - Bug existant révélé au passage : `TEST_DB_PATH` dans helpers.ts pointe sur `backend/prisma/test.db`, alors que la base réelle est `backend/prisma/prisma/test.db`. Le nettoyage ne supprime donc rien, et seul `--force-reset` évite le problème. De même, `getDatabasePath()` dans backup.ts résout le chemin relatif par rapport au `cwd`, donc l'export de backup en dev ne trouve pas la base.
- `routes/backup.ts` réécrit le fichier SQLite pendant que des connexions sont ouvertes. Avec better-sqlite3, le handle reste ouvert dans le process. Prévoir `$disconnect()` puis reconnexion autour de la restauration, et tester.
- Alpine : la suppression du moteur Rust retire le souci openssl/musl, mais il faut un module natif `better-sqlite3`. Si aucun binaire précompilé musl n'existe pour la version Node de l'image, l'installation compile depuis les sources et demande `python3 make g++` (à vérifier au build).
- **Attention au dist-tag npm** : `prisma@latest` pointe actuellement sur `8.0.0-rc.22`, alors que `@prisma/client@latest` = 7.10.0. Épingler explicitement `prisma@7.10.0` et `@prisma/client@7.10.0`, sinon on installe un RC.
- `@prisma/client` est en devDependencies alors qu'il sert au runtime. Ça marche parce que l'image Docker fait `npm ci` sans `--omit=dev`. Avec le nouveau générateur, le client généré est dans le code source, mais l'adapter et `better-sqlite3` doivent aller dans `dependencies`.

**Reco** : faire Prisma 7.10 (pas 8.0 tant qu'il est en RC) dans un lot dédié, après la stabilisation de l'outillage de test et avant d'ajouter zod/rate-limit, parce qu'il touche tous les fichiers de routes. Utiliser directement `prisma-client` + `moduleFormat = "cjs"` pour ne pas refaire le travail en v8, où `prisma-client-js` sera probablement retiré. Effort L, risque H. Pas d'urgence sécurité : 6.19.3 reste maintenue (dist-tag `prev`).

### 3.2 Vitest 4 → 5 (+ @vitest/coverage-v8)

**Breaking changes (guide officiel vitest.dev/guide/migration)** : Node ≥ 22.12 et Vite ≥ 6.4, `vite` devient peer dependency. `clearMocks: true` par défaut. `vi.mock`/`vi.hoisted` imbriqués lèvent une erreur. Les assertions `resolves`/`rejects` non awaitées échouent. `expect.poll` rejette au timeout. Les globs coverage `include`/`exclude` sont comparés aux chemins relatifs au projet sans « contains », et **un motif sans joker est traité comme un dossier**. Les artefacts de reporters déménagent sous `.vitest/`, les reporters `json`/`junit` écrivent dans des fichiers par défaut. `test.sequential` est supprimé, ainsi que plusieurs entry points (`vitest/coverage`, `vitest/reporters`…). Plus de recherche de config dans les dossiers parents.

**Usage réel**
- `backend/vitest.config.ts` et `frontend/vitest.config.ts` : `coverage.exclude` contient `'src/index.ts'` (backend), `'src/main.tsx'` et `'src/vite-env.d.ts'` (frontend), sans joker. Avec la nouvelle règle, ces entrées pourraient être interprétées comme des dossiers et ne plus exclure les fichiers. `src/index.ts` et `src/main.tsx` entreraient alors dans la couverture et feraient baisser les pourcentages (seuil 60 %). Vérifier le rapport après montée et corriger les motifs si besoin.
- Aucun `vi.mock` imbriqué (grep négatif), aucun `.resolves`/`.rejects` non awaité, pas de `sequential`.
- `clearMocks` : le setup frontend définit des `vi.fn()` avec implémentation (localStorage, matchMedia). `clearMocks` ne vide que l'historique d'appels, donc pas d'impact attendu. Un test qui compterait des appels cumulés entre tests casserait, mais ce serait un faux positif utile.
- CI : le script delta-coverage lit `coverage/coverage-final.json`, qui est produit par le reporter de couverture, pas par les reporters de test déplacés sous `.vitest/`. Normalement inchangé, à confirmer au premier run CI. Ajouter `.vitest/` au `.gitignore`.
- Node : CI en 24 et poste local en 24.14, OK. Les tests ne tournent pas dans Docker.

**Reco** : faire, en gardant la même version dans les deux paquets. Effort S, risque M (dérive de couverture possible).

### 3.3 Vite 7 → 8 et @vitejs/plugin-react 5 → 6

**Breaking changes (guide officiel vite.dev/guide/migration)** : Rolldown remplace Rollup et Oxc remplace esbuild. `build.target` par défaut relevé (Chrome/Edge 111, Firefox 114, Safari 16.4). `esbuild` devient optionnel. Lightning CSS devient le minifieur CSS par défaut. Nouvelles règles d'interop pour les imports par défaut de modules CJS (échappatoire temporaire : `legacy.inconsistentCjsInterop`). `build.rollupOptions` est renommé `rolldownOptions`, et la forme objet de `manualChunks` est supprimée. Engines : `^20.19 || >=22.12`.

plugin-react 6 : exige `vite ^8` (peer). Babel est retiré du plugin : React Refresh passe par Oxc, et les besoins Babel passent par `@rolldown/plugin-babel`. Source : notes de version vues via des miroirs Dependabot, pas lues directement sur GitHub. Les peers npm le confirment (`@rolldown/plugin-babel` et `babel-plugin-react-compiler` optionnels). plugin-react **5.2.0 accepte déjà Vite 8** (`^4.2 … || ^8.0.0`).

**Usage réel**
- `frontend/vite.config.ts` : uniquement `react()`, `tailwindcss()` et le proxy dev. Pas de `rollupOptions`, `esbuild` ni `manualChunks`, et aucune option Babel passée à `react()`.
- `@tailwindcss/vite` 4.3.3 déclare `vite ^8` en peer. OK.
- Import CJS : `jszip` (`import JSZip from 'jszip'` dans `ImportStepUpload.tsx` et `services/exportZip.ts`). C'est un `module.exports = JSZip` classique sans `__esModule`, le cas le plus simple. Je m'attends à ce qu'il continue de marcher, à vérifier sur le build et à l'import/export ZIP réel.
- Cible navigateurs : le menu public sera ouvert sur les téléphones des invités. Safari 16.4 (iOS 16.4, mars 2023) devient le minimum. C'est acceptable, mais c'est une décision produit à acter.

**Reco** : faire en deux PR. D'abord Vite 8 avec plugin-react 5.2.0, puis plugin-react 6 (réduit le risque, isole Rolldown). Effort S, risque B-M.

### 3.4 ESLint 9 → 10, @eslint/js 10, globals 17, eslint-plugin-react-refresh 0.5

**ESLint 10 (guide officiel)** : eslintrc supprimé. Node `^20.19 || ^22.13 || >=24`. `eslint:recommended` ajoute `no-unassigned-vars`, `no-useless-assignment` et `preserve-caught-error`. Les références JSX sont désormais suivies par le scope manager. Les commentaires `/* eslint-env */` deviennent des erreurs. La recherche de config se fait à partir du fichier linté. Bannière eslint.org : **ESLint 9.x est EOL depuis le 2026-08-06**.

**globals 17** : seul breaking change, l'environnement `audioWorklet` est séparé de `browser`.

**react-refresh 0.5** : ESM, ESLint ≥ 9 et Node 20 requis. Nouvel export nommé `reactRefresh` (configs = fonctions). `customHOCs` est renommé `extraHOCs`, la détection des HOC devient plus stricte, et `connect` n'est plus codé en dur. J'ai vérifié dans `index.d.ts` 0.5.7 : **l'export par défaut expose toujours `configs.vite` comme objet**.

**Usage réel** : `frontend/eslint.config.js` est déjà en flat config (`defineConfig`, `globalIgnores`). Il utilise `js.configs.recommended`, `tseslint.configs.recommended`, `reactHooks.configs.flat.recommended` et `reactRefresh.configs.vite` (import par défaut, compatible). Aucun `eslint-env`. Aucun `throw new Error` dans un `catch` côté frontend (`preserve-caught-error`). Peers : typescript-eslint 8.71.1 et react-hooks 7.1.1 acceptent ESLint 10. Les nouvelles règles peuvent produire quelques erreurs à corriger, ce que seul un run réel dira.

**Reco** : faire. Effort S, risque B. Le backend n'a pas d'ESLint, donc aucun impact de ce côté.

### 3.5 TypeScript 5.9 → 7.0

**Faits (devblog Microsoft, 2026-07-08)** : compilateur natif Go, 8 à 12× plus rapide. **Pas d'API programmatique en 7.0**, une « nouvelle API différente » est attendue en 7.1. La date de 7.1 (bêta en septembre, sortie vers le 10 novembre 2026) ne vient que d'une source secondaire, à considérer comme non confirmée. Les options dépréciées en 6.0 deviennent des erreurs : `moduleResolution node/node10/classic`, `baseUrl`, `target es5`, `downlevelIteration`, modules amd/umd/system/none. Nouveaux défauts : `strict: true`, `module: esnext`, `types: []`, `rootDir: ./`. Cohabitation documentée : paquet `@typescript/typescript6` (alias `typescript@npm:@typescript/typescript6`) et 7.0 sous un autre alias.

**Compatibilité outillage**
- **typescript-eslint** : peer `typescript >=4.8.4 <6.1.0` (8.71.1). L'issue #12518 « support TS 7 » est fermée en « not planned » / duplicate, sans calendrier. **C'est bloquant pour le frontend** (`npm ci` échoue sur le conflit de peers).
- **ts-node** : dépend de l'API TS, donc incompatible. Il n'est de toute façon pas utilisé : le supprimer.
- **tsx** (dev backend, seed) : transpile via esbuild sans utiliser `tsc`, donc indépendant de la version de TS.
- **Vite / Vitest** : transpilent via Oxc/esbuild. Seul le `tsc -b` du script `build` frontend dépend de TS, et TS 7 prend en charge `--build`.
- Peers d'autres libs : i18next 26 et react-i18next 17 acceptent `^5 || ^6 || ^7`, Prisma 7 `>=5.4`.

**Usage réel**
- `backend/tsconfig.json` : `"module": "commonjs"` **sans `moduleResolution`**, ce qui implique node10 (déprécié en 6.0, erreur en 7.0). Pas de `types`, donc avec le nouveau défaut `[]` les types Node disparaissent (`process`, `__dirname`, `Buffer`). Il faudra ajouter `"types": ["node"]`, plus `"vitest/globals"` si un test en dépend ; les 16 fichiers de test backend importent explicitement depuis `vitest`. Piste : `"module": "node20"` (TS ≥ 5.9, émet du CJS pour un paquet `type: commonjs` et accepte le `require()` d'ESM comme archiver 8) ou `"moduleResolution": "bundler"` avec `module: commonjs` (autorisé depuis 6.0).
- `frontend/tsconfig.app.json` / `tsconfig.node.json` : déjà `moduleResolution: bundler`, `types` explicites et `strict`. Peu ou pas d'impact.

**Reco** : **attendre TS 7** (au minimum 7.1 plus le support typescript-eslint). Étape préparatoire optionnelle et peu risquée : TS 6.0.3 (accepté par typescript-eslint) avec correction des dépréciations du tsconfig backend, sans `ignoreDeprecations`. En option, ajouter en CI un job non bloquant `tsgo --noEmit` pour mesurer le gain.

### 3.6 i18next 25 → 26 et react-i18next 16 → 17

**i18next 26 (CHANGELOG officiel)** : suppression de `initImmediate` (utiliser `initAsync`), de la fonction legacy `interpolation.format` (utiliser `formatter.add()`), de `simplifyPluralSuffix` et de l'avis console (`showSupportNotice`). En 26.0.7, `dist/esm/i18next.bundled.js` n'est plus publié. En 26.4.0, les résultats de hiérarchie sont mis en cache (`clearCache()` si on mute `load`/`lowerCaseLng` au runtime).
**react-i18next 17** : un seul changement cassant, la sérialisation `transKeepBasicHtmlNodesFor` dans `<Trans>` sans `i18nKey`. Peer `i18next >= 26.2.0`, donc les deux montent ensemble. En lot 1, react-i18next 16.6.6 exige déjà `i18next >= 25.10.9`.

**Usage réel** : `backend/src/i18n/index.ts` et `frontend/src/i18n/index.ts` n'utilisent que `resources`, `fallbackLng`, `preload` et `interpolation.escapeValue`, aucune option supprimée. Aucun `<Trans>` dans le frontend. Pas de typage `CustomTypeOptions`. Les tests frontend mockent entièrement react-i18next. i18next-http-middleware 3.9.9 et i18next-browser-languagedetector 8.2.1 n'ont pas de peer sur i18next, donc la compatibilité avec la 26 se vérifie par les tests (122 appels `req.t` côté backend).

**Reco** : faire, effort S, risque B. Backend et frontend en parallèle possibles.

### 3.7 adm-zip 0.5 → 0.6.1

**Changements (releases GitHub)** :
- 0.6.0 corrige CVE-2026-39244 (allocation non bornée et OOM sur archive forgée), `extractEntryTo(..., maintainEntryPath=false)` préserve les sous-dossiers, `utimes` devient best-effort et Node ≥ 14.
- 0.6.1 bloque l'écriture via symlinks, rejette les entrées dont les données débordent du buffer et **rejette les archives avec noms d'entrée dupliqués**. Elle supprime aussi les bits setuid/setgid et applique un plafond de décompression.
- Types intégrés (`types.d.ts`, `export = AdmZip`), donc `@types/adm-zip` devient inutile.

**Usage réel** : `routes/backup.ts` et `utils/bottlesImport.ts` n'utilisent que `new AdmZip(buffer)`, `getEntries()`, `getEntry()`, `entry.getData()`, `entryName` et `isDirectory`. Aucune extraction disque via adm-zip, et les fichiers d'upload sont écrits avec `path.basename` côté app. API vérifiée dans le `.d.ts` 0.6.1 : identique. Seul effet visible : une archive avec des noms en double sera rejetée, ce qui est souhaitable. Aucun `backup.test.ts` n'existe ; ajouter un test d'import (et d'export) est requis par AGENTS.md.

**Reco** : **faire maintenant**, c'est le seul correctif de l'audit qui exige une majeure. Effort S, risque B.

### 3.8 archiver 7 → 8 (+ @types/archiver 8)

**Changements** : la release 8.0.0 n'annonce qu'un breaking change, « esm: node v18+ required ». La lecture du tarball montre en plus que **le paquet est ESM-only** (`"type": "module"`, `exports: "./index.js"`) et que **la factory par défaut `archiver(format, options)` a disparu**. Le paquet exporte des classes nommées `Archiver`, `ZipArchive`, `TarArchive` et `JsonArchive`. `@types/archiver` 8.0.0 suit (classes `ZipArchive`, etc.).

**Usage réel** : `routes/backup.ts` contient `import archiver from 'archiver'` et `archiver('zip', { zlib: { level: 6 } })`, ce qui **cassera** à la compilation et à l'exécution. Remplacer par `import { ZipArchive } from 'archiver'` et `new ZipArchive({ zlib: { level: 6 } })`. Le backend est en CommonJS : `tsc` émettra `require('archiver')`, qui fonctionne via `require(esm)`, sans flag en Node 20.19+, 22.12+ et 24. Vitest et tsx gèrent aussi ce cas. Les méthodes `append`, `file`, `directory`, `pipe` et `finalize` restent présentes dans les types.

**Reco** : faire dans le même lot qu'adm-zip, avec un test d'export ZIP via supertest. Effort S, risque M (ESM-only dans un backend CJS, à valider aussi dans l'image Docker).

### 3.9 dotenv 17 → 18

**CHANGELOG officiel** : aucune entrée marquée « Breaking ». Les retraits de fond sont le support `.env.vault` et le **preload** (`node -r dotenv/config`, remplacé par le CLI `dotenv run --`). Le message d'injection part sur stderr. Nouveaux : un CLI et un parseur rapide opt-in.
**Usage réel** : `src/config.ts` fait `dotenv.config({ path: path.resolve(__dirname, '../.env') })`. Pas de preload, pas de vault, donc aucun changement de code. Prisma 7 demandera `import 'dotenv/config'` dans `prisma.config.ts` (toujours exporté en 18).
**Reco** : faire, effort S, risque B.

### 3.10 jsdom 28 → 29

**Release 29.0.0** : seul breaking change, Node 22 ≥ 22.13 (Node 24 OK). Refonte du CSSOM (abandon de cssstyle et @acemir/cssom), `MediaList` parsé par css-tree, sélecteurs invalides rejetés, ports « dangereux » bloqués pour fetch. `getComputedStyle` a régressé en 29.0.0 puis a été corrigé en 29.0.1/29.0.2.
**Usage réel** : environnement `jsdom` du frontend, `css: false`, `matchMedia` mocké. Il y a 338 assertions jest-dom, dont certaines `toHaveStyle`/`toHaveClass` peuvent dépendre du CSSOM ; à vérifier en lançant la suite.
**Reco** : faire 29.1.1, pas 30 (30.x exige Node `^22.22.2 || ^24.15 || >=26`, alors que le poste local est en 24.14). Effort S, risque B-M.

### 3.11 @testing-library/jest-dom 6 → 7

**Release 7.0.0** : `@testing-library/dom` devient peer obligatoire, Node ≥ 22. En 7.0.1, `vitest` devient peer optionnel. Nouveaux matchers `toContainAnyBy*`/`toContainOneBy*`. Aucune suppression de matcher n'est annoncée.
**Usage réel** : `import '@testing-library/jest-dom/vitest'` dans `frontend/src/test/setup.ts` (entry point toujours exporté). `@testing-library/dom` 10.4.1 est déjà présent dans le lockfile comme peer de RTL. Je recommande de l'ajouter explicitement aux devDependencies.
**Reco** : faire, effort S, risque B.

### 3.12 @types/node 25/24 → 26

`@types/node` doit suivre la version de Node exécutée. 26 décrit des API de Node 26, qui n'est pas le runtime (CI 24, Docker 20 puis 24). Peers : Vite 8 `^20.19 || >=22.12`, Vitest 5 `^22 || >=24`.
**Reco** : ignorer 26. Aligner `backend` (actuellement ^25) et `frontend` sur `^24`. Passer à 26 en même temps que l'image Docker passera sur Node 26.

## 4. Compatibilité avec les ajouts prévus

| Ajout | Version actuelle | Compatibilité avec les cibles |
|---|---|---|
| zod | 4.6.5 | RAS. eslint-plugin-react-hooks 7 embarque déjà zod `^3.25 \|\| ^4` (dépendance isolée). |
| @tanstack/react-query | 5.104.1 | peer `react ^18 \|\| ^19`, OK. |
| express-rate-limit | 8.7.1 | peer `express >= 4.11`, OK avec Express 5. Derrière nginx, configurer `app.set('trust proxy', 1)`, sinon les clés sont faussées et la librairie émet une erreur de validation X-Forwarded-For. |
| react-hook-form | 7.89.0 | peer React 19, OK. La v8 est en bêta : rester en 7. `@hookform/resolvers` 5.9.1 accepte zod 3.25/4. |
| sharp | 0.35.5 | Node ≥ 20.9. Binaires précompilés musl attendus pour l'image alpine (à vérifier sur Node 24/arm64 si le NAS est ARM). Ajouter sharp après le passage Docker en Node 24. |
| vite-plugin-pwa | 2.0.0 | peer `vite ^3 … ^8`, OK avec Vite 8. Node ≥ 20.19. |

Pas d'incompatibilité bloquante identifiée. Deux points d'ordonnancement : (1) faire Prisma 7 **avant** zod/rate-limit côté backend, parce que la migration touche les 13 fichiers de routes et créerait des conflits ; (2) installer sharp et better-sqlite3 (Prisma 7) dans la même image Node 24 pour régler une seule fois la question des modules natifs alpine.

## 5. Ordre de montée proposé (lots)

Règle générale : backend et frontend ont des lockfiles distincts, donc les PR de paquets différents peuvent avancer en parallèle. Dans un même paquet, les lots sont sérialisés pour éviter les conflits de `package-lock.json` et isoler les régressions.

**Lot 0 — Runtime (transverse, en premier, petit)**
- Dockerfiles backend et frontend : `node:20-alpine` → `node:24-alpine` (épinglé). Ajouter `engines` / `.nvmrc`.
- Prérequis de fait pour Vitest 5, jest-dom 7 et Prisma 7 (better-sqlite3), et correction d'un runtime EOL.

**Lot 1 — Patch/minor et audit sans majeure (backend ‖ frontend en parallèle)**
- Backend : `npm update` dans les ranges, `prisma`/`@prisma/client` **6.19.3 épinglés** (ne pas suivre `latest` = 8.0 RC), i18next-http-middleware 3.9.9 (CVE), multer 2.4.0, helmet 8.3, morgan 1.12.1, i18next 25.10.10, dotenv 17.4.2, adm-zip 0.5.18, vitest 4.1.11, tsx 4.23, supertest 7.3.1, `npm audit fix` sans `--force` (transitifs d'Express). Supprimer `nodemon` et `ts-node`.
- Frontend : react/react-dom 19.3, react-router-dom 7.18.4 (CVE), vite 7.3.7, plugin-react 5.2.0, tailwind 4.3.3, typescript-eslint 8.71.1, react-hooks 7.1.1, vitest 4.1.11, i18next 25.10.10 + react-i18next 16.6.6, jszip 3.10.2.
- Aligner `@types/node` sur ^24 des deux côtés.

**Lot 2 — Majeures « sécurité/zip » backend (après lot 1 backend)**
- adm-zip 0.6.1 (supprimer @types/adm-zip), archiver 8 + @types/archiver 8 (réécriture `ZipArchive`), dotenv 18.
- Ajouter `routes/backup.test.ts` (export et import) : obligatoire selon AGENTS.md, et c'est la seule protection pour ces deux libs.
- Après ce lot, l'audit prod backend doit être à zéro.

**Lot 3 — Lint frontend (en parallèle du lot 2)**
- eslint 10, @eslint/js 10, globals 17, eslint-plugin-react-refresh 0.5.7. Corriger les nouvelles erreurs de `recommended`.

**Lot 4 — Outillage de test (après lot 0 ; backend ‖ frontend, même version de Vitest)**
- Backend : vitest et coverage-v8 5.0.3.
- Frontend : vitest et coverage-v8 5.0.3, jsdom 29.1.1, jest-dom 7.0.1, `@testing-library/dom` explicite.
- Vérifier les globs `coverage.exclude` sans joker, les seuils, `coverage-final.json` pour le delta CI, et ajouter `.vitest/` au `.gitignore`.

**Lot 5 — Build frontend (après lots 3 et 4 frontend, sérialisé)**
- 5a : vite 8.3.x avec plugin-react 5.2.0 (vérifier le build, l'import/export jszip et la cible navigateurs).
- 5b : @vitejs/plugin-react 6.1.x.

**Lot 6 — i18n (backend ‖ frontend, n'importe quand après le lot 1)**
- i18next 26 des deux côtés, react-i18next 17 côté frontend (dans la même PR que i18next frontend).

**Lot 7 — Prisma 7 (backend, après lots 0, 2 et 4 ; avant zod/rate-limit/sharp)**
- `prisma-client` + `output` + `moduleFormat = "cjs"`, `prisma.config.ts` (URL, seed, `dotenv/config`), adapter better-sqlite3 dans `dependencies`, singleton `src/lib/prisma.ts`, test helpers (`--skip-generate`, chemin réel de la base de test), chemins SQLite absolus, Dockerfile (`COPY prisma.config.ts`, env au build, toolchain native si besoin), restauration de backup (`$disconnect`), mise à jour de `backend/AGENTS.md` et du tableau de stack (Prisma 6.x → 7.x).
- PR dédiée et longue. À tester aussi via `docker-compose up --build`.

**Lot 8 — TypeScript (en dernier, conditionnel)**
- 8a (optionnel, maintenant ou après le lot 7) : TS 6.0.3 dans les deux paquets. Corriger le tsconfig backend (`moduleResolution` explicite ou `module: node20`, `types: ["node"]`) sans `ignoreDeprecations`.
- 8b (attendre) : TS 7.x, une fois que typescript-eslint publie un peer incluant 7 (dépend de l'API TS 7.1).

**Ensuite** : zod, express-rate-limit, sharp (backend, après le lot 7) ; TanStack Query, react-hook-form, vite-plugin-pwa (frontend, après le lot 5).

Parallélisme résumé :
```
Lot 0 ─┬─ Backend : L1b → L2 → L4b → L7 → (features back) ; L6b quand on veut après L1b
       └─ Frontend: L1f → L3 → L4f → L5a → L5b → (features front) ; L6f quand on veut après L1f
Lot 8a après L4 (+L7 conseillé) ; Lot 8b bloqué par typescript-eslint
```

## 6. Ce que je n'ai pas pu confirmer

- Résolution des chemins SQLite relatifs avec `@prisma/adapter-better-sqlite3` (cwd ou config) : pas de doc officielle trouvée. Utiliser des chemins absolus évite la question.
- Erreur bloquante ou simple dépréciation pour `url` dans `schema.prisma` en 7.x : le guide dit « deprecated », des retours terrain montrent une erreur. Le traiter comme bloquant.
- Notes complètes de @vitejs/plugin-react 6.0.0 : lues via des miroirs Dependabot, pas sur la page GitHub. Les peers npm sont cohérents avec ces notes.
- Date de sortie de TypeScript 7.1 : source secondaire unique.
- Existence de binaires précompilés musl pour better-sqlite3 et sharp sur l'architecture du NAS : à vérifier au premier build Docker.
- Effet exact du changement de glob coverage de Vitest 5 sur `'src/index.ts'` / `'src/main.tsx'` : déduit du guide, à vérifier sur le rapport.

## 7. Sources

- Prisma 7 upgrade guide : https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7
- Prisma generators (moduleFormat) : https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators
- Erreur `url` dans le schéma (retours terrain) : https://github.com/prisma/language-tools/issues/1932
- Vitest migration guide : https://vitest.dev/guide/migration
- Vite 8 migration guide : https://vite.dev/guide/migration
- Vite 8 beta (Rolldown) : https://vite.dev/blog/announcing-vite8-beta
- @vitejs/plugin-react releases : https://github.com/vitejs/vite-plugin-react/releases
- ESLint 10 migration : https://eslint.org/docs/latest/use/migrate-to-10.0.0
- ESLint 10 release : https://eslint.org/blog/2026/02/eslint-v10.0.0-released/
- globals v17.0.0 : https://github.com/sindresorhus/globals/releases/tag/v17.0.0
- eslint-plugin-react-refresh CHANGELOG : https://raw.githubusercontent.com/ArnaudBarre/eslint-plugin-react-refresh/main/CHANGELOG.md
- TypeScript 7.0 announcement : https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- TypeScript 6.0 announcement : https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- typescript-eslint issue TS 7 : https://github.com/typescript-eslint/typescript-eslint/issues/12518
- InfoQ, TS 7 : https://infoq.com/news/2026/08/typescript-7-released/
- i18next CHANGELOG : https://raw.githubusercontent.com/i18next/i18next/master/CHANGELOG.md
- react-i18next CHANGELOG : https://raw.githubusercontent.com/i18next/react-i18next/master/CHANGELOG.md
- i18next-http-middleware CVE (GHSA-c3h8-g69v-pjrg) : https://www.tenable.com/plugins/container-security/440745 et https://cve.report/software/i18next/i18next-http-middleware
- adm-zip releases : https://github.com/cthackers/adm-zip/releases
- archiver 8.0.0 : https://github.com/archiverjs/node-archiver/releases/tag/8.0.0
- dotenv CHANGELOG : https://raw.githubusercontent.com/motdotla/dotenv/master/CHANGELOG.md
- jsdom 29.0.0 : https://github.com/jsdom/jsdom/releases/tag/29.0.0
- jsdom 30.0.0 (engines) : https://newreleases.io/project/npm/jsdom/release/30.0.0
- jest-dom releases : https://github.com/testing-library/jest-dom/releases
- Calendrier Node.js : https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- Registre npm (`npm view <pkg> engines peerDependencies exports dist-tags`) pour toutes les versions cibles, y compris les tarballs archiver 8.0.0, @types/archiver 8.0.0, adm-zip 0.6.1 et eslint-plugin-react-refresh 0.5.7 lus localement dans le scratchpad.
