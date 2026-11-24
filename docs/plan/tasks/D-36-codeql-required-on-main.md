---
id: D-36
title: "CodeQL obligatoire sur main seulement, après C-47 et C-48"
phase: D
lane: ci
criticite: basse
effort: S
status: done
owner: mixed
depends_on: [C-47, C-48]
touches: []
sources: []
branch: chore/D-36-codeql-required-on-main
pr: "#191"
---

## Contexte

D-07 a activé CodeQL en « default setup », check non obligatoire. D-35 a trié les alertes ouvertes : 4 faux positifs à fermer, et deux tâches de correction, C-47 (limitation de débit) et C-48 (log de `ADMIN_RESET_PASSWORD`).

État relevé le 2026-11-12 avec `gh api` :

- `code-scanning/default-setup` : `configured`, langages `actions`, `javascript`, `javascript-typescript` et `typescript` (analyses rangées dans les catégories `/language:actions` et `/language:javascript-typescript`), suite `default`, analyse planifiée `weekly`. Les analyses existantes portent sur `refs/heads/main` et `refs/pull/161/head` (PR `develop` → `main`) : CodeQL ne tourne que sur `main` et les PR vers `main`, jamais sur les PR vers `develop` (la PR #162 vers `develop` n'a aucun check CodeQL).
- Le check s'appelle `CodeQL`, app `github-advanced-security` (`integration_id` 57789).
- Ruleset 24936910 « Require PR and CI on main and develop » : `active` sur `refs/heads/main` et `refs/heads/develop`, PR obligatoire (merge commit seul), checks requis `Backend`, `Frontend`, `Docker build (backend)`, `Docker build (frontend)`, `Smoke (docker compose)` (app 15368), contournement `RepositoryRole` 5 (admin) en mode `pull_request`.

## Décisions validées

- 2026-11-12, humain (via D-35) : CodeQL n'est pas rendu obligatoire pour l'instant. Il le sera sur `main` seulement, une fois C-47 et C-48 arrivées sur `main`.
- 2026-11-24, humain : « Approve the code_scanning rule » — « Ruleset 'Require CodeQL on main' as written in D-36: threshold 'high_or_higher' for security alerts, 'errors' for other alerts. The agent applies it and records the ruleset id. » La variante `required_status_checks` n'est pas retenue.

## Problème constaté

Ajouter `CodeQL` aux checks requis du ruleset 24936910 bloquerait toutes les PR vers `develop`, où le check n'arrive jamais. Aujourd'hui, une PR `develop` → `main` peut être mergée avec un check `CodeQL` rouge (cas de la PR #161).

## Ce qu'il faut faire

1. Vérifier les préalables : C-47 et C-48 sont sur `main` (merge `develop` → `main` d'une release), et les alertes ouvertes sont réglées :
   ```bash
   gh api 'repos/Lulu300/carta-cocktail/code-scanning/alerts?state=open&per_page=100' \
     --jq '.[] | [.number, .rule.id, .most_recent_instance.location.path] | @tsv'
   ```
   Attendu : aucune alerte, ou seulement des alertes déjà acceptées par l'humain (fermetures de D-35 et « won't fix » de C-47 pas encore faites). Sinon, s'arrêter et demander.
2. Faire valider par l'humain la règle ci-dessous. Ne pas modifier le ruleset 24936910 : en créer un nouveau, ciblé sur `main` seul, avec la règle `code_scanning` (résultats CodeQL exigés, merge bloqué par une nouvelle alerte de sécurité `high` ou plus, ou une alerte de niveau `error`) et le même contournement que 24936910 :
   ```bash
   body=$(mktemp "${TMPDIR:-/tmp}/carta.XXXXXX")
   cat > "$body" <<'EOF'
   {
     "name": "Require CodeQL on main",
     "target": "branch",
     "enforcement": "active",
     "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
     "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }],
     "rules": [{
       "type": "code_scanning",
       "parameters": { "code_scanning_tools": [
         { "tool": "CodeQL", "security_alerts_threshold": "high_or_higher", "alerts_threshold": "errors" }
       ] }
     }]
   }
   EOF
   gh api -X POST repos/Lulu300/carta-cocktail/rulesets --input "$body"
   rm "$body"
   ```
   Variante si l'humain la préfère : un ruleset sur `main` seul avec une règle `required_status_checks` sur le contexte `CodeQL`, `integration_id` 57789. Le seuil est alors celui des réglages « Code scanning » du dépôt.
3. Contrôler : `gh api repos/Lulu300/carta-cocktail/rules/branches/main` contient la règle `code_scanning`, `gh api repos/Lulu300/carta-cocktail/rules/branches/develop` ne la contient pas. À la PR `develop` → `main` suivante, le check `CodeQL` est exigé ; une PR vers `develop` n'attend pas CodeQL.
4. Noter l'id du nouveau ruleset dans le Journal (comme D-07 pour les rulesets 24936910 et 13123732).

## Critères d'acceptation

- [x] Préalables vérifiés : C-47 et C-48 sur `main`, alertes ouvertes réglées ou acceptées par l'humain.
- [x] Nouveau ruleset actif sur `main` seulement, avec CodeQL exigé ; ruleset 24936910 inchangé.
- [ ] Une PR vers `develop` se merge sans CodeQL ; la PR `develop` → `main` suivante attend CodeQL. Contrôlé par l'API (`rules/branches/<branche>`) le 2026-11-24 ; reste à observer sur la prochaine PR de release, sans PR de test vers `main`.
- [x] Id du ruleset et réglage retenu notés dans le Journal.

## Tests à ajouter ou adapter

Aucun test de code. Contrôle par `gh api .../rules/branches/<branche>` et sur la PR `develop` → `main` suivante.

## Points d'attention

- Changement de réglage GitHub : action humaine, ou faite par un agent après l'accord explicite de l'humain sur le JSON final.
- Un faux positif sur une PR de release bloquera le merge : le fermer avec un motif validé par l'humain (comme dans D-35) et relancer l'analyse, plutôt que contourner la règle avec les droits admin.
- L'analyse hebdomadaire de `main` peut ouvrir des alertes avec une nouvelle version des requêtes CodeQL ; la règle ne juge que les alertes apportées par la PR.
- Ne jamais utiliser `gh pr merge --admin` (D-07).

## Journal

- 2026-11-12 : tâche créée par D-35 ; état de CodeQL et du ruleset 24936910 relevé avec `gh api` (voir Contexte).
- 2026-11-13 : préalables de l'étape 1 remplis. Après la release v1.13.0 (PR #189), aucune alerte CodeQL n'est ouverte sur `main` : #27 et les 19 `js/missing-rate-limiting` sont `fixed`, et les 4 faux positifs de D-35 restent fermés. La tâche peut être prise ; l'étape 2 attend toujours l'accord de l'humain sur la règle (`owner: mixed`).
- 2026-11-24 : préalables revérifiés. Aucune alerte CodeQL ouverte (la commande de l'étape 1 ne renvoie rien) ; C-47 (#169) et C-48 (#168) sont sur `main` ; dernière analyse de `main` le 2026-11-21 (catégories `/language:actions` et `/language:javascript-typescript`). Le ruleset 24936910 a toujours le contournement `RepositoryRole` 5 en mode `pull_request`, identique au JSON de l'étape 2 ; seuls les rulesets 13123732 et 24936910 existaient.
- 2026-11-24 : ruleset **27973452** « Require CodeQL on main » créé avec le JSON de l'étape 2, sans changement (décision de l'humain du même jour) : `active`, `refs/heads/main` seul, règle `code_scanning` pour `CodeQL` avec `security_alerts_threshold: high_or_higher` et `alerts_threshold: errors`, contournement `RepositoryRole` 5 en `pull_request`. Contrôles : `rules/branches/main` renvoie `deletion` et `non_fast_forward` (13123732), `code_scanning` (27973452), `pull_request` et `required_status_checks` (24936910) ; `rules/branches/develop` renvoie les mêmes règles sans `code_scanning`. Le ruleset 24936910 n'a pas changé (`updated_at` toujours 2026-11-05T21:30:01). Aucune PR de test vers `main` : le blocage effectif se verra à la prochaine PR de release `develop` → `main`.
