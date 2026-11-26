---
id: F-16
title: "Jetons d'API révocables, avec portée, pour les scripts et le MCP"
phase: F
lane: backend
criticite: basse
effort: M
status: todo
owner: mixed
depends_on: [F-14]
touches: [backend/prisma/schema.prisma, backend/prisma/migrations/, backend/src/middleware/auth.ts, backend/src/routes/, backend/src/validation/, backend/src/i18n/, frontend/src/pages/admin/SettingsPage.tsx, frontend/src/i18n/locales/admin/, README.md, docs/operations.md]
sources: []
branch:
pr:
---

## Décisions à valider avant de commencer

Tâche sortie de F-14 à la relecture de #289 (2026-11-26). F-15 (serveur MCP) en dépend.

Choix à faire par l'humain (`owner: mixed`) :

1. **Faut-il des jetons d'API ?**
   - (a) Non. Un script se connecte avec l'email et le mot de passe et obtient le JWT de session habituel (`JWT_EXPIRES_IN`, révoqué par « Se déconnecter partout »). Un MCP branché en permanence doit alors se reconnecter.
   - (b) Oui. Des jetons nommés, créés dans Paramètres, révocables un par un, avec une date d'expiration et une portée (lecture seule, ou lecture et écriture). Seul leur hash est stocké. Une migration est nécessaire.
2. **« Se déconnecter partout » révoque-t-il aussi les jetons d'API ?** Oui, ou non (ils se révoquent à part, et l'écran le dit).

## Contexte

L'authentification repose aujourd'hui sur un seul JWT de session (`backend/src/middleware/auth.ts`, `tokenVersion`). Rien n'existe pour un client automatique.

## Ce qu'il faut faire (si la décision 1 retient b)

1. Modèle `ApiToken` : nom, hash, portée, dernière utilisation, expiration, révocation. La migration est faite avec une copie `pre-migrate`.
2. Écran dans Paramètres : créer un jeton (affiché une seule fois), lister, révoquer. Textes en i18n en et fr.
3. `authMiddleware` accepte `Authorization: Bearer carta_…`. Un jeton de portée lecture seule reçoit 403 sur les méthodes d'écriture. Un jeton révoqué ou expiré reçoit 401.
4. Le limiteur de l'API s'applique aussi aux jetons.
5. La spécification de F-14 déclare le schéma de sécurité. `docs/operations.md` explique comment créer un jeton et appeler l'API avec `curl`.

## Critères d'acceptation

- [ ] Un jeton de portée lecture seule lit mais n'écrit pas (403).
- [ ] Un jeton révoqué ou expiré reçoit 401.
- [ ] Le jeton n'est stocké qu'en hash et n'est affiché qu'une fois.
- [ ] Le comportement de « Se déconnecter partout » suit la décision 2.

## Tests à ajouter ou adapter

- Création, portée, révocation, expiration, hash et limiteur.
- Écran Paramètres : création, copie et révocation.

## Points d'attention

- La migration impose une release avec le banc de mise à jour (règle des releases de `docs/plan/README.md`).
- Une sauvegarde restaure aussi la table des jetons : décider si les jetons sont exclus de la restauration ou révoqués après, comme les sessions depuis C-30.

## Journal

- 2026-11-26 : tâche créée à la relecture de #289, en séparant les jetons d'API de F-14.
