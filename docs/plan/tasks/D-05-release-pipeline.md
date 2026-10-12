---
id: D-05
title: "Release : conditionnée à la CI, multi-arch, SBOM, version injectée"
phase: D
lane: ci
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: [D-04, D-11]
touches: [.github/workflows/release.yml, backend/Dockerfile, frontend/Dockerfile, docs/plan/tasks/C-23-backend-app-version.md, docs/plan/tasks/D-09-docs-sync-ops-guide.md]
sources: ["07-devops-history.md §3.4"]
branch: chore/D-05-release-pipeline
pr: "#118"
---

## Décisions validées (2026-10-09)

- Modèle de release fixé par D-11 : pré-versions `vX.Y.Z-rc.N` uniquement sur `develop` (sans `latest`, release marquée pre-release), versions finales sur `main` (avec `latest`), notes tirées de `docs/releases/`. Cette tâche garde ce modèle.
- Versions : v1.5.0 pour la phase A, versions intermédiaires pendant la refonte, v2.0.0 à la fin du plan. Les changements cassants sortent donc en 1.x : accepté, avec `breaking: true`, les actions obligatoires dans les notes et `UPGRADING.md`, et une recommandation d'épinglage (`:<version>` avant cette tâche, `:<majeure>.<mineure>` une fois ce tag publié par cette tâche).

## Contexte

Le NAS tire les images publiées sur ghcr.io, en `:latest` d'après `docker-compose.prod.yml:3,18`. Après D-11, un tag ne publie que s'il pointe sur la bonne branche et s'il a ses notes, mais les images partent encore sans attendre la CI. Elles sont uniquement amd64, sans SBOM, et l'application ne connaît pas sa propre version. Cette tâche fait de la release la suite de la CI.

## Problème constaté

- `.github/workflows/release.yml:3-6` : déclenché par tout tag `v*`, sans dépendance à la CI. Pour v1.4.0, la release et la CI de `main` ont tourné en parallèle (relevé dans la revue). Les numéros de ligne cités ici datent d'avant D-11 : relire le workflow réécrit par D-11.
- `release.yml:41-61` : pas de `platforms:`, donc `linux/amd64` seulement. Un NAS ARM ou un Raspberry Pi ne peut pas lancer l'image.
- `release.yml:46-48,57-59` : pas de tag `major.minor` (D-11 réserve déjà `latest` aux versions finales).
- `release.yml:49-50,60-61` : les deux images partagent le cache GHA par défaut et s'écrasent mutuellement.
- Version jamais injectée : `backend/package.json:3` à `1.0.0`, `frontend/package.json:4` à `0.0.0`, `backend/src/routes/backup.ts:53` code `appVersion: '1.0.0'`.

## Ce qu'il faut faire

