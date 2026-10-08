---
id: D-05
title: "Release : conditionnée à la CI, multi-arch, SBOM, version injectée"
phase: D
lane: ci
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [D-04, D-11]
touches: [.github/workflows/release.yml, backend/Dockerfile, frontend/Dockerfile]
sources: ["07-devops-history.md §3.4"]
branch:
pr:
---

## Décisions validées (2026-10-09)

- Modèle de release fixé par D-11 : pré-versions `vX.Y.Z-rc.N` sur `develop` ou `main` (sans `latest`, release marquée pre-release), versions finales sur `main` (avec `latest`), notes tirées de `docs/releases/`. Cette tâche garde ce modèle.
- Versions : v1.5.0 pour la phase A, versions intermédiaires pendant la refonte, v2.0.0 à la fin du plan.

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
2. Compléter le `release.yml` de D-11. Garder tels quels son job `verify` (règle de branche : tag final sur un commit de `main`, pré-version sur un commit de `develop` ou de `main` ; fichier de notes obligatoire ; `PREV_TAG`) et son job `github-release` (notes, liste des PR, `docker pull`, `prerelease`). Ajouter le job `ci` entre `verify` et `images`, et refaire `images` :
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

- [ ] La règle de branche et le contrôle des notes de D-11 s'appliquent toujours (job `verify` inchangé).
- [ ] Un tag valide lance la CI complète avant tout push d'image.
- [ ] `docker buildx imagetools inspect ghcr.io/lulu300/carta-cocktail/backend:<version>` liste `linux/amd64` et `linux/arm64`.
- [ ] Les tags `<version>`, `<major>.<minor>`, `<major>` et `latest` sont publiés pour une version finale ; une pré-version (`v1.5.0-rc.1`) ne déplace pas `latest`.
- [ ] SBOM et provenance visibles (`docker buildx imagetools inspect --format '{{json .SBOM}}'`).
- [ ] `docker run --rm --entrypoint printenv <image backend> APP_VERSION` renvoie la version du tag.

## Tests à ajouter ou adapter

- `actionlint` sur `release.yml`.
- Répétition à blanc, après accord de l'humain pour le tag : pousser une pré-version de test (`v0.0.0-rc.1`, avec son fichier de notes, voir D-11) sur `develop` ; vérifier que la CI passe avant les images et que le manifeste est multi-arch. Supprimer ensuite le tag, la release et les images de test sur ghcr.io.
- Sur le NAS ou en local : `docker pull --platform linux/arm64 ...` puis `docker run` de l'image arm64 sous émulation, l'API répond sur `/api/health`.

## Points d'attention

- Impact sur les utilisateurs de `:latest`. Le manifeste multi-arch est transparent pour amd64. En revanche, la première release qui suit D-01, D-02 et D-03 apporte via `latest` un conteneur non-root, un frontend sur le port 8080 et un backend sans port publié. Recommander dans les notes de cette release l'épinglage sur `:<major>.<minor>` et décrire les changements dans ses « Required actions » et dans `UPGRADING.md` (D-11). Décision du 2026-10-09 : v2.0.0 seulement à la fin du plan, donc ces changements cassants sortent dans une version 1.x intermédiaire.
- Durée : le build arm64 sous QEMU (npm ci, prisma generate, tsc) peut prendre 10 à 20 minutes. Alternative si c'est trop lent : runners natifs `ubuntu-24.04-arm` (gratuits pour un repo public) et fusion des manifestes, plus complexe.
- Architectures à confirmer par l'humain : le modèle du NAS (x86 ou ARM) décide si arm64 est nécessaire. armv7 est hors périmètre.
- Les versions de `package.json` restent à `1.0.0` et `0.0.0`. Décision à prendre : les synchroniser à chaque release (commit sur `main` avant le tag) ou assumer que `APP_VERSION` fait foi.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-09 : D-11 ajoutée en dépendance. L'étape « le tag doit pointer sur main » est remplacée par la règle de D-11 (version finale sur `main`, pré-version sur `develop` ou `main`). Retirés car traités par D-11 : changelog et `PREV_TAG`, `generate_release_notes` et le job `github-release`, `latest` réservé aux versions finales, permissions par job, critère « les notes listent les PR », note sur `.github/release.yml`.
