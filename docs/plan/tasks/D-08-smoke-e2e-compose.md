---
id: D-08
title: "Smoke test de bout en bout via docker compose en CI"
phase: D
lane: ci
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [A-01, A-06, D-03]
touches: [.github/workflows/, scripts/smoke]
sources: ["07-devops-history.md §3.3", "04-tests.md §7"]
branch:
pr:
---

## Contexte

Aucun test ne traverse nginx → Express → SQLite → volume. Les deux bugs les plus graves de la revue (photos écrites hors du volume, limite nginx de 1 Mo) passent tous les tests actuels, qui attaquent Express directement. Un smoke test qui démarre la pile Docker comme en production et fait un upload réel les aurait détectés. Il servira aussi de base aux tests Playwright (F-04).

## Problème constaté

- `.github/workflows/ci.yml:10-102` : uniquement des tests Vitest backend et frontend. `release.yml:41-61` construit les images sans jamais les démarrer.
- `backend/src/config.ts:11` : `uploadDir` vaut `/uploads` dans l'image alors que le volume est sur `/app/uploads` (`docker-compose.yml:16`). Corrigé par A-01, mais rien n'empêche une régression.
- `frontend/nginx.conf.template:1-35` : pas de `client_max_body_size`, donc 1 Mo. Les limites backend sont 5 Mo (`routes/cocktails.ts:40`), 10 Mo (imports) et 500 Mo (backup). Corrigé par A-06, sans test.
- Le démarrage (`index.ts`, migrations, seed) est exclu de la couverture (`backend/vitest.config.ts:26`) et jamais exécuté en CI.

## Ce qu'il faut faire

1. Vérifier que A-01, A-06 et D-03 sont mergés (le script s'appuie sur `/api/health` et `docker compose up --wait`).
2. Créer `scripts/smoke/smoke.sh` (bash, `set -euo pipefail`, dépend de `curl`, `jq`, `python3`). Paramètres : `BASE_URL` (défaut `http://localhost`), `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Étapes, chacune avec un message clair en cas d'échec :
   1. `GET /` → 200 et `text/html`.
   2. Récupérer un asset JS depuis `index.html`, le demander avec `Accept-Encoding: gzip` → `Content-Encoding: gzip` (A-06).
   3. `GET /api/health` → `status == "ok"`.
   4. `POST /api/auth/login` → récupérer `.token`.
   5. `GET /api/cocktails` sans token → 401.
   6. `POST /api/cocktails` avec `{"name":"Smoke test"}` → récupérer `.id`.
   7. Générer une vraie image PNG d'environ 2,5 Mo (bruit aléatoire, donc incompressible) :
      ```bash
      python3 - "$TMP/smoke.png" <<'PY'
      import os, struct, sys, zlib
      w = h = 900
      raw = b''.join(b'\x00' + os.urandom(w * 3) for _ in range(h))
      def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
      png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 0)) + chunk(b'IEND', b'')
      open(sys.argv[1], 'wb').write(png)
      PY
      ```
   8. `POST /api/cocktails/:id/image` (champ `image`) → 200, lire `imagePath`.
   9. `GET /uploads/<imagePath>` → 200, `Content-Type: image/*`.
   10. `docker compose up -d --force-recreate --wait carta-cocktail-backend`, puis refaire l'étape 9 (persistance, A-01).
   11. `GET /api/backup/export` avec token → 200, `application/zip`, taille > 0.
   12. Si l'en-tête `X-Content-Type-Options` est absent sur `/`, afficher un avertissement sans échouer (D-02 peut ne pas être mergé).
3. Créer `.github/workflows/smoke.yml`, séparé de `ci.yml` (que D-04 modifie) :
   ```yaml
   name: Smoke
   on:
     pull_request:
       branches: [main, develop]
     workflow_dispatch:
   permissions:
     contents: read
   jobs:
     smoke:
       runs-on: ubuntu-latest
       timeout-minutes: 20
       steps:
         - uses: actions/checkout@v5
         - name: Secrets de test
           run: |
             {
               echo "JWT_SECRET=$(openssl rand -hex 32)"
               echo "ADMIN_EMAIL=smoke@carta.local"
               echo "ADMIN_PASSWORD=$(openssl rand -hex 16)"
             } > .env
         - run: docker compose up -d --build --wait --wait-timeout 180
         - run: set -a && . ./.env && set +a && ./scripts/smoke/smoke.sh
         - if: failure()
           run: docker compose logs --no-color > compose.log
         - if: failure()
           uses: actions/upload-artifact@v5
           with: { name: compose-logs, path: compose.log }
         - if: always()
           run: docker compose down -v
   ```
4. Rendre le script exécutable (`git update-index --chmod=+x`).

## Critères d'acceptation

- [ ] Le workflow « Smoke » passe sur la PR qui l'introduit.
- [ ] Sur une branche de test où `client_max_body_size` est retiré, le smoke échoue à l'étape 8 avec un message qui mentionne 413.
- [ ] Sur une branche de test où `UPLOAD_DIR` n'est plus passé au backend, le smoke échoue à l'étape 10.
- [ ] Le script tourne aussi en local : `docker compose up -d --build --wait && ./scripts/smoke/smoke.sh`.
- [ ] En cas d'échec, les logs des conteneurs sont disponibles en artefact.
- [ ] Le job dure moins de 10 minutes avec le cache Docker froid.

## Tests à ajouter ou adapter

- Le smoke test est lui-même le test. Valider les deux régressions volontaires ci-dessus sur des branches jetables, et joindre les liens des runs rouges à la PR.
- `shellcheck scripts/smoke/smoke.sh` en local.

## Points d'attention

- Le smoke utilise `docker-compose.yml` (build local). `docker-compose.prod.yml` tire `:latest` et ne teste pas le code de la PR. Une variante qui construit les images puis lance le compose prod avec ces tags est possible plus tard.
- Si F-01 transforme les images à l'upload, `imagePath` et le type renvoyé changent. Le script ne doit vérifier que le code 200 et `image/*`, pas la taille exacte.
- Le contrat de `POST /api/cocktails` peut changer avec C-04 (zod) et C-09 : garder un corps minimal et adapter le script dans ces tâches.
- Le check « Smoke » pourra devenir obligatoire dans le ruleset de D-07 une fois stable (2 ou 3 semaines sans faux positif).
- Le cache Docker n'est pas partagé avec le job « Docker build » de D-04. Si la durée pose problème, utiliser `docker buildx bake` avec `cache-from: type=gha`.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