1. Vérifier que D-04 (`ci.yml` accepte `workflow_call`) et D-11 sont mergés.
2. Compléter le `release.yml` de D-11. Garder tels quels son job `verify` (règle de branche : tag final sur un commit atteignable depuis `main`, pré-version sur un commit atteignable depuis `develop`, commit lu avec `git rev-parse "${GITHUB_REF}^{commit}"` ; fichier de notes obligatoire ; `PREV_TAG`) et son job `github-release` (notes, liste des PR, `docker pull`, `prerelease`). Ajouter le job `ci` entre `verify` et `images`, et refaire `images` :
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
       # inchangé : job de D-11
     ci:
       needs: verify
       uses: ./.github/workflows/ci.yml
     images:
       needs: ci
       runs-on: ubuntu-latest
       permissions: { contents: read, packages: write, id-token: write, attestations: write }
       strategy:
         matrix: { service: [backend, frontend] }
       steps:
         - uses: actions/checkout@v5
         - uses: docker/setup-qemu-action@v3
         - uses: docker/setup-buildx-action@v3
         - uses: docker/login-action@v3
           with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
         - id: repo
           run: echo "name=${GITHUB_REPOSITORY,,}" >> "$GITHUB_OUTPUT"
         - id: meta
           uses: docker/metadata-action@v5
           with:
             images: ghcr.io/${{ steps.repo.outputs.name }}/${{ matrix.service }}
             tags: |
               type=semver,pattern={{version}}
               type=semver,pattern={{major}}.{{minor}}
               type=semver,pattern={{major}}
         - uses: docker/build-push-action@v6
           with:
             context: ./${{ matrix.service }}
             platforms: linux/amd64,linux/arm64
             push: true
             tags: ${{ steps.meta.outputs.tags }}
             labels: ${{ steps.meta.outputs.labels }}
             build-args: APP_VERSION=${{ steps.meta.outputs.version }}
             sbom: true
             provenance: mode=max
             cache-from: type=gha,scope=${{ matrix.service }}
             cache-to: type=gha,mode=max,scope=${{ matrix.service }}
     github-release:
       needs: [verify, images]
       # inchangé : job de D-11
   ```
   `metadata-action` ajoute `latest` pour un tag semver qui n'est pas une pré-version (`flavor: latest=auto`, défaut) : le comportement de D-11 est conservé.
3. `backend/Dockerfile`, stage runtime, en fin de fichier pour ne pas casser le cache :
   ```dockerfile
   ARG APP_VERSION=dev
   ENV APP_VERSION=$APP_VERSION
   ```
4. `frontend/Dockerfile`, stage build, juste avant `npm run build` : `ARG APP_VERSION=dev` puis `ENV VITE_APP_VERSION=$APP_VERSION`. L'affichage dans l'UI est hors périmètre.
5. Ne pas toucher `backup.ts` : C-05 lit `process.env.APP_VERSION` pour les métadonnées de backup, D-03 l'expose dans `/api/health`.

## Critères d'acceptation

- [x] La règle de branche et le contrôle des notes de D-11 s'appliquent toujours (job `verify` inchangé, seul `actions/checkout` est épinglé par SHA).
- [x] Un tag valide lance la CI complète avant tout push d'image (job `ci` appelant `ci.yml`, `images` en `needs: [verify, ci]` ; à constater sur la première pré-version).
- [x] `docker buildx imagetools inspect ghcr.io/lulu300/carta-cocktail/backend:<version>` liste `linux/amd64` et `linux/arm64` (index multi-plateforme vérifié en local ; registre à constater sur la première pré-version).
- [x] Les tags `<version>`, `<major>.<minor>`, `<major>` et `latest` sont publiés pour une version finale ; une pré-version (`v1.5.0-rc.1`) ne déplace pas `latest` (`metadata-action`, `latest` piloté par la sortie `prerelease` du job `verify` ; à constater sur les prochains tags).
- [x] SBOM et provenance visibles (`docker buildx imagetools inspect --format '{{json .SBOM}}'`) (attestations SPDX et SLSA v1 par plateforme vérifiées en local).
- [x] `docker run --rm --entrypoint printenv <image backend> APP_VERSION` renvoie la version du tag (`1.12.0-rc.1` en local avec l'argument de build, `dev` sans).

## Tests à ajouter ou adapter

- `actionlint` sur `release.yml`.
- Pas de tag jetable publié (décision du 2026-10-09, voir D-11) : la première vraie pré-version qui suit le merge (ex. `v1.6.0-rc.1` sur `develop`, avec son fichier de notes, accord humain pour le tag) sert de test. Vérifier que la CI passe avant les images, que le manifeste est multi-arch et que `latest` n'a pas bougé. En cas d'échec après un push d'image, corriger et taguer `-rc.2`.
- Sur le NAS ou en local : `docker pull --platform linux/arm64 ...` puis `docker run` de l'image arm64 sous émulation, l'API répond sur `/api/health`.

## Points d'attention

- Impact sur les utilisateurs de `:latest`. Le manifeste multi-arch est transparent pour amd64. En revanche, la première release qui suit D-01, D-02 et D-03 apporte via `latest` un conteneur non-root, un frontend sur le port 8080 et un backend sans port publié. Ces actions sont décrites par les PR de D-01, D-02 et D-03 (section « Required actions », règle de D-11), puis reprises par le coordinateur dans les notes et `UPGRADING.md`. Recommander dans ces notes l'épinglage sur `:<major>.<minor>` si cette tâche est mergée, sinon sur `:<version>`. Décision du 2026-10-09 : v2.0.0 seulement à la fin du plan, donc ces changements cassants sortent dans une version 1.x intermédiaire, avec `breaking: true` dans le front matter des notes.
- Durée : le build arm64 sous QEMU (npm ci, prisma generate, tsc) peut prendre 10 à 20 minutes. Alternative si c'est trop lent : runners natifs `ubuntu-24.04-arm` (gratuits pour un repo public) et fusion des manifestes, plus complexe.
- Architectures à confirmer par l'humain : le modèle du NAS (x86 ou ARM) décide si arm64 est nécessaire. armv7 est hors périmètre.
- Transmis par D-04 : `ci.yml` épingle ses actions par SHA, avec la version en commentaire (`uses: actions/checkout@<sha> # v7.0.1`), suivies par Dependabot. Faire de même dans `release.yml` (les versions de l'exemple ci-dessus sont anciennes : reprendre celles de `ci.yml`). Son groupe de concurrence (`ci-<github.workflow>-<ref de PR ou sha>`, soit `ci-Release-<sha>` dans un appel depuis la release) ne doit jamais être repris par `release.yml`. Le job `ci` de la release ne doit pas recevoir `permissions: {}` : un workflow appelé ne peut pas demander plus que son appelant, et `ci.yml` a besoin de `contents: read`.
- Les versions de `package.json` restent à `1.0.0` et `0.0.0`. Décision à prendre : les synchroniser à chaque release (commit sur `main` avant le tag) ou assumer que `APP_VERSION` fait foi.
- Transmis par D-04 (PR #112) : `ci.yml` lance `npm audit --omit=dev` (frontend `high`, backend `critical` jusqu'à B-11). Appelée par la release, cette étape peut bloquer une release si un avis est publié entre le merge et le tag. C'est voulu : la réponse est une PR de montée de version ou de surcharge, jamais une baisse du seuil.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-09 : D-11 ajoutée en dépendance. L'étape « le tag doit pointer sur main » est remplacée par la règle de D-11 (version finale sur `main`, pré-version sur `develop` ou `main`). Retirés car traités par D-11 : changelog et `PREV_TAG`, `generate_release_notes` et le job `github-release`, `latest` réservé aux versions finales, permissions par job, critère « les notes listent les PR », note sur `.github/release.yml`.
- 2026-10-09 : réponses de l'humain. Changements cassants en 1.x acceptés avec garde-fous ; pas de tag jetable : la première vraie pré-version après le merge sert de test.
- 2026-10-09 : revue de la PR #38. Pré-versions uniquement sur `develop` (la version précédente de cette tâche les autorisait aussi sur `main`) ; commit du tag lu avec `rev-parse` ; épinglage sur `:<version>` tant que le tag `:<majeure>.<mineure>` n'existe pas.
- 2026-10-12 : décisions de l'humain. Architectures : option B, `linux/amd64` et `linux/arm64` sous QEMU, un seul job et un manifeste multi-arch, stages de compilation en `FROM --platform=$BUILDPLATFORM`. Version : option A, `APP_VERSION` (argument de build) fait foi, les `package.json` ne bougent pas ; `APP_VERSION` injectée dans les deux images. Les métadonnées de sauvegarde lisent encore `backend/package.json` : laissé à C-23 (pas de nouvelle tâche).
- 2026-10-12 : fait (PR #118). Job `ci` (`uses: ./.github/workflows/ci.yml`) entre `verify` et `images`, sans `permissions` ni reprise du groupe de concurrence de `ci.yml`. `images` : QEMU (arm64), `platforms: linux/amd64,linux/arm64`, `metadata-action` (`X.Y.Z` toujours, `X.Y` et `X` pour une version finale ; `latest` piloté par `verify`), `APP_VERSION` pour les deux images, `sbom: true`, `provenance: mode=max`. Écarts à l'exemple de la tâche : pas de permissions `id-token` / `attestations` (les attestations buildx partent avec l'image, seules les attestations GitHub en auraient besoin) ; cache lu dans le scope de la CI et dans un scope `<service>-release`, écrit dans ce dernier, pour garder les couches arm64 que les pushes de la CI écrasent. Toutes les actions de `release.yml` épinglées par SHA. `backend/Dockerfile` : stage `build` sur `$BUILDPLATFORM`, nouveau stage `prod-deps` sur la plateforme cible (`npm ci` puis `npm prune`), mêmes premières étapes que `build` pour que BuildKit les fusionne quand les plateformes sont égales (`npm ci` une seule fois, vérifié avec `--no-cache`) ; `ARG`/`ENV APP_VERSION` en fin de fichier. `frontend/Dockerfile` : stage `build` sur `$BUILDPLATFORM`. Vérifications : `actionlint` ; en local, image backend amd64 construite depuis un hôte arm64 (client Prisma généré sur l'autre plateforme) : migrations, seed et API OK, `APP_VERSION` = version passée ; index multi-plateforme avec SBOM et provenance. Pas de tag ni de pré-version : la première vraie pré-version après le merge sert de test (étapes dans la PR). Fichiers ajoutés à `touches` : C-23 (Journal) et D-09 (Points d'attention : README, AGENTS.md et `docs/plan/README.md` à aligner sur ce pipeline).
- 2026-10-12 : Notes de version : images publiées pour `linux/amd64` et `linux/arm64` (un hôte arm64 n'a plus besoin de construire en local), tags `:X.Y` et `:X` pour les versions finales (épinglage `:<majeure>.<mineure>` possible à partir de la première version finale publiée après ce merge), SBOM et provenance attachées aux images. Aucune action, `breaking: false`.
