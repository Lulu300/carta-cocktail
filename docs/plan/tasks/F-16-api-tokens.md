---
id: F-16
title: "Jetons d'API révocables, avec portée, pour les scripts et le MCP"
phase: F
lane: backend
criticite: basse
effort: M
status: done
owner: mixed
depends_on: [F-14]
touches: [backend/prisma/schema.prisma, backend/src/openapi/, e2e/tests/api-docs.spec.ts, backend/prisma/migrations/, backend/src/app.ts, backend/src/middleware/auth.ts, backend/src/routes/, backend/src/services/apiTokenService.ts, backend/src/services/backupService.ts, backend/src/validation/, backend/src/contracts/frontendTypes.ts, backend/src/test/, backend/src/i18n/, backend/AGENTS.md, frontend/src/types/, frontend/src/services/api.ts, frontend/src/queries/, frontend/src/components/admin/ApiTokenSettings.tsx, frontend/src/components/admin/EmbedMenuSettings.tsx, frontend/src/components/ui/CopyButton.tsx, frontend/src/pages/admin/SettingsPage.tsx, frontend/src/test/, frontend/src/i18n/locales/admin/, frontend/AGENTS.md, AGENTS.md, README.md, docs/operations.md]
sources: []
branch: feature/F-16-api-tokens
pr: 307
---

## Décisions

Tâche sortie de F-14 à la relecture de #289 (2026-11-26). F-15 (serveur MCP) en dépend.

Décisions de l'humain (2026-11-27) :

1. **Option (b).** Les jetons sont nommés, créés dans Paramètres et révocables un par un. Ils ont une date d'expiration et une portée : lecture seule, ou lecture et écriture. Seul leur hash est stocké. Une migration est nécessaire.
2. **« Se déconnecter partout » révoque aussi les jetons d'API.** La confirmation avertit clairement que les jetons d'API seront supprimés aussi, pour que l'utilisateur ne soit pas surpris. Le texte passe par l'i18n en et fr.

Choix du coordinateur (2026-11-27), appliqués :

- **Format.** `carta_` suivi de 32 octets aléatoires (`crypto.randomBytes`) en base64url. Hash SHA-256 indexé (unique), pas de bcrypt : le secret a 256 bits d'entropie. Le jeton n'est affiché qu'une fois ; la liste montre son nom et ses 4 derniers caractères. Au plus 20 jetons actifs (non expirés).
- **Expiration obligatoire.** 30, 90 ou 365 jours, 90 par défaut, pas d'option sans expiration.
- **Portée.** Un jeton en lecture seule n'accepte que `GET` et `HEAD` ; toute autre méthode reçoit 403 (erreur i18n).
- **Routes réservées à la session.** Gestion des jetons, mot de passe et compte, `logout-all`, export et restauration de sauvegarde : 403 pour tout jeton. Choix centralisé dans `SESSION_ONLY_ROUTES` (`backend/src/app.ts`).
- **Jeton invalide.** Révoqué, expiré ou inconnu : 401.
- **Limiteur.** Le limiteur de l'API s'applique aux jetons. `lastUsedAt` est écrit au plus une fois par minute et par jeton.
- **Sauvegarde.** Les jetons ne sont pas exportés ; une restauration les révoque tous. Les anciennes sauvegardes restent restaurables.
- **Migration** additive, avec la copie `pre-migrate` automatique.

## Contexte

L'authentification repose aujourd'hui sur un seul JWT de session (`backend/src/middleware/auth.ts`, `tokenVersion`). Rien n'existe pour un client automatique.

## Ce qu'il faut faire

1. Modèle `ApiToken` : nom, hash, portée, dernière utilisation, expiration. Révoquer un jeton supprime sa ligne (pas de colonne de révocation). La migration est faite avec une copie `pre-migrate`.
2. Écran dans Paramètres : créer un jeton (affiché une seule fois), lister, révoquer. Textes en i18n en et fr.
3. `authMiddleware` accepte `Authorization: Bearer carta_…`. Un jeton de portée lecture seule reçoit 403 sur les méthodes d'écriture. Un jeton révoqué ou expiré reçoit 401.
4. Le limiteur de l'API s'applique aussi aux jetons.
5. La spécification de F-14 déclare le schéma de sécurité. `docs/operations.md` explique comment créer un jeton et appeler l'API avec `curl`.

