---
id: D-07
title: "Gouvernance Git : protection des branches, conventions de commit, nettoyage"
phase: D
lane: docs
criticite: basse
effort: S
status: done
owner: mixed
depends_on: []
touches: [.mailmap, .github/, docs/plan/tasks/D-04-ci-hardening.md, docs/plan/tasks/D-08-smoke-e2e-compose.md, docs/plan/tasks/D-09-docs-sync-ops-guide.md, docs/plan/tasks/D-24-pr-auto-labels.md]
sources: ["07-devops-history.md §1.3"]
branch: docs/D-07-git-governance
pr: "#97"
---

## Décisions validées (2026-10-08)

- **Commits** : Conventional Commits (`fix:`, `feat:`, `chore(deps):`…).
- **Titres de PR** : `ID: titre` (ex. `A-02: keep menu sections when saving`, en anglais).
- **`.mailmap`** : identité canonique `Ludwig SIMON <ludwig@simonl.fr>`.
- Les réglages GitHub (protection de `main` et `develop`, suppression automatique des branches) restent à faire par l'humain après le merge.

## Décisions validées (2026-10-12)

- **Mode de merge** : merge commit partout (feature → `develop` et `develop` → `main`) ; squash et rebase désactivés.
- **Rulesets** : un ruleset pour `main` et `develop` avec `pull_request` (`allowed_merge_methods: ["merge"]`, 0 approbation) et `required_status_checks` (`Backend`, `Frontend`, `strict_required_status_checks_policy: false`), contournable par le rôle admin en mode `pull_request` seulement. `deletion` et `non_fast_forward` sont dans un ruleset distinct, sans contournement, pour que la suppression automatique des branches ne puisse jamais supprimer `develop`.
- **Contournement admin** conservé pour les urgences ; les agents n'utilisent jamais `gh pr merge --admin` (transmis à D-09).
- **Sécurité** : CodeQL en « default setup » (check non obligatoire au début) et signalement privé des vulnérabilités activés.

## Contexte

Le repo est public et rien n'empêche un push direct sur `main` ni le merge d'une PR rouge. Avec plusieurs agents qui ouvrent des PR en parallèle (cf. `docs/plan/README.md`), la protection des branches et des checks obligatoires deviennent le dernier garde-fou. Le reste (identités, conventions, branches mortes) rend l'historique et les notes de release lisibles.

## Problème constaté

- Protection de branche : `gh api repos/Lulu300/carta-cocktail/branches/main/protection` renvoie 404. **Précision par rapport à la revue** : un ruleset « Main Protect » existe (id 13123732, créé le 23 février) mais il est `enforcement: disabled`, ne cible aucune branche (`include: []`) et ne contient que `deletion` et `non_fast_forward`. Il ne protège donc rien.
- `delete_branch_on_merge: false` (vérifié par `gh api repos/Lulu300/carta-cocktail`). Les trois modes de merge (merge, squash, rebase) sont activés.
- 15 branches feature/fix mergées restent en local et sur `origin` (`git branch -a --merged origin/main`).
- 3 identités pour une seule personne : `Ludwig SIMON <lulu@MacBook-Pro-de-Ludwig.local>` (46 commits), `Lulu300 <ludwig@simonl.fr>`, `Ludwig SIMON <ludwig@simonl.fr>`. Pas de `.mailmap`.
- Conventional Commits sur les 19 premiers commits, style libre ensuite. `AGENTS.md:22-37` ne fixe aucun format de message.
- Pas de modèle de PR ni de configuration des notes de release générées.

## Ce qu'il faut faire

Partie agent (PR) :
1. Créer `.mailmap` à la racine. Nom canonique validé :
   ```
   Ludwig SIMON <ludwig@simonl.fr>
   Ludwig SIMON <ludwig@simonl.fr> <lulu@MacBook-Pro-de-Ludwig.local>
   ```
   La 1re ligne remplace le nom `Lulu300` pour l'adresse `ludwig@simonl.fr`.
