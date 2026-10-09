---
id: D-11
title: "Modèle de release : pré-versions sur develop, notes structurées, UPGRADING.md"
phase: D
lane: ci
criticite: haute
effort: S
status: todo
owner: agent
depends_on: []
touches: [.github/workflows/release.yml, docs/releases/, UPGRADING.md, README.md, docs/plan/README.md]
sources: ["07-devops-history.md §3.4"]
branch:
pr:
---

## Décisions validées (2026-10-09)

- **Versions.** v1.5.0 pour la phase A, taguée après le merge de cette tâche, puis des versions intermédiaires logiques pendant la refonte, et v2.0.0 à la fin de la refonte complète du plan. Les changements cassants (D-01, D-02, D-03) sortent donc en 1.x : accepté, avec `breaking: true` dans le front matter, les actions obligatoires dans les notes et `UPGRADING.md`, et l'épinglage sur `:<majeure>.<mineure>` recommandé dans les notes.
- **Test du pipeline.** Pas de tag jetable publié : les vraies versions servent de test, `v1.5.0-rc.1` sur `develop` (pré-version) puis `v1.5.0` sur `main` (finale). La règle de branche se vérifie avec un tag sur une branche jetable, qui doit échouer avant tout push d'image, puis qu'on supprime. L'humain a donné son accord pour cette séquence de tags.
- **Releases.** Le travail se fait sur `develop`. Des tags de pré-version (`vX.Y.Z-rc.N`) peuvent être posés sur `develop` : ils publient des images Docker versionnées sans déplacer `latest`, et une GitHub Release marquée pre-release. Les versions finales sont taguées sur `main` et publiées de temps en temps, pas forcément à chaque version.
- **Notes.** Chaque release, pré-version comprise, a une GitHub Release avec un résumé court, un changelog détaillé et la liste des actions obligatoires pour passer à cette version (ex. créer `.env` avec de nouvelles variables). Les notes sont en anglais.
- **Guide de mise à jour.** Un utilisateur qui a plusieurs versions de retard voit l'enchaînement de toutes les actions obligatoires dans `UPGRADING.md`, et si possible dans son instance (F-09).

## Contexte

Les images publiées sur ghcr.io sont tirées en `:latest` par le NAS (`docker-compose.prod.yml`). La phase A apporte des actions obligatoires à la mise à jour (secrets dans `.env`, photos à récupérer avant le redéploiement) et les phases suivantes en ajoutent d'autres (migrations, conteneur non-root, port du frontend). Aujourd'hui, la release ne sait ni publier une version de test, ni dire à l'utilisateur ce qu'il doit faire avant et après la mise à jour. Cette tâche fixe le modèle de release ; D-05 le complète ensuite (CI avant les images, multi-arch, SBOM, version injectée).

## Problème constaté

- `.github/workflows/release.yml:3-6` : tout tag `v*` publie, quel que soit le commit pointé.
- `release.yml:46-48,57-59` : `latest` est déplacé à chaque tag, pré-version comprise.
- `release.yml:8-10` : `contents: write` et `packages: write` pour tout le workflow.
- `release.yml:73-95` : changelog construit avec `git log PREV..HEAD` (surtout des lignes « Merge pull request ... from Lulu300/develop »). `PREV_TAG` est le 2e tag par ordre de version (`:78`) : faux si un tag est poussé hors ordre, et `git tag --sort=-v:refname` classe `v1.5.0-rc.1` **après** `v1.5.0` sans `versionsort.suffix=-`.
- Aucune note rédigée, aucune liste d'actions obligatoires. Les consignes de mise à jour de la phase A sont dans `README.md` (« Upgrading from a version with default credentials »), sans numéro de version.

## Ce qu'il faut faire

