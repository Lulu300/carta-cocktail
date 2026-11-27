---
id: F-15
title: "Serveur MCP pour piloter Carta, compatible Code Mode"
phase: F
lane: backend
criticite: basse
effort: L
status: done
owner: mixed
depends_on: [F-14, F-16]
touches: [mcp/, backend/src/mcp/, backend/src/middleware/auth.ts, backend/src/openapi/, backend/src/test/helpers.ts, backend/AGENTS.md, AGENTS.md, scripts/smoke/smoke.sh, .prettierignore, backend/src/app.ts, backend/src/routes/, backend/package.json, backend/package-lock.json, README.md, docs/operations.md, .github/workflows/ci.yml, .github/workflows/release.yml, backend/prisma/, backend/Dockerfile, backend/src/validation/settings.ts, backend/src/contracts/frontendTypes.ts, backend/src/i18n/, frontend/src/components/admin/, frontend/src/pages/admin/SettingsPage.tsx, frontend/src/services/api.ts, frontend/src/types/, frontend/src/i18n/locales/admin/, frontend/src/test/, frontend/AGENTS.md]
sources: []
branch: feature/F-15-code-mode
pr: 310
---

## Décisions

Décisions de l'humain (2026-11-27) :

1. **Forme : option (c).** D'abord des outils typés (première PR). Puis Code Mode côté serveur (`search` et `execute`), derrière un réglage **désactivé par défaut**, et **toujours dans un vrai bac à sable** (QuickJS-wasm ou isolated-vm, jamais `vm` de Node) : seconde PR, après le merge de la première.
2. **Transport : option (a).** Une route HTTP du backend en Streamable HTTP, protégée par un jeton d'API. Un paquet stdio seulement si un client l'exige : pas maintenant.
3. **Périmètre.** Lecture et écritures courantes. Les suppressions, la restauration de sauvegarde et « Se déconnecter partout » restent hors du MCP.

Consignes de conception données avec ces décisions : chemin `/api/mcp` (proxy nginx, limiteur et CORS existants, sans toucher la CSP ni nginx), route exclue du document OpenAPI ; `Authorization: Bearer` avec un jeton d'API ou la session, par le même contrôle que l'API ; un jeton en lecture seule ne voit pas les outils d'écriture ; schémas et logique tirés de l'API existante (F-14), par `operationId`, sans duplication ; un test casse si une opération utilisée disparaît ou change de schéma ; documentation prête à coller pour Claude Code, Claude Desktop et un client Code Mode, lecture seule recommandée par défaut.

## Décisions à valider avant de commencer (historique)