2. Créer `.github/pull_request_template.md` : id de tâche, résumé, checklist (tests ajoutés, `npm test`, lint, `tsc`, couverture ≥ 60 % global et ≥ 80 % delta, critères d'acceptation cochés dans le fichier de tâche).
3. Créer `.github/release.yml` (configuration des notes générées, distincte du workflow `.github/workflows/release.yml`), avec des catégories par label : `breaking`, `feature`, `fix`, `dependencies`, `ci`, `docs`.
4. Documenter la convention de commit dans la PR et la transmettre à D-09 pour `AGENTS.md` : Conventional Commits pour les messages de commit (`fix:`, `feat:`, `chore(deps):`...). Les titres de PR gardent le format du plan (`A-02: ...`).

Partie humaine (réglages GitHub, à faire après merge) :
5. Modifier le ruleset existant plutôt que d'en créer un second :
   ```bash
   gh api -X PUT repos/Lulu300/carta-cocktail/rulesets/13123732 --input ruleset.json
   ```
   avec `enforcement: active`, cible `refs/heads/main` et `refs/heads/develop`, règles `deletion`, `non_fast_forward`, `pull_request` (0 approbation requise, projet solo), `required_status_checks` avec `Backend` et `Frontend` (plus les checks de D-04 et D-08 une fois en place). Bypass : rôle admin, mode `pull_request` uniquement.
6. `gh api -X PATCH repos/Lulu300/carta-cocktail -F delete_branch_on_merge=true`.
7. Choisir les modes de merge : squash pour feature → develop, merge commit pour develop → main. Désactiver le rebase si inutile.
8. Supprimer les branches mergées :
   ```bash
   git branch --merged origin/main | grep -vE '^\*|main|develop' | xargs -n1 git branch -d
   git branch -r --merged origin/main | grep -vE 'HEAD|main|develop' | sed 's#origin/##' | xargs -n1 git push origin --delete
   ```
9. Sur le Mac : `git config --global user.email ludwig@simonl.fr`.
10. Facultatif, Settings > Code security : Dependabot alerts, secret scanning et push protection (gratuits sur un repo public), CodeQL en « default setup ».

## Critères d'acceptation

- [x] `git shortlog -sne` n'affiche plus qu'une seule identité (hors `dependabot[bot]`).
- [x] `.github/pull_request_template.md` et `.github/release.yml` existent.
- [x] (humain) Un `git push origin main` direct est refusé.
- [x] (humain) Une PR vers `develop` avec le check `Backend` rouge ne peut pas être mergée (constaté sur la PR #115 : `BLOCKED` tant que les checks requis n'étaient pas verts ; pas de PR rouge volontaire).
- [ ] (humain) La branche d'une PR mergée est supprimée automatiquement.
- [x] (humain) `git branch -r` ne liste plus que `main`, `develop` et les branches ouvertes.

## Tests à ajouter ou adapter

- `git check-mailmap "Lulu300 <ludwig@simonl.fr>"` et `git check-mailmap "<lulu@MacBook-Pro-de-Ludwig.local>"` renvoient l'identité canonique.
- Après le réglage humain : ouvrir une PR de test avec un test volontairement cassé, vérifier que le bouton de merge est bloqué, puis la fermer.

## Points d'attention

- Les noms des checks obligatoires doivent correspondre exactement aux `name:` des jobs (`ci.yml:11,61`). Si D-04 ou D-08 ajoutent des jobs, mettre à jour le ruleset. Un check requis qui ne tourne jamais bloque toutes les PR.
- Avec `pull_request` obligatoire, Dependabot (D-06) et les agents passent par des PR, ce qui est voulu. Le bypass admin reste disponible pour une urgence.
- Décision validée : convention des titres de PR. Le plan impose `ID: titre`. Les notes de release (D-11) se classent alors par labels, pas par préfixe de titre. Ne pas ajouter de lint de titre de PR (type `semantic-pull-request`), il rejetterait le format du plan.
- `commitlint` en CI : facultatif, à ne pas imposer tant que des PR de la phase A/B sont ouvertes avec des messages en style libre.
- La suppression des branches distantes est irréversible côté GitHub (récupérable seulement par SHA). L'humain la lance lui-même.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
- 2026-10-09 : les notes de release (liste des PR classée par labels) relèvent désormais de D-11, plus de D-05 : renvoi corrigé.
- 2026-10-12 : partie agent faite (PR #97) : `.mailmap`, `.github/pull_request_template.md`, `.github/release.yml` (catégories par label ; `bug`, `enhancement` et `documentation` acceptés comme alias ; catégorie « Other changes » pour les PR sans label ; label `skip-changelog` exclu). La partie humaine (étapes 5 à 10) est décrite dans la PR, avec l'état actuel relevé en lecture seule et les commandes prêtes à copier. Les critères « (humain) » restent à cocher après les réglages.
- 2026-10-12 : état relevé en lecture seule. `user.email` global vaut déjà `ludwig@simonl.fr` (étape 9 faite) ; `user.name` vaut `Lulu300`, ramené à `Ludwig SIMON` par le `.mailmap`. Secret scanning et push protection actifs, Dependabot alerts actives, security updates désactivées (décision de D-21), CodeQL non configuré. 35 branches distantes mergées dans `main`. Aucune PR du plan ne porte de label : création de D-24 (labels automatiques depuis le préfixe de branche). Convention de commit transmise à D-09 (Points d'attention) ; `AGENTS.md` la contient déjà.
- 2026-10-12 : décisions humaines sur la partie humaine (voir « Décisions validées (2026-10-12) ») : merge commit partout, un ruleset contournable (PR + checks) et un ruleset sans contournement (`deletion`, `non_fast_forward`), `strict` à `false`, CodeQL et signalement privé activés. Revue de la PR #97 traitée : procédure de reprise si `develop` est supprimée au premier merge `develop` → `main` (les PR ouvertes sur `develop` sont alors reciblées vers `main`), test de push direct sur `main` et `develop` après lecture de `rules/branches/<branche>`, suppression des branches distantes depuis la liste prévisualisée (avec SHA), contrôle à la première pré-version que les notes lisent bien `.github/release.yml`, contrôle de D-24 après son merge, et passage de relais à D-09 complété (corps de PR à partir du modèle, jamais `gh pr merge --admin`).
- 2026-10-12 : seconde revue de la PR #97. Si le ruleset PR/CI refuse de recréer `develop` (étape 6 de la PR), le passer en `disabled`, recréer la branche, puis le remettre en `active`. L'étape 3 de la PR récupère l'id du ruleset PR/CI (`--jq .id`) ; D-04 et D-08 le lisent dans ce Journal pour y ajouter leurs checks (Points d'attention de ces deux tâches complétés, fichiers ajoutés à `touches`).
- Rulesets : « Require PR and CI on main and develop », id 24936910 (créé le 2026-10-12) ; « Protect main and develop from deletion and force push », id 13123732.
- 2026-10-12 : partie humaine faite par l'humain, guidée par le coordinateur (une commande `gh` à la fois, chaque résultat vérifié) :
  - étape 3 : ruleset « Require PR and CI on main and develop » créé (id 24936910), `active` sur `main` et `develop`, contournement admin en mode `pull_request` seulement, PR obligatoire (merge commit seul), checks requis `Backend`, `Frontend`, `Docker build (backend)` et `Docker build (frontend)` (les deux derniers ajoutés d'emblée, cas A de la PR #112 de D-04). GitHub y a ajouté `require_extra_approval_for_unattributed_changes: true`, sans effet attendu avec 0 approbation : premier réglage à vérifier si une PR Dependabot reste bloquée sans raison visible ;
  - étape 1 : labels `breaking`, `feature`, `fix`, `docs` et `skip-changelog` créés ;
  - étape 2 : ruleset 13123732 renommé « Protect main and develop from deletion and force push », `active` sur `main` et `develop`, `deletion` et `non_fast_forward`, sans contournement. `rules/branches/main` et `rules/branches/develop` listent les quatre règles ;
  - étape 4 (après l'étape 2) : merge commit seul (`allow_squash_merge` et `allow_rebase_merge` à `false`), `delete_branch_on_merge: true` ;
  - étape 5 : un push direct d'un commit vide sur `main` et sur `develop`, depuis un clone jetable, est refusé avec `GH013` ;
  - étape 7 : les 35 branches distantes mergées dans `main` sont supprimées ; la liste avec les SHA est conservée hors dépôt par l'humain (restauration : `git push origin <sha>:refs/heads/<branche>`) ;
  - étape 8 : CodeQL (configuration par défaut) `configured`, signalement privé des vulnérabilités activé ; le check `CodeQL` n'est pas requis.
  Restent : critère « branche supprimée automatiquement » à constater au merge de la PR #115 ; étape 6 (`develop` intacte après le premier merge `develop` → `main`) et étape 9 (notes de la première pré-version tirées de `.github/release.yml`) à la prochaine release ; `git config --global user.name "Ludwig SIMON"` facultatif, non fait.