1. **Format des notes.** Créer `docs/releases/TEMPLATE.md`, en anglais :
   ```markdown
   ---
   version: 1.5.0
   date: 2026-10-20
   breaking: false
   required_actions:
     - when: before        # before | after
       action: "Add JWT_SECRET (at least 32 characters) to .env."
     - when: after
       action: "If the admin password is still admin123, change it in Settings > Profile."
   ---

   ## Summary

   One or two sentences for the user.

   ## Changes

   Detailed changelog, grouped by area (public menu, admin, backend, Docker).

   ## Required actions

   ### Before upgrading

   1. ...

   ### After upgrading

   1. ...
   ```
   - Le front matter est la copie lisible par une machine (F-09) : `version` sans `v`, `date` ISO, `breaking` booléen, `required_actions` liste ordonnée de `{ when, action }`. `required_actions: []` quand il n'y a rien à faire.
   - La section « Required actions » est la version lisible : mêmes actions, même ordre, détails et commandes en plus. Écrire « None. » si la liste est vide.
   - Un fichier par version publiée : `docs/releases/vX.Y.Z.md`. Pour une pré-version : `docs/releases/vX.Y.Z-rc.N.md` s'il existe, sinon le fichier de la version cible `docs/releases/vX.Y.Z.md`, dont le `version` du front matter (`X.Y.Z`) est alors accepté. Un fichier `-rc.N` n'est utile que si la pré-version doit dire autre chose que la version cible : `v1.5.0-rc.1` utilise `v1.5.0.md`.