## Critères d'acceptation

- [x] Un jeton de portée lecture seule lit mais n'écrit pas (403).
- [x] Un jeton révoqué ou expiré reçoit 401.
- [x] Le jeton n'est stocké qu'en hash et n'est affiché qu'une fois.
- [x] Le comportement de « Se déconnecter partout » suit la décision 2.

## Tests à ajouter ou adapter

- Création, portée, révocation, expiration, hash et limiteur.
- Écran Paramètres : création, copie et révocation.

## Points d'attention

- La migration impose une release avec le banc de mise à jour (règle des releases de `docs/plan/README.md`).
- Une sauvegarde restaure aussi la table des jetons : décider si les jetons sont exclus de la restauration ou révoqués après, comme les sessions depuis C-30. Tranché : exclus de l'export et révoqués par la restauration.
- Changer le mot de passe ne révoque pas les jetons (seules les sessions le sont, comme avant) : la décision 2 ne vise que « Se déconnecter partout », que l'admin utilise après une fuite.

## Journal

- 2026-11-26 : tâche créée à la relecture de #289, en séparant les jetons d'API de F-14.
- 2026-11-27 : décisions de l'humain : option (b), et « Se déconnecter partout » révoque aussi les jetons, avec un avertissement clair dans la confirmation. Choix du coordinateur appliqués (format, expiration, portée, routes réservées à la session, limiteur, sauvegarde).
- 2026-11-27 : implémentation sur `feature/F-16-api-tokens` : modèle `ApiToken` et migration `20261127180000_api_tokens`, `services/apiTokenService.ts`, `authMiddleware` (jeton ou JWT), `refuseApiTokens` sur `SESSION_ONLY_ROUTES`, routes `/api/api-tokens`, export sans jetons (`secure_delete` sur la copie) et restauration qui les supprime, section « Jetons d'API » de Paramètres, `CopyButton` extrait d'`EmbedMenuSettings`.
- 2026-11-27 : après le merge de F-14 (#308) : routes `/api/api-tokens` déclarées avec `apiDocs`, schéma de sécurité `apiToken` (bearer `carta_…`) à côté de `bearerAuth` dans le document complet. L'accès est déduit des middlewares : `refuseApiTokens` devant une route la marque réservée à la session (sécurité `bearerAuth` seule, 403 `SessionOnly`), et une route admin qui écrit documente le 403 `ReadOnlyApiToken`. Section « Appeler l'API » de `docs/operations.md` mise à jour. Le parcours E2E de la page API ouvre le groupe « Auth » du menu latéral : le groupe « API tokens », premier dans l'ordre alphabétique, est maintenant le seul ouvert au chargement.
- 2026-11-27 : relecture de #307 : le document public (`/api/openapi.json`) ne décrit plus les jetons d'API (schéma `apiToken`, réponses `SessionOnly` et `ReadOnlyApiToken`, paragraphe de la description et sécurité des routes publiques réservés au document complet). « Se déconnecter partout » révoque les sessions même sans la table `ApiToken`, absente jusqu'au redémarrage qui suit la restauration d'une sauvegarde antérieure (comme les autres tables et colonnes récentes, la restauration n'applique pas les migrations : `restartRecommended`). `docs/operations.md` : révoquer les jetons après avoir remis une base à la main. Longueur maximale du nom partagée avec le frontend (`MAX_API_TOKEN_NAME_LENGTH`).
- 2026-11-27 : Notes de version : `breaking: false`, aucune action obligatoire. Nouvelle fonctionnalité visible : Paramètres > « Jetons d'API » crée des jetons nommés (`carta_…`, affichés une seule fois), en lecture seule ou en lecture et écriture, qui expirent après 30, 90 ou 365 jours, révocables un par un, pour les scripts et les clients MCP (`docs/operations.md`, « Jetons d'API »). Migration additive `20261127180000_api_tokens` (nouvelle table `ApiToken`, vide), appliquée au démarrage avec la copie `pre-migrate-*` automatique. « Sign out everywhere » supprime désormais aussi tous les jetons d'API, et sa confirmation le dit. Les jetons ne sont pas inclus dans les sauvegardes, et une restauration les supprime tous : recréer ensuite ceux des scripts. Les jetons ne peuvent pas gérer les jetons, changer le compte, déconnecter partout ni utiliser les sauvegardes (403).