L'humain a demandé cette tâche le 2026-11-26 : « un MCP qu'on puisse paramétrer pour faire la majorité des actions dont on a besoin, prévu pour être le plus compatible possible avec Code Mode ». Elle vient après F-14 (API documentée, OpenAPI) et F-16 (jetons d'API).

**Code Mode** (Cloudflare) : au lieu d'exposer un outil MCP par opération, le serveur expose l'API comme du code. Le modèle écrit un court programme qui appelle l'API, et ce programme tourne dans un bac à sable. Le serveur MCP de l'API Cloudflare n'expose que deux outils, `search` et `execute`, pour environ 1 000 tokens, quelle que soit la taille de l'API :
- `search` exécute du JavaScript écrit par le modèle sur la spécification OpenAPI, sans faire entrer toute la spécification dans le contexte du modèle ;
- `execute` exécute du code qui appelle l'API par une fonction fournie par l'hôte, et l'authentification reste chez l'hôte.

Le SDK Agents de Cloudflare fournit `openApiMcpServer()` pour un grand catalogue OpenAPI, et `codeMcpServer()` quand des outils MCP existent déjà. Les clients Code Mode convertissent aussi des outils MCP classiques en API TypeScript côté client : des schémas d'entrée et de sortie précis suffisent alors.

Choix à faire par l'humain (`owner: mixed`) :

1. **Forme du serveur.**
   - (a) **Outils classiques bien typés**, par exemple `list_cocktails`, `get_cocktail`, `update_bottle_stock`, `publish_menu`… Chacun a un `inputSchema` et un `outputSchema` tirés de F-14. Tout client MCP les utilise, et un client Code Mode les convertit lui-même en API TypeScript. Aucun code du modèle ne tourne chez nous.
   - (b) **Code Mode côté serveur** : `search` et `execute` sur la spécification de F-14, comme Cloudflare. Le contexte reste minimal et toute l'API est couverte. En revanche, `execute` fait tourner du code écrit par le modèle sur l'instance, ce qui exige un vrai bac à sable : QuickJS en WebAssembly ou `isolated-vm`, avec durée, mémoire et sorties limitées, et l'accès seulement par `codemode.request()`.
   - (c) **Les deux** : des outils typés pour les actions courantes, plus `search` et `execute` en option, désactivés par défaut.

   Recommandation : (c). On commence par (a) et on ajoute (b) derrière un réglage.
2. **Où tourne le serveur.**
   - (a) Une route HTTP du backend, `POST /mcp` en transport Streamable HTTP, protégée par un jeton d'API de F-16.
   - (b) Un paquet séparé lancé par le client en stdio (`npx @carta/mcp`), qui appelle l'API d'une instance avec un jeton.
   - (c) Les deux, avec le même code d'outils.

   Recommandation : (a) pour un usage distant, et (b) si un client local l'exige.
3. **Périmètre des actions.** Lecture seule au départ, ou écriture aussi : créer ou modifier un cocktail, ajuster un stock, publier une carte. Les actions destructives (suppression, restauration de sauvegarde, « Se déconnecter partout ») restent-elles hors MCP ?

   Recommandation : lecture et écriture courantes. Suppressions et restauration hors MCP.

## Contexte

- F-14 fournit une spécification OpenAPI 3.1 générée depuis les schémas zod. F-16 fournit des jetons d'API révocables avec une portée.
- Le MCP (Model Context Protocol) permet à un agent IA (Claude, un client compatible, un agent Cloudflare…) d'appeler des outils décrits par des schémas JSON.

## Ce qu'il faut faire

1. **Outils typés** (décision 1 a ou c). Une liste courte, orientée tâches et non routes :
   - consulter les cocktails disponibles et leurs manques ;
   - consulter et ajuster le stock des bouteilles ;
   - lister, créer et modifier un cocktail ;
   - gérer les cartes (ajouter ou retirer un cocktail ou une bouteille, publier) ;
   - lancer un aperçu d'import ;
   - lire les pénuries.

   Les schémas viennent de F-14 et ne sont jamais recopiés. Chaque outil a une description claire, en anglais, avec un exemple. Ses erreurs reprennent les codes et messages de l'API.
2. **Code Mode côté serveur** (décision 1 b ou c), derrière un réglage désactivé par défaut :
   - `search({ code })` exécute le code fourni sur la spécification, sans réseau ;
   - `execute({ code })` expose `codemode.request({ method, path, query, body })`, qui passe par la même authentification et les mêmes limites que l'API ;
   - le bac à sable n'a ni système de fichiers, ni réseau autre que l'API, ni `require` ; son temps, sa mémoire et sa sortie sont limités ;
   - suivre la forme et les noms de Cloudflare (`search`, `execute`, `codemode.request`), pour que les clients et les modèles habitués s'y retrouvent.
3. **Transport et authentification** (décision 2). Streamable HTTP sur `/mcp` avec un jeton d'API (portée respectée), et/ou un paquet stdio. Le limiteur de l'API s'applique aussi.
4. **Configuration documentée.** Exemples prêts à coller pour Claude Desktop, Claude Code et un client Code Mode (Cloudflare Agents SDK), dans le README et `docs/operations.md`.
5. **Release.** Si un paquet stdio est retenu, il est publié avec la release, avec la même version que l'app.

## Critères d'acceptation

- [x] Un client MCP standard liste les outils, les appelle avec un jeton lecture seule (les écritures sont refusées), puis avec un jeton lecture et écriture.
- [x] Un client Code Mode, par exemple le SDK Agents de Cloudflare, utilise le serveur sans adaptation, et l'exemple est documenté.
- [x] Si `execute` est livré, aucun code du modèle ne peut lire un fichier, ouvrir une connexion, dépasser son temps ou sa mémoire, ni appeler une route sans le jeton. Des tests hostiles le prouvent.
- [x] Les schémas des outils viennent de F-14. Un changement d'API casse un test, pas un outil en production.

## Tests à ajouter ou adapter

- Protocole : `initialize`, `tools/list`, `tools/call` pour chaque outil, erreurs.
- Portée des jetons et révocation.
- Bac à sable (si livré) : boucle infinie, allocation massive, `require`, `fetch` externe, accès à `process`, sortie énorme.
- Smoke : le MCP répond dans l'image Docker.

## Points d'attention

- Sécurité avant tout. Un MCP connecté donne à un agent les droits du jeton. La portée par défaut est en lecture seule, et la doc le dit.
- Exécuter du code venu d'un modèle est le risque principal du Code Mode côté serveur. Ne pas le livrer sans bac à sable éprouvé : `vm` de Node n'est pas un bac à sable.
- Le SDK MCP et le SDK Cloudflare évoluent vite : vérifier les versions et la spécification MCP au moment de commencer.
- Détails Cloudflare relevés le 2026-11-26 (à revérifier) :
  - `codemode.request()` est le nom du SDK Agents ; le serveur de l'API Cloudflare l'appelle `cloudflare.request()`.
  - `codeMcpServer()` expose un seul outil `code`, et non le couple `search`/`execute` d'`openApiMcpServer()`.
  - Code Mode est marqué expérimental. Les deux fonctions renvoient un serveur du SDK MCP v1, servi par `createLegacyMcpHandler` : à prendre en compte pour l'option Streamable HTTP sur `/mcp`.
  - Les réponses sont tronquées vers 6 000 tokens.
  - Le `DynamicWorkerExecutor` du SDK ne tourne que sur Workers : un serveur auto-hébergé doit fournir son propre exécuteur (bac à sable).
- Sources :
  - <https://blog.cloudflare.com/code-mode-mcp/>
  - <https://developers.cloudflare.com/agents/model-context-protocol/codemode/>
  - <https://developers.cloudflare.com/agents/model-context-protocol/guides/build-codemode-openapi-mcp-server/>

## Journal

- 2026-11-26 : tâche créée à la demande de l'humain (MCP compatible Code Mode), à faire après F-14, F-16 et les autres tâches du plan. Relecture de #289 : détails Cloudflare ajoutés aux points d'attention.
- 2026-11-27 : décisions de l'humain (voir « Décisions ») : forme (c), outils typés d'abord puis Code Mode côté serveur dans une seconde PR, derrière un réglage désactivé par défaut et dans un vrai bac à sable ; transport (a), `/api/mcp` en Streamable HTTP avec un jeton d'API ; lecture et écritures courantes, sans suppression, restauration ni « Se déconnecter partout ».
- 2026-11-27 : partie 1 (outils typés) sur `feature/F-15-mcp-tools`. SDK MCP v2 (`@modelcontextprotocol/server` 2.4.0, Apache-2.0, `npm audit` sans alerte ; le paquet v1 `@modelcontextprotocol/sdk` est remplacé par les paquets v2) : spécification 2026-07-28 sans état, et forme sans état des révisions 2025 (`initialize`) ; GET et DELETE répondent 405. `POST /api/mcp` derrière `protocolAuthMiddleware` (même 401 qu'`authMiddleware`, mais un jeton en lecture seule peut envoyer un POST : chaque requête MCP en est un), exclu du document OpenAPI. 19 outils listés par `operationId` dans `backend/src/mcp/catalog.ts` ; schémas d'entrée (paramètres, query et corps de `validate()`) et de sortie (réponse JSON de succès, `{ items }` pour une liste) lus sur la route, comme le document OpenAPI, écrits en entier sans `$ref`. Un appel d'outil est une requête HTTP vers le serveur lui-même, à l'adresse qui a reçu la requête MCP, avec le même jeton et l'adresse du client en `X-Forwarded-For` : validation, portée, limiteur et erreurs de l'API. Injection sans socket écartée : light-my-request réécrit les prototypes d'Express pour tout le processus et casse les requêtes suivantes. Un jeton en lecture seule ne voit pas les outils d'écriture (« tool not found »), et la route de l'API le refuserait de toute façon. `src/mcp/__snapshots__/tools.json` garde ce que voit un client. Étape MCP ajoutée au smoke (`initialize` et `tools/list` avec un jeton en lecture seule). Exemple Code Mode (Cloudflare Agents SDK) documenté, non exécuté contre Cloudflare.
- 2026-11-27 : relecture de #309 (approuvée) : les paramètres de chemin d'un outil sont vérifiés avec le schéma `params` de la route avant de construire l'URL, et une valeur vide, `.` ou `..` est refusée (400 au format des erreurs de l'API) : `new URL` résolvait ces segments, et `get_cocktail {"id": "."}` appelait `GET /api/cocktails/`. La requête de l'outil vers l'API attend 30 s au plus (`OPERATION_TIMEOUT_MS`), puis l'outil répond 504 (`errors.mcpToolTimeout`). Test qui fige l'absence de SSRF (en-têtes `Host`, `X-Forwarded-Host` et `X-Forwarded-Proto` falsifiés), refus d'une route réservée à la session dans `buildOperationTools`. Doc : compteur partagé sous l'adresse du backend quand `TRUST_PROXY` ne lui fait pas confiance ; `update_menu` prévient qu'un nouveau `slug` casse les liens partagés et les QR codes imprimés.
- 2026-11-27 : reste à faire (partie 2) : Code Mode côté serveur, `search` et `execute` derrière un réglage désactivé par défaut, dans un vrai bac à sable (QuickJS-wasm ou isolated-vm), avec les tests hostiles du critère d'acceptation. Aperçu de l'import de bouteilles (fichier multipart) non exposé : seul l'aperçu d'import de cocktail (JSON) est un outil.
- 2026-11-27 : Notes de version : `breaking: false`, aucune action obligatoire, pas de migration. Nouvelle fonctionnalité visible : serveur MCP à `/api/mcp` pour les agents IA (Claude Code, Claude Desktop par `mcp-remote`, clients Code Mode), avec un jeton d'API : outils pour lire les cocktails, ce que le stock permet, les pénuries, les bouteilles et les cartes, et, avec un jeton en lecture et écriture, ajuster une bouteille, créer ou modifier un cocktail, composer et publier une carte, prévisualiser un import. Lecture seule recommandée par défaut. Un appel d'outil compte pour deux requêtes dans `API_RATE_LIMIT` (`docs/operations.md`, « Serveur MCP »).
- 2026-11-27 : partie 2 (Code Mode côté serveur) sur `feature/F-15-code-mode`. `search` et `execute` avec les noms et la forme d'`openApiMcpServer()` de `@cloudflare/codemode` 0.5.6 (relu le 2026-11-27) : `code` est une fonction fléchée asynchrone, `codemode.spec()` donne le document OpenAPI des opérations que le jeton peut appeler, `$ref` résolues, `codemode.request({ method, path, query, body })` répond `{ status, body }` et rejette une erreur avec le `status` et le `body` de l'API ; réponse coupée à 24 000 caractères avec `--- TRUNCATED ---`. Bac à sable : QuickJS en WebAssembly (`quickjs-emscripten-core` et `@jitl/quickjs-wasmfile-release-sync` 0.32.0, MIT, `npm audit` sans alerte, environ 1,1 Mo dans l'image, aucun binaire natif ni script d'installation), une instance WebAssembly neuve par exécution (environ 2 ms) ; écarté : `isolated-vm` (module natif à compiler pour arm64 et Alpine). Limites : 10 s de durée, 1 s de calcul (gestionnaire d'interruption de QuickJS : le code tourne sur le fil de Node, le serveur attend pendant ce temps), 64 Mo, pile de 128 Kio, 20 000 caractères de code, 50 requêtes par exécution. Mesure : la pile de QuickJS consomme celle de Node (une pile QuickJS de 512 Kio faisait déborder Node) ; JSON.stringify d'un objet très imbriqué déborde quand même la pile de Node par un chemin que QuickJS ne contrôle pas : l'exception est rattrapée, l'exécution finit en `crashed`, le processus continue, testé sous Node 26 en amd64 et arm64 dans l'image. Même périmètre que les outils typés : `codemode.request()` résout la méthode et le chemin contre les routes documentées, dans l'ordre d'Express, puis passe par `requestOperation()` (extrait de `callOperation()`) ; refus de tout `DELETE`, des routes réservées à la session, des routes non admin, de celles qui prennent un fichier, et des écritures d'un jeton en lecture seule, même avec la session de l'admin. Réglage `SiteSettings.codeModeEnabled` (migration `20261127200000_site_code_mode`, `false` par défaut), lu à chaque requête MCP ; route `PUT /api/settings/code-mode` réservée à la session (`SESSION_ONLY_ROUTES`) : un jeton ne doit pas pouvoir activer l'exécution de code. Interrupteur et avertissement dans Paramètres, confirmation à l'activation. Sauvegarde : le réglage suit la base, une sauvegarde antérieure le ramène désactivé (testé). Étape ajoutée à l'étage `prod-deps` du Dockerfile : QuickJS s'exécute sur chaque plateforme. Exemple Cloudflare complété : avec Code Mode côté serveur, plus besoin de `createCodeTool` ; non exécuté contre Cloudflare.
- 2026-11-27 : Notes de version : `breaking: false`, aucune action obligatoire. Nouvelle fonctionnalité visible, désactivée par défaut : Code Mode du serveur MCP (outils `search` et `execute`, code de l'agent exécuté sur le serveur dans un bac à sable QuickJS en WebAssembly, avec les droits du jeton), activé par l'admin dans Paramètres > « Serveur MCP : Code Mode ». Une migration, `20261127200000_site_code_mode`, ajoute le réglage, désactivé : aucune valeur existante ne change (copie `pre-migrate` faite par l'entrypoint au premier démarrage).
