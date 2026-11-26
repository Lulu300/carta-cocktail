---
id: F-15
title: "Serveur MCP pour piloter Carta, compatible Code Mode"
phase: F
lane: backend
criticite: basse
effort: L
status: todo
owner: mixed
depends_on: [F-14]
touches: [mcp/, backend/src/app.ts, backend/src/routes/, backend/package.json, backend/package-lock.json, README.md, docs/operations.md, .github/workflows/ci.yml, .github/workflows/release.yml]
sources: []
branch:
pr:
---

## Décisions à valider avant de commencer

L'humain a demandé cette tâche le 2026-11-26 : « un MCP qu'on puisse paramétrer pour faire la majorité des actions dont on a besoin, prévu pour être le plus compatible possible avec Code Mode ». Elle vient après F-14 (API documentée, OpenAPI et jetons d'API).

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
   - (a) Une route HTTP du backend, `POST /mcp` en transport Streamable HTTP, protégée par un jeton d'API de F-14.
   - (b) Un paquet séparé lancé par le client en stdio (`npx @carta/mcp`), qui appelle l'API d'une instance avec un jeton.
   - (c) Les deux, avec le même code d'outils.

   Recommandation : (a) pour un usage distant, et (b) si un client local l'exige.
3. **Périmètre des actions.** Lecture seule au départ, ou écriture aussi : créer ou modifier un cocktail, ajuster un stock, publier une carte. Les actions destructives (suppression, restauration de sauvegarde, « Se déconnecter partout ») restent-elles hors MCP ?

   Recommandation : lecture et écriture courantes. Suppressions et restauration hors MCP.

## Contexte

- F-14 fournit une spécification OpenAPI 3.1 générée depuis les schémas zod, ainsi que des jetons d'API révocables avec une portée.
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

- [ ] Un client MCP standard liste les outils, les appelle avec un jeton lecture seule (les écritures sont refusées), puis avec un jeton lecture et écriture.
- [ ] Un client Code Mode, par exemple le SDK Agents de Cloudflare, utilise le serveur sans adaptation, et l'exemple est documenté.
- [ ] Si `execute` est livré, aucun code du modèle ne peut lire un fichier, ouvrir une connexion, dépasser son temps ou sa mémoire, ni appeler une route sans le jeton. Des tests hostiles le prouvent.
- [ ] Les schémas des outils viennent de F-14. Un changement d'API casse un test, pas un outil en production.

## Tests à ajouter ou adapter

- Protocole : `initialize`, `tools/list`, `tools/call` pour chaque outil, erreurs.
- Portée des jetons et révocation.
- Bac à sable (si livré) : boucle infinie, allocation massive, `require`, `fetch` externe, accès à `process`, sortie énorme.
- Smoke : le MCP répond dans l'image Docker.

## Points d'attention

- Sécurité avant tout. Un MCP connecté donne à un agent les droits du jeton. La portée par défaut est en lecture seule, et la doc le dit.
- Exécuter du code venu d'un modèle est le risque principal du Code Mode côté serveur. Ne pas le livrer sans bac à sable éprouvé : `vm` de Node n'est pas un bac à sable.
- Le SDK MCP et le SDK Cloudflare évoluent vite : vérifier les versions et la spécification MCP au moment de commencer.
- Sources :
  - <https://blog.cloudflare.com/code-mode-mcp/>
  - <https://developers.cloudflare.com/agents/model-context-protocol/codemode/>
  - <https://developers.cloudflare.com/agents/model-context-protocol/guides/build-codemode-openapi-mcp-server/>

## Journal

- 2026-11-26 : tâche créée à la demande de l'humain (MCP compatible Code Mode), à faire après F-14 et les autres tâches du plan.
