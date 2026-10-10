---
id: D-12
title: "Première release v1.5.0"
phase: D
lane: ci
criticite: haute
effort: S
status: done
owner: mixed
depends_on: [D-11]
touches: [docs/releases/v1.5.0.md, UPGRADING.md]
sources: ["07-devops-history.md §3.4"]
branch: docs/D-12-close-first-release
pr: 40
---

## Décisions validées (2026-10-09)

- **Versions.** v1.5.0 = phase A, taguée après le merge de D-11.
- **Test du pipeline.** Pas de tag jetable publié : les vraies versions servent de test, `v1.5.0-rc.1` sur `develop` (pré-version) puis `v1.5.0` sur `main` (finale). La règle de branche se vérifie avec un tag sur une branche jetable, qui doit échouer avant tout push d'image, puis qu'on supprime.
- **Accord humain.** Chaque tag demande l'accord de l'humain ; il est déjà donné pour cette séquence (tag sur branche jetable, `v1.5.0-rc.1`, `v1.5.0`).

## Contexte

D-11 réécrit le workflow de release et rédige les notes de v1.5.0, mais ses effets ne se vérifient qu'avec de vrais tags poussés sur GitHub, après son merge. Cette tâche publie la première version avec le nouveau modèle et sert de test de bout en bout du pipeline. Elle mêle des actions d'agent (tags, vérifications) et des actions humaines (PR `develop` → `main`, contrôle de l'instance).

## Problème constaté

- La dernière release est v1.4.0, publiée avec l'ancien workflow (`latest` déplacé à chaque tag, changelog fait de commits de merge, aucune action obligatoire).
- La phase A est terminée sur `develop` et impose des actions à la mise à jour (`JWT_SECRET`, photos à récupérer avec `docker cp`) : les utilisateurs de `:latest` doivent les connaître avant de tirer la nouvelle image.

## Ce qu'il faut faire

Chaque étape est vérifiée avant de passer à la suivante. Pousser la branche avant le tag (sinon la règle de branche lit un `origin/<branche>` en retard).

1. **Gel du contenu.** Vérifier que `develop` ne contient que la phase A, D-11 et les PR de documentation. Si une autre PR a été mergée après D-11, reprendre sa section « Required actions » dans `docs/releases/v1.5.0.md` et `UPGRADING.md` (PR sur `develop`) avant de continuer. **Gel** : du tag `v1.5.0-rc.1` (étape 3) jusqu'au merge `develop` → `main` (étape 4), le coordinateur ne merge rien sur `develop`, sauf les corrections des notes de release (`docs/releases/v1.5.0.md`, `UPGRADING.md`). Sinon la PR `develop` → `main` emporterait dans v1.5.0 des changements non testés par la pré-version et absents des notes.
2. **Règle de branche.** Créer une branche jetable depuis `develop` avec un commit vide, la pousser, y poser un tag de pré-version au format valide qui ne servira jamais (ex. `v1.5.0-rc.0`) et le pousser. Attendu : échec au job `verify` sur la règle de branche, aucune image sur ghcr.io, aucune release. Supprimer ensuite le tag (local et distant), la branche et l'exécution échouée.
3. **Pré-version.** Taguer `v1.5.0-rc.1` sur `develop` et le pousser. Vérifier :
   - la release marquée pre-release, avec Summary, Changes, Required actions (before / after), la liste des PR et les commandes `docker pull`, tirés de `docs/releases/v1.5.0.md` ;
   - les images `:1.5.0-rc.1` (backend et frontend) ;
   - `latest` pointe toujours sur v1.4.0 (`docker buildx imagetools inspect`).
   Si possible, l'humain teste l'image sur une copie de son instance en suivant les « Required actions », avec le compose du tag `v1.5.0-rc.1` et les images `:1.5.0-rc.1` : l'URL `v1.5.0` et le tag `:1.5.0` n'existent qu'après l'étape 5 (ligne « Testing a pre-release » des notes).
4. **Passage sur `main`** (humain). PR `develop` → `main` (merge commit, D-07), CI verte, merge.
5. **Version finale.** Taguer `v1.5.0` sur `main` et le pousser. Vérifier la release normale, les images `:1.5.0` et `latest` déplacé, et `PREV_TAG` = `v1.4.0` (liste des PR depuis v1.4.0).
6. Fin du gel : le coordinateur peut merger de nouveau sur `develop` dès que l'étape 4 est faite (le contenu de v1.5.0 est alors fixé sur `main`). Si l'étape 5 échoue, la corriger par une PR de notes sur `develop` puis une nouvelle PR `develop` → `main` : ne merger d'autres PR qu'après le tag `v1.5.0`.

## Critères d'acceptation

- [x] Tag sur une branche jetable : échec au `verify` sur la règle de branche, aucune image, aucune release ; tag et branche supprimés.
- [x] `v1.5.0-rc.1` sur `develop` : images `:1.5.0-rc.1` publiées, `latest` inchangé, release marquée pre-release avec les notes de `v1.5.0.md`.
- [x] `v1.5.0` sur `main` : images `:1.5.0` et `latest`, release normale, `PREV_TAG` = `v1.4.0`.
- [x] Les notes de v1.5.0 recommandent l'épinglage sur `:1.5.0` (le tag `:<majeure>.<mineure>` n'existe qu'après D-05).
- [x] (humain) L'instance de production est passée en v1.5.0 en suivant `UPGRADING.md`. Fait sur une instance réelle passée directement de v1.4.0 à v1.6.0 (actions v1.5.0 et v1.6.0 cumulées) ; voir le Journal.

## Tests à ajouter ou adapter

- Pas de code : les vérifications ci-dessus tiennent lieu de tests. Les consigner dans le Journal (liens vers les exécutions du workflow et les releases).
- `docker pull ghcr.io/lulu300/carta-cocktail/backend:1.5.0-rc.1` puis `docker run` avec un `.env` de test : l'API démarre.

## Points d'attention

- Ne jamais repousser un tag déjà publié. Si `v1.5.0-rc.1` échoue après le push d'une image (ex. job `github-release`), corriger sur `develop` et taguer `v1.5.0-rc.2`.
- Le tag de la branche jetable ne publie rien et peut être supprimé sans trace ; vérifier quand même sur ghcr.io qu'aucune image `1.5.0-rc.0` n'existe.
- Si une correction de notes est nécessaire entre `-rc.1` et `v1.5.0`, elle passe par une PR sur `develop`, puis par la PR `develop` → `main`.
- `touches` ne liste que les fichiers à compléter si l'étape 1 l'exige ; en temps normal, la tâche ne modifie aucun fichier.
- Statut : la tâche passe à `done` après l'étape 5, dans une petite PR sur `develop` qui coche les critères et renseigne le Journal.

## Journal

- 2026-10-09 : tâche créée lors de la revue de la PR #38 : critères post-merge et séquence réelle sortis de D-11.
- 2026-10-09 : deuxième revue de la PR #38. Gel aligné : rien sur `develop` du tag `v1.5.0-rc.1` au merge `develop` → `main`, sauf les corrections des notes (étapes 1 et 6).
- 2026-10-09 : revue de la PR #39 (D-11). Étape 3 : le test de la pré-version utilise le compose du tag `v1.5.0-rc.1` et les images `:1.5.0-rc.1`.
- 2026-10-09 : étapes 1 à 5 faites. Tag `v1.5.0-rc.0` sur une branche jetable refusé par `verify` (aucune image, aucune release, tag et branche supprimés). `v1.5.0-rc.1` ([exécution](https://github.com/Lulu300/carta-cocktail/actions/runs/37939165582)) : pre-release, images `:1.5.0-rc.1`, `latest` inchangé. PR `develop` → `main` #40, puis `v1.5.0` ([exécution](https://github.com/Lulu300/carta-cocktail/actions/runs/37940044631)) : release normale, images `:1.5.0` et `latest`, PR listées depuis v1.4.0.
- 2026-10-10 : le modèle a resservi pour v1.6.0 : `v1.6.0-rc.1` ([exécution](https://github.com/Lulu300/carta-cocktail/actions/runs/37954450873)), PR `develop` → `main` #49, `v1.6.0` ([exécution](https://github.com/Lulu300/carta-cocktail/actions/runs/38052396099)) : release Latest, images `:1.6.0` et `latest` déplacé, PR listées depuis v1.5.0 (#41 à #48).
- 2026-10-10 : critère humain. L'humain n'a pas d'instance à lui ; il a mis à jour l'instance réelle d'un ami de v1.4.0 à v1.6.0 en suivant `UPGRADING.md` (actions de v1.5.0 et v1.6.0 cumulées, volume des photos passé sur `/app/uploads`), après validation de ce même chemin sur le banc D-15 avec une copie de cette base. Résultat : sauvegarde `pre-migrate-*` créée, `0_init` marquée appliquée, WAL actif, `migrate status` à jour, photos servies, mot de passe admin changé depuis l'interface puis `ADMIN_PASSWORD` retiré du fichier d'environnement, connexion vérifiée après redémarrage. Une deuxième instance (autre ami, pas d'accès) reste en v1.4.0 ; l'humain juge la validation suffisante.