2. **`UPGRADING.md`** à la racine, en anglais : une introduction (« trouvez votre version, puis appliquez les sections des versions plus récentes, de la plus ancienne à la plus récente ») puis une section `## vX.Y.Z` par version finale ayant des actions obligatoires, **de la plus récente à la plus ancienne**, chacune avec « Before upgrading » / « After upgrading ». Une version sans action y figure avec « No required action. » pour que la chaîne reste lisible. L'introduction précise que les actions « before » se font avant de tirer la nouvelle image : l'instance ne peut pas les rappeler à temps (F-09), ce fichier fait référence.
3. **Première entrée : v1.5.0 (phase A).** Rédiger `docs/releases/v1.5.0.md` et la section v1.5.0 d'`UPGRADING.md` à partir des PR de la phase A. Actions connues, à vérifier dans les PR :
   - avant : renseigner `JWT_SECRET` (≥ 32 caractères) et, pour une base neuve, `ADMIN_PASSWORD` dans `.env` (A-04, PR #36) ;
   - avant : récupérer les photos existantes avec `docker cp` depuis le conteneur, elles ne sont pas dans le volume (A-01, PR #28) ;
   - après : remettre les photos dans le volume `uploads` ; changer le mot de passe s'il est encore `admin123` (A-04).
   Déplacer la section « Upgrading from a version with default credentials » de `README.md` dans cette entrée et la remplacer par un lien vers `UPGRADING.md`. Mettre à jour `README.md` « Git Workflow » (étape 6) et « CI/CD > Release » avec le modèle ci-dessous.
4. **`release.yml`**, réécrit en trois jobs. Esquisse :
   ```yaml
   on:
     push:
       tags: ["v*"]
   permissions:
     contents: read
   concurrency:
     group: release-${{ github.ref }}
   jobs:
     verify:
       runs-on: ubuntu-latest
       outputs:
         version: ${{ steps.tag.outputs.version }}
         prerelease: ${{ steps.tag.outputs.prerelease }}
         notes: ${{ steps.notes.outputs.path }}
         prev_tag: ${{ steps.prev.outputs.tag }}
       steps:
         - uses: actions/checkout@v5
           with: { fetch-depth: 0 }
         - id: tag
           name: Parse the tag
           run: |
             VERSION="${GITHUB_REF_NAME#v}"
             [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$ ]] || { echo "::error::Invalid tag $GITHUB_REF_NAME"; exit 1; }
             [[ "$VERSION" == *-* ]] && PRERELEASE=true || PRERELEASE=false
             echo "version=$VERSION" >> "$GITHUB_OUTPUT"
             echo "prerelease=$PRERELEASE" >> "$GITHUB_OUTPUT"
         - name: A final tag must be on main, a pre-release on develop or main
           run: |
             git fetch origin main develop
             git merge-base --is-ancestor "$GITHUB_SHA" origin/main && exit 0
             if [ "${{ steps.tag.outputs.prerelease }}" = true ] && git merge-base --is-ancestor "$GITHUB_SHA" origin/develop; then exit 0; fi
             echo "::error::$GITHUB_REF_NAME does not point to an allowed branch"; exit 1
         - id: notes
           name: Release notes file must exist
           run: |
             # docs/releases/<tag>.md, or for a pre-release the target version file
             # fail if missing, if the front matter does not parse (yq), or if its version does not match
         - id: prev
           name: Previous tag
           run: |
             # git -c versionsort.suffix=- tag --list 'v*' --sort=-v:refname
             # final: previous final tag; pre-release: previous tag, final or pre-release
     images:
       needs: verify
       runs-on: ubuntu-latest
       permissions: { contents: read, packages: write }
       # build-push-action as today; tags: <version> always, latest only when prerelease == 'false'
       # cache scope per service (backend / frontend)
     github-release:
       needs: [verify, images]
       runs-on: ubuntu-latest
       permissions: { contents: write }
       steps:
         # body = notes file without its front matter
         #      + "## Pull requests" from `gh api repos/{repo}/releases/generate-notes`
         #        with tag_name and previous_tag_name = needs.verify.outputs.prev_tag
         #      + "## Docker images" with the two docker pull commands in a code block
         - uses: softprops/action-gh-release@v2
           with:
             body_path: release-body.md
             prerelease: ${{ needs.verify.outputs.prerelease == 'true' }}
             make_latest: ${{ needs.verify.outputs.prerelease == 'true' && 'false' || 'true' }}
   ```
   - Le job `verify` échoue **avant tout push** si le tag ne respecte pas la règle de branche ou si le fichier de notes manque. La règle de branche passe avant le contrôle des notes : un tag sur une branche jetable échoue donc sur la règle de branche, même sans fichier de notes.
   - `yq` (mikefarah) est préinstallé sur les runners `ubuntu-latest` : `yq --front-matter=extract '.version' <fichier>`.
   - `generate-notes` classe les PR par labels si `.github/release.yml` existe (D-07).
5. **`docs/plan/README.md`** : ajouter une courte section « Releases » : modèle de tags ci-dessus, et règle pour les tâches. Une PR qui introduit une action obligatoire pour l'utilisateur (nouvelle variable, changement de port, migration manuelle) l'écrit dans les notes de la prochaine version (`docs/releases/vX.Y.Z.md`, créé s'il n'existe pas) et dans `UPGRADING.md`.

## Critères d'acceptation

- [ ] Le workflow implémente : tag final → `<version>` et `latest`, release normale ; pré-version → `<version>` seulement (`latest` inchangé), release marquée pre-release.
- [ ] Le workflow implémente : tag final hors de `main`, pré-version hors de `develop` et `main`, ou fichier de notes manquant → échec au job `verify`, rien de publié.
- [ ] Une pré-version sans fichier `-rc.N` utilise le fichier de la version cible.
- [ ] (après merge) Tag sur une branche jetable : échec au `verify`, aucune image, aucune release ; tag supprimé.
- [ ] (après merge) `v1.5.0-rc.1` sur `develop` : image `:1.5.0-rc.1` publiée, `latest` inchangé, release marquée pre-release avec les notes de `v1.5.0.md`.
- [ ] (après merge) `v1.5.0` sur `main` : images `:1.5.0` et `latest`, release normale, `PREV_TAG` = `v1.4.0`.
- [ ] Le corps de la release contient Summary, Changes, Required actions (before / after), la liste des PR et les commandes `docker pull`.
- [ ] `PREV_TAG` est correct pour une version finale (version finale précédente) et pour une pré-version (tag précédent).
- [ ] `contents: write` n'apparaît que sur le job `github-release`, `packages: write` que sur le job `images`.
- [ ] `docs/releases/TEMPLATE.md`, `docs/releases/v1.5.0.md` et `UPGRADING.md` existent ; leur front matter se lit avec `yq`.
- [ ] `README.md` renvoie vers `UPGRADING.md` et décrit le modèle de release.

## Tests à ajouter ou adapter

- `actionlint` sur `release.yml`.
- `yq --front-matter=extract '.' docs/releases/*.md` sur tous les fichiers de notes.
- Calcul de `PREV_TAG` testé en local sur une liste de tags fictive (`v1.4.0`, `v1.5.0-rc.1`, `v1.5.0-rc.2`, `v1.5.0`) : `v1.5.0` → `v1.4.0` ; `v1.5.0-rc.2` → `v1.5.0-rc.1` ; `v1.5.0-rc.1` → `v1.4.0`.
- Logique du job `verify` testée en local avant la PR (script extrait ou `act`) : tag final sur un commit de `develop` seul → échec ; pré-version sur `develop` → OK ; fichier de notes absent → échec ; pré-version sans fichier `-rc.N` → fichier de la version cible.
- Séquence réelle, après le merge (accord humain déjà donné, chaque étape vérifiée avant la suivante) :
  1. **Règle de branche** : créer une branche jetable depuis `develop` avec un commit vide, y poser un tag de pré-version au format valide qui ne servira jamais (ex. `v1.5.0-rc.0`), le pousser. Attendu : échec au `verify` sur la règle de branche, aucune image sur ghcr.io, aucune release. Supprimer le tag (local et distant), la branche et l'exécution échouée.
  2. **Pré-version** : `v1.5.0-rc.1` sur `develop`. Vérifier la release marquée pre-release (Summary, Changes, Required actions, PR, `docker pull`), l'image `:1.5.0-rc.1`, et que `latest` pointe toujours sur v1.4.0. Tester l'image sur une copie de l'instance si possible.
  3. **Finale** : merge `develop` → `main`, puis `v1.5.0` sur `main`. Vérifier la release normale, `:1.5.0` et `latest` déplacé, `PREV_TAG` = `v1.4.0`.

## Points d'attention

- La permission `contents: write` doit rester limitée au job de release ; le workflow garde `contents: read` par défaut.
- `PREV_TAG` pour une pré-version tirée de `develop` : la dernière version finale est taguée sur un commit de merge de `main`, qui n'est pas forcément un ancêtre de `develop`. Choisir le tag précédent par ordre de version (`versionsort.suffix=-`), pas avec `git describe`.
- Pas de tag jetable publié : `v1.5.0-rc.1` et `v1.5.0` sont de vraies versions. Si `v1.5.0-rc.1` échoue après le push d'une image (ex. job `github-release`), corriger puis taguer `v1.5.0-rc.2` : ne jamais repousser un tag déjà publié. Le tag de la branche jetable (étape 1) ne publie rien et peut être supprimé sans trace.
- `docs/releases/v1.5.0.md` doit être sur `develop` avant `v1.5.0-rc.1` : l'écrire dans cette PR. Il décrit tout ce que `develop` contient au moment du tag : si une autre tâche avec une action obligatoire (ex. C-01) est mergée avant, compléter le fichier, ou taguer avant ce merge.
- Le front matter et la section « Required actions » répètent les mêmes actions : la relecture de la PR de release vérifie qu'ils concordent. Alternative si l'écart devient fréquent : générer la section depuis le front matter dans le workflow.
- Taguer v1.5.0 après le merge de cette tâche (décision validée), pour que la première release porte déjà les actions obligatoires de la phase A.
- `AGENTS.md` (« Git Workflow », étape 10 ; « CI/CD ») décrit l'ancien modèle : transmettre à D-09.
- Suite : D-05 (CI avant les images, multi-arch, SBOM, version injectée) reprend ce workflow sans changer la règle de branche ni les notes. F-09 lit ces fichiers dans l'image.

## Journal

- 2026-10-09 : tâche créée à partir des décisions humaines du 2026-10-09 (versions, releases, guide de mise à jour).
- 2026-10-09 : réponses de l'humain. v1.5.0 après le merge de cette tâche ; changements cassants en 1.x acceptés avec garde-fous ; pas de tag jetable `v0.0.0-rc.1` : test par une branche jetable (règle de branche) puis `v1.5.0-rc.1` sur `develop` et `v1.5.0` sur `main`. Une pré-version utilise le fichier de la version cible. Critères, tests et points d'attention adaptés.
