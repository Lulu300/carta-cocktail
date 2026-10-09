---
id: D-11
title: "Modèle de release : pré-versions sur develop, notes structurées, UPGRADING.md"
phase: D
lane: ci
criticite: haute
effort: M
status: done
owner: agent
depends_on: []
touches: [.github/workflows/release.yml, docs/releases/, UPGRADING.md, README.md, docs/plan/README.md, docs/plan/tasks/D-09-docs-sync-ops-guide.md]
sources: ["07-devops-history.md §3.4"]
branch: chore/D-11-release-model
pr: 39
---

## Décisions validées (2026-10-09)

- **Versions.** v1.5.0 pour la phase A, taguée après le merge de cette tâche, puis des versions intermédiaires logiques pendant la refonte, et v2.0.0 à la fin de la refonte complète du plan. Les changements cassants (D-01, D-02, D-03) sortent donc en 1.x : accepté, avec `breaking: true` dans le front matter, les actions obligatoires dans les notes et `UPGRADING.md`, et une recommandation d'épinglage dans les notes.
- **Releases.** Le travail se fait sur `develop`. Les tags de pré-version (`vX.Y.Z-rc.N`) se posent **uniquement sur `develop`** : ils publient des images Docker versionnées sans déplacer `latest`, et une GitHub Release marquée pre-release. Les versions finales sont taguées sur `main` et publiées de temps en temps, pas forcément à chaque version.
- **Notes.** Chaque release, pré-version comprise, a une GitHub Release avec un résumé court, un changelog détaillé et la liste des actions obligatoires pour passer à cette version (ex. créer `.env` avec de nouvelles variables). Les notes sont en anglais.
- **Rédaction des notes.** Les tâches ne touchent ni `docs/releases/` ni `UPGRADING.md`. Toute PR qui impose une action à l'utilisateur ou un changement cassant a une section « Required actions » dans sa description et une ligne « Notes de version » dans le Journal de sa tâche. Au moment de la release, le coordinateur reprend ces sections dans `docs/releases/vX.Y.Z.md` et `UPGRADING.md`.
- **Guide de mise à jour.** Un utilisateur qui a plusieurs versions de retard voit l'enchaînement de toutes les actions obligatoires dans `UPGRADING.md`, et si possible dans son instance (F-09).
- **Première release.** La séquence réelle (`v1.5.0-rc.1` sur `develop`, puis `v1.5.0` sur `main`) est la tâche D-12, après le merge de celle-ci. Pas de tag jetable publié.

## Contexte

Les images publiées sur ghcr.io sont tirées en `:latest` par le NAS (`docker-compose.prod.yml`). La phase A apporte des actions obligatoires à la mise à jour (secrets dans `.env`, photos à récupérer avant le redéploiement) et les phases suivantes en ajoutent d'autres (migrations, conteneur non-root, port du frontend). Aujourd'hui, la release ne sait ni publier une version de test, ni dire à l'utilisateur ce qu'il doit faire avant et après la mise à jour. Cette tâche fixe le modèle de release ; D-12 publie la première version avec ce modèle ; D-05 le complète ensuite (CI avant les images, multi-arch, SBOM, version injectée).

## Problème constaté

- `.github/workflows/release.yml:3-6` : tout tag `v*` publie, quel que soit le commit pointé.
- `release.yml:46-48,57-59` : `latest` est déplacé à chaque tag, pré-version comprise.
- `release.yml:8-10` : `contents: write` et `packages: write` pour tout le workflow.
- `release.yml:73-95` : changelog construit avec `git log PREV..HEAD` (surtout des lignes « Merge pull request ... from Lulu300/develop »). `PREV_TAG` est le 2e tag par ordre de version (`:78`) : faux si un tag est poussé hors ordre, et sans `versionsort.suffix=-`, `git tag --sort=-v:refname` considère `v1.5.0-rc.1` comme plus récent que `v1.5.0`.
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

   <!-- Breaking release: recommend pinning the images to :<version>
        (or :<major>.<minor> once D-05 publishes that tag) instead of :latest. -->

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
   - Épinglage recommandé pour une release cassante : `:<version>` tant que D-05 n'est pas mergée (le tag `:<majeure>.<mineure>` n'existe pas encore), `:<majeure>.<mineure>` ensuite.
   - Un fichier par version publiée : `docs/releases/vX.Y.Z.md`. Pour une pré-version : `docs/releases/vX.Y.Z-rc.N.md` s'il existe, sinon le fichier de la version cible `docs/releases/vX.Y.Z.md`, dont le `version` du front matter (`X.Y.Z`) est alors accepté. Un fichier `-rc.N` n'est utile que si la pré-version doit dire autre chose que la version cible : `v1.5.0-rc.1` utilise `v1.5.0.md`.
