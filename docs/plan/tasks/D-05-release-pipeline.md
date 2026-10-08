---
id: D-05
title: "Release : conditionnée à la CI, multi-arch, SBOM, version injectée"
phase: D
lane: ci
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [D-04]
touches: [.github/workflows/release.yml, backend/Dockerfile, frontend/Dockerfile]
sources: ["07-devops-history.md §3.4"]
branch:
pr:
---

## Contexte

Le NAS tire les images publiées sur ghcr.io, en `:latest` d'après `docker-compose.prod.yml:3,18`. N'importe quel tag `v*` publie aujourd'hui `latest`, même posé sur un commit rouge ou hors de `main`. Les images sont uniquement amd64, sans SBOM, et l'application ne connaît pas sa propre version. Cette tâche fait de la release la suite de la CI.

## Problème constaté

- `.github/workflows/release.yml:3-6` : déclenché par tout tag `v*`, sans dépendance à la CI. Pour v1.4.0, la release et la CI de `main` ont tourné en parallèle (relevé dans la revue).
- `release.yml:41-61` : pas de `platforms:`, donc `linux/amd64` seulement. Un NAS ARM ou un Raspberry Pi ne peut pas lancer l'image.
- `release.yml:46-48,57-59` : `latest` déplacé à chaque tag, y compris un correctif sur une ancienne branche. Pas de tag `major.minor`.
- `release.yml:49-50,60-61` : les deux images partagent le cache GHA par défaut et s'écrasent mutuellement.
- `release.yml:8-10` : `contents: write` et `packages: write` pour tout le workflow.
- `release.yml:73-95` : changelog construit avec `git log PREV..HEAD`, surtout des lignes « Merge pull request ... from Lulu300/develop ». `PREV_TAG` est le 2e tag par ordre de version (`:78`), faux si un tag est poussé hors ordre.
- Version jamais injectée : `backend/package.json:3` à `1.0.0`, `frontend/package.json:4` à `0.0.0`, `backend/src/routes/backup.ts:53` code `appVersion: '1.0.0'`.

## Ce qu'il faut faire

1. Vérifier que D-04 est mergé (`ci.yml` accepte `workflow_call`).
2. Réécrire `release.yml` :
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
       steps:
         - uses: actions/checkout@v5
           with: { fetch-depth: 0 }
         - name: Le tag doit pointer sur main
           run: git merge-base --is-ancestor "$GITHUB_SHA" origin/main
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
       needs: images
       runs-on: ubuntu-latest
       permissions: { contents: write }
       steps:
         - id: v
           run: echo "version=${GITHUB_REF_NAME#v}" >> "$GITHUB_OUTPUT"
         - uses: softprops/action-gh-release@v2
           with:
             generate_release_notes: true
             body: |
               ## Docker Images
               docker pull ghcr.io/lulu300/carta-cocktail/backend:${{ steps.v.outputs.version }}
               docker pull ghcr.io/lulu300/carta-cocktail/frontend:${{ steps.v.outputs.version }}
   ```
   Remettre les commandes `docker pull` dans un bloc de code comme aujourd'hui (`release.yml:89-94`).
   `metadata-action` ajoute `latest` pour un tag semver qui n'est pas une pré-version (`flavor: latest=auto`, défaut).
3. `backend/Dockerfile`, stage runtime, en fin de fichier pour ne pas casser le cache :
   ```dockerfile
   ARG APP_VERSION=dev
   ENV APP_VERSION=$APP_VERSION
   ```
4. `frontend/Dockerfile`, stage build, juste avant `npm run build` : `ARG APP_VERSION=dev` puis `ENV VITE_APP_VERSION=$APP_VERSION`. L'affichage dans l'UI est hors périmètre.
5. Ne pas toucher `backup.ts` : C-05 lit `process.env.APP_VERSION` pour les métadonnées de backup, D-03 l'expose dans `/api/health`.

## Critères d'acceptation

- [ ] Un tag poussé sur un commit absent de `main` échoue au job `verify` et ne publie rien.
- [ ] Un tag sur `main` lance la CI complète avant tout push d'image.
- [ ] `docker buildx imagetools inspect ghcr.io/lulu300/carta-cocktail/backend:<version>` liste `linux/amd64` et `linux/arm64`.
- [ ] Les tags `<version>`, `<major>.<minor>`, `<major>` et `latest` sont publiés pour une version finale ; une pré-version (`v1.5.0-rc.1`) ne déplace pas `latest`.
- [ ] SBOM et provenance visibles (`docker buildx imagetools inspect --format '{{json .SBOM}}'`).
- [ ] `docker run --rm --entrypoint printenv <image backend> APP_VERSION` renvoie la version du tag.
- [ ] Les notes de release listent les PR, pas les commits de merge.

## Tests à ajouter ou adapter

- `actionlint` sur `release.yml`.
- Répétition à blanc : pousser un tag de pré-version (`v0.0.0-rc.1`) sur une branche hors `main` (doit échouer), puis sur `main` dans un fork ou après accord de l'humain. Supprimer ensuite le tag et les images de test sur ghcr.io.
- Sur le NAS ou en local : `docker pull --platform linux/arm64 ...` puis `docker run` de l'image arm64 sous émulation, l'API répond sur `/api/health`.

## Points d'attention

- Impact sur les utilisateurs de `:latest`. Le manifeste multi-arch est transparent pour amd64. En revanche, la première release qui suit D-01, D-02 et D-03 apporte via `latest` un conteneur non-root, un frontend sur le port 8080 et un backend sans port publié. Recommander dans les notes de cette release l'épinglage sur `:<major>.<minor>` et décrire les changements. Envisager un numéro majeur (v2.0.0) si le port 8080 est retenu.
- Durée : le build arm64 sous QEMU (npm ci, prisma generate, tsc) peut prendre 10 à 20 minutes. Alternative si c'est trop lent : runners natifs `ubuntu-24.04-arm` (gratuits pour un repo public) et fusion des manifestes, plus complexe.
- Architectures à confirmer par l'humain : le modèle du NAS (x86 ou ARM) décide si arm64 est nécessaire. armv7 est hors périmètre.
- Les versions de `package.json` restent à `1.0.0` et `0.0.0`. Décision à prendre : les synchroniser à chaque release (commit sur `main` avant le tag) ou assumer que `APP_VERSION` fait foi.
- Les notes générées regroupent les PR par labels si `.github/release.yml` existe (proposé dans D-07).

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
