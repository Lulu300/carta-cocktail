---
id: D-07
title: "Gouvernance Git : protection des branches, conventions de commit, nettoyage"
phase: D
lane: docs
criticite: basse
effort: S
status: todo
owner: mixed
depends_on: []
touches: [.mailmap, .github/]
sources: ["07-devops-history.md §1.3"]
branch:
pr:
---

## Décisions validées (2026-10-08)

- **Commits** : Conventional Commits (`fix:`, `feat:`, `chore(deps):`…).
- **Titres de PR** : `ID: titre` (ex. `A-02: conserver les sections`).
- **`.mailmap`** : identité canonique `Ludwig SIMON <ludwig@simonl.fr>`.
- Les réglages GitHub (protection de `main` et `develop`, suppression automatique des branches) restent à faire par l'humain après le merge.

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

- [ ] `git shortlog -sne` n'affiche plus qu'une seule identité.
- [ ] `.github/pull_request_template.md` et `.github/release.yml` existent.
- [ ] (humain) Un `git push origin main` direct est refusé.
- [ ] (humain) Une PR vers `develop` avec le check `Backend` rouge ne peut pas être mergée.
- [ ] (humain) La branche d'une PR mergée est supprimée automatiquement.
- [ ] (humain) `git branch -r` ne liste plus que `main`, `develop` et les branches ouvertes.

## Tests à ajouter ou adapter

- `git check-mailmap "Lulu300 <ludwig@simonl.fr>"` et `git check-mailmap "<lulu@MacBook-Pro-de-Ludwig.local>"` renvoient l'identité canonique.
- Après le réglage humain : ouvrir une PR de test avec un test volontairement cassé, vérifier que le bouton de merge est bloqué, puis la fermer.

## Points d'attention

- Les noms des checks obligatoires doivent correspondre exactement aux `name:` des jobs (`ci.yml:11,61`). Si D-04 ou D-08 ajoutent des jobs, mettre à jour le ruleset. Un check requis qui ne tourne jamais bloque toutes les PR.
- Avec `pull_request` obligatoire, Dependabot (D-06) et les agents passent par des PR, ce qui est voulu. Le bypass admin reste disponible pour une urgence.
- Décision validée : convention des titres de PR. Le plan impose `ID: titre`. Les notes de release (D-05) se classent alors par labels, pas par préfixe de titre. Ne pas ajouter de lint de titre de PR (type `semantic-pull-request`), il rejetterait le format du plan.
- `commitlint` en CI : facultatif, à ne pas imposer tant que des PR de la phase A/B sont ouvertes avec des messages en style libre.
- La suppression des branches distantes est irréversible côté GitHub (récupérable seulement par SHA). L'humain la lance lui-même.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