2. **`UPGRADING.md`** à la racine, en anglais : une introduction (« trouvez votre version, puis appliquez les sections des versions plus récentes, de la plus ancienne à la plus récente ») puis une section `## vX.Y.Z` par version finale ayant des actions obligatoires, **de la plus récente à la plus ancienne**, chacune avec « Before upgrading » / « After upgrading ». Une version sans action y figure avec « No required action. » pour que la chaîne reste lisible. L'introduction précise que les actions « before » se font avant de tirer la nouvelle image : l'instance ne peut pas les rappeler à temps (F-09), ce fichier fait référence.
3. **Première entrée : v1.5.0 (phase A).** Rédiger `docs/releases/v1.5.0.md` et la section v1.5.0 d'`UPGRADING.md` à partir des PR de la phase A. Actions connues, à vérifier dans les PR :
   - avant : renseigner `JWT_SECRET` (≥ 32 caractères) et, pour une base neuve, `ADMIN_PASSWORD` dans `.env` (A-04, PR #36) ;
   - avant : récupérer les photos existantes avec `docker cp` depuis le conteneur, elles ne sont pas dans le volume (A-01, PR #28) ;
   - après : remettre les photos dans le volume `uploads` ; changer le mot de passe s'il est encore `admin123` (A-04).
   v1.5.0 est cassante pour une instance sans `JWT_SECRET` (le backend refuse de démarrer) : `breaking: true`, épinglage recommandé sur `:1.5.0`.
   Déplacer la section « Upgrading from a version with default credentials » de `README.md` dans cette entrée et la remplacer par un lien vers `UPGRADING.md`. Mettre à jour `README.md` « Git Workflow » (étape 6) et « CI/CD > Release » avec le modèle ci-dessous, en précisant qu'on pousse la branche **avant** le tag.
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
         - name: A final tag must be reachable from main, a pre-release from develop
           run: |
             # Peel the tag: GITHUB_SHA is not guaranteed to be the commit for an annotated tag
             COMMIT=$(git rev-parse "${GITHUB_REF}^{commit}")
             if [ "${{ steps.tag.outputs.prerelease }}" = true ]; then BRANCH=develop; else BRANCH=main; fi
             git merge-base --is-ancestor "$COMMIT" "origin/$BRANCH" && exit 0
             echo "::error::$GITHUB_REF_NAME ($COMMIT) is not reachable from origin/$BRANCH"; exit 1
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
   - Règle de branche : un tag final doit pointer sur un commit **atteignable depuis** `origin/main`, une pré-version sur un commit atteignable depuis `origin/develop`. Un commit de `develop` déjà mergé dans `main` est donc accepté pour une version finale : c'est voulu.
   - Le job `verify` échoue **avant tout push** si le tag ne respecte pas la règle de branche ou si le fichier de notes manque. La règle de branche passe avant le contrôle des notes : un tag sur une branche jetable échoue donc sur la règle de branche, même sans fichier de notes.
   - `checkout` avec `fetch-depth: 0` récupère `origin/main`, `origin/develop` et les tags : pas de `git fetch` supplémentaire. Si la branche n'a pas été poussée avant le tag, `origin/<branche>` est en retard et la règle échoue : d'où la consigne de l'étape 3.
   - `yq` (mikefarah) est préinstallé sur les runners `ubuntu-latest` : `yq --front-matter=extract '.version' <fichier>`.
   - `generate-notes` classe les PR par labels si `.github/release.yml` existe (D-07).
5. **`docs/plan/README.md`** : ajouter une courte section « Releases » (modèle de tags, branche poussée avant le tag, renvoi vers D-12 pour la première release). La règle de rédaction des notes (voir « Décisions validées ») est déjà dans « Règles pour un agent » ; la relire et la garder cohérente avec le workflow.

## Critères d'acceptation

- [x] Le workflow implémente : tag final → `<version>` et `latest`, release normale ; pré-version → `<version>` seulement (`latest` inchangé), release marquée pre-release.
- [x] Le workflow implémente : tag final non atteignable depuis `main`, pré-version non atteignable depuis `develop` (y compris une pré-version posée sur `main` seul), ou fichier de notes manquant → échec au job `verify`, rien de publié.
- [x] Le commit du tag est obtenu avec `git rev-parse "${GITHUB_REF}^{commit}"`.
- [x] Une pré-version sans fichier `-rc.N` utilise le fichier de la version cible.
- [x] Le corps de la release contient Summary, Changes, Required actions (before / after), la liste des PR et les commandes `docker pull`.
- [x] `PREV_TAG` est correct pour une version finale (version finale précédente) et pour une pré-version (tag précédent).
- [x] `contents: write` n'apparaît que sur le job `github-release`, `packages: write` que sur le job `images`.
- [x] `docs/releases/TEMPLATE.md`, `docs/releases/v1.5.0.md` et `UPGRADING.md` (section v1.5.0) existent ; leur front matter se lit avec `yq`.
- [x] `README.md` renvoie vers `UPGRADING.md`, décrit le modèle de release et dit de pousser la branche avant le tag.

## Tests à ajouter ou adapter

- `actionlint` sur `release.yml`.
- `yq --front-matter=extract '.' docs/releases/*.md` sur tous les fichiers de notes.
- Calcul de `PREV_TAG` testé en local sur une liste de tags fictive (`v1.4.0`, `v1.5.0-rc.1`, `v1.5.0-rc.2`, `v1.5.0`) : `v1.5.0` → `v1.4.0` ; `v1.5.0-rc.2` → `v1.5.0-rc.1` ; `v1.5.0-rc.1` → `v1.4.0`.
- Logique du job `verify` testée en local avant la PR (script extrait ou `act`), dans un dépôt de test avec des branches `main` et `develop` : tag final sur un commit de `develop` absent de `main` → échec ; tag final sur `main` → OK ; pré-version sur `develop` → OK ; pré-version sur un commit de `main` absent de `develop` → échec ; tag annoté → même résultat qu'un tag léger ; fichier de notes absent → échec ; pré-version sans fichier `-rc.N` → fichier de la version cible.
- Les essais avec de vrais tags (branche jetable, `v1.5.0-rc.1`, `v1.5.0`) relèvent de D-12.

## Points d'attention

- La permission `contents: write` doit rester limitée au job de release ; le workflow garde `contents: read` par défaut.
- `PREV_TAG` pour une pré-version tirée de `develop` : la dernière version finale est taguée sur un commit de merge de `main`, qui n'est pas forcément un ancêtre de `develop`. Choisir le tag précédent par ordre de version (`versionsort.suffix=-`), pas avec `git describe`.
- `docs/releases/v1.5.0.md` doit être sur `develop` avant `v1.5.0-rc.1` : l'écrire dans cette PR. v1.5.0 = phase A : si une PR du lot suivant est mergée entre cette tâche et le tag `v1.5.0-rc.1`, compléter le fichier avec ses « Required actions ». Ensuite, du tag `v1.5.0-rc.1` jusqu'au merge `develop` → `main`, rien n'est mergé sur `develop` sauf les corrections des notes de release (gel, voir D-12 étapes 1 et 6).
- Le front matter et la section « Required actions » répètent les mêmes actions : la relecture de la PR de release vérifie qu'ils concordent. Alternative si l'écart devient fréquent : générer la section depuis le front matter dans le workflow.
- Les sections « Required actions » des PR de tâches sont la matière première des notes : le coordinateur les relève à chaque merge (Journal, ligne « Notes de version ») pour ne rien perdre entre deux releases.
- `AGENTS.md` (« Git Workflow », étape 10 ; « CI/CD ») décrit l'ancien modèle : transmettre à D-09.
- Suite : D-12 (première release), D-05 (CI avant les images, multi-arch, SBOM, version injectée, tag `:<majeure>.<mineure>`), qui reprend ce workflow sans changer la règle de branche ni les notes. F-09 lit ces fichiers dans l'image.

## Journal

- 2026-10-09 : tâche créée à partir des décisions humaines du 2026-10-09 (versions, releases, guide de mise à jour).
- 2026-10-09 : réponses de l'humain. v1.5.0 après le merge de cette tâche ; changements cassants en 1.x acceptés avec garde-fous ; pas de tag jetable `v0.0.0-rc.1` : test par une branche jetable (règle de branche) puis `v1.5.0-rc.1` sur `develop` et `v1.5.0` sur `main`. Une pré-version utilise le fichier de la version cible. Critères, tests et points d'attention adaptés.
- 2026-10-09 : revue de la PR #38. Pré-versions uniquement sur `develop` (ascendance `main` vérifiée seulement pour une version finale) ; commit du tag via `git rev-parse "${GITHUB_REF}^{commit}"` ; « atteignable depuis » précisé ; branche poussée avant le tag ; épinglage sur `:<version>` avant D-05 (aussi dans le modèle) ; règle de rédaction des notes (les tâches ne touchent ni `docs/releases/` ni `UPGRADING.md`) ; critères post-merge et séquence réelle déplacés dans D-12 ; effort M.
- 2026-10-09 : deuxième revue de la PR #38. Gel aligné sur D-12 : du tag `v1.5.0-rc.1` au merge `develop` → `main`.
- 2026-10-09 : fait dans la PR #39 (`chore/D-11-release-model`). `release.yml` en trois jobs (`verify`, `images` en matrice, `github-release`), permissions par job, valeurs `${{ }}` passées par `env:`. `verify` contrôle aussi la forme du front matter (`breaking` booléen, `required_actions` en `{ when: before|after, action }`), pour F-09. Testé en local sans aucun tag publié : actionlint 1.7.12 (0 erreur), et un banc jetable (Alpine, git, yq v4.47) qui extrait les scripts `run:` du workflow avec `yq` et les rejoue dans un dépôt avec `main` et `develop`, en tags légers et annotés : 77 contrôles réussis (règle de branche, branche poussée après le tag, format du tag, fichier de notes, `PREV_TAG` sur `v1.4.0` / `v1.5.0-rc.1` / `rc.2` / `rc.10` / `v1.5.0`, tags d'image, corps de release avec `gh` simulé). Mutants : sans `versionsort.suffix` (2 échecs) ou sans test de `prerelease` (5 échecs) détectés ; sans `^{commit}`, aucun échec, car `merge-base` déréférence lui-même un tag annoté (`rev-parse` gardé, il journalise le SHA). Notes v1.5.0 et `UPGRADING.md` rédigées à partir des PR #27 à #36 et vérifiées dans le code (`develop` et `v1.4.0`) ; action ajoutée par rapport à la tâche : mettre à jour `docker-compose.prod.yml` (celui de v1.4.0 ne transmet pas `ADMIN_RESET_PASSWORD` et met `admin123` par défaut). Section « Upgrading from a version with default credentials » du README remplacée par un lien vers `UPGRADING.md`. Mise à jour d'`AGENTS.md` transmise à D-09 (fichier ajouté à `touches`). Reste pour D-12 : `date` de `v1.5.0.md` à corriger si le tag final est posé un autre jour, et tout ce qui demande un vrai tag (sortie de `generate-notes`, `make_latest`, checkout d'un tag annoté sur le runner).
