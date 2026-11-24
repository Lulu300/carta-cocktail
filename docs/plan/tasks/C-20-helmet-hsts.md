---
id: C-20
title: "HSTS : ne plus l'envoyer depuis helmet sans décision explicite"
phase: C
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [D-02]
touches: [backend/src/app.ts, backend/src/app.test.ts]
sources: ["03-security.md §8"]
branch: fix/C-20-helmet-hsts
pr: https://github.com/Lulu300/carta-cocktail/pull/211
---

## Contexte

D-02 a ajouté les en-têtes de sécurité côté nginx (`frontend/security-headers.conf`). HSTS y reste commenté : il ne doit être envoyé que si le TLS est terminé en amont du conteneur (reverse proxy), ce que D-09 documente. Le snippet masque les copies helmet de la CSP, de `X-Frame-Options`, de `X-Content-Type-Options` et de `Referrer-Policy`, mais pas `Strict-Transport-Security`.

Relevé par la revue de la PR #61 (D-02), remarque 3 ; l'humain a demandé une tâche séparée le 2026-10-10.

## Problème constaté

- `backend/src/app.ts:29` : `helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })` garde HSTS actif par défaut. Toutes les réponses Express, donc `/api/*` et `/uploads/*` à travers nginx, portent `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- En HTTP simple, les navigateurs l'ignorent. Derrière un reverse proxy TLS, ces réponses activent HSTS pour un an sur le domaine **et ses sous-domaines** (`includeSubDomains`), sans que l'administrateur l'ait décidé, alors que la config nginx dit le contraire.
- Incohérence entre nginx (HSTS désactivé, décision laissée à la terminaison TLS) et le backend (HSTS toujours envoyé).

## Ce qu'il faut faire

1. Désactiver HSTS dans helmet par défaut (`strictTransportSecurity: false`), pour que la décision reste au niveau de la terminaison TLS (reverse proxy, ou nginx si l'on y active la ligne commentée).
2. Option, à trancher pendant la tâche : une variable `HSTS_MAX_AGE` (vide ou `0` = désactivé) lue dans `config.ts`, qui réactive HSTS sans `includeSubDomains` par défaut. Si elle est retenue, la documenter dans `.env.example`. Sinon, s'en tenir au point 1.
3. Ne rien changer aux autres en-têtes helmet (COOP, CORP `cross-origin`, etc.).

## Critères d'acceptation

- [x] Par défaut, aucune réponse du backend (`/api/public/settings`, `/uploads/<image>`) ne porte `Strict-Transport-Security`, ni en direct sur le port 3001, ni à travers nginx.
- [x] Les autres en-têtes helmet sont inchangés.
- [x] Sans objet (option du point 2 non retenue) : avec la variable définie, l'en-tête est présent avec la valeur attendue.
- [x] `npm test`, `npx tsc --noEmit` et la couverture passent dans `backend/`.

## Tests à ajouter ou adapter

- `backend/src/app.test.ts` (supertest) : pas de `Strict-Transport-Security` sur une route publique ; un en-tête helmet témoin (par exemple `Cross-Origin-Resource-Policy: cross-origin`) toujours présent.
- Si l'option est retenue : `config.test.ts` pour la lecture de la variable, et un test d'en-tête avec la variable définie.

## Points d'attention

- Une instance déjà servie en HTTPS a pu enregistrer HSTS dans les navigateurs : le retirer ne change rien pour eux avant expiration (un an), sans conséquence fonctionnelle tant que le site reste en HTTPS.
- Notes de version : changement d'en-tête sans action obligatoire. À mentionner pour qui comptait sur ce HSTS : l'activer au niveau du reverse proxy (D-09).
- D-03 retire la publication directe du port 3001 : après D-03, seul le chemin à travers nginx compte.

## Journal

- 2026-10-10 : tâche créée à la demande de l'humain, à partir de la remarque 3 de la revue de la PR #61 (D-02). Numéro C-20 : C-17 à C-19 sont pris par la PR #60, non mergée.
- 2026-11-24 : réalisée (PR #211). `strictTransportSecurity: false` dans `helmet()`, autres en-têtes inchangés. Mesuré sur un projet compose `carta-c-20` construit depuis `develop` : avant, `/api/*` (200, 401, 404) et `/uploads/*` portaient `max-age=31536000; includeSubDomains` à travers nginx comme en direct sur 3001, `/`, routes SPA et `/assets/*` aucun HSTS ; après, aucune réponse n'en porte, et l'ensemble des en-têtes de `/api/public/settings` ne diffère que de cette ligne. Avec la ligne commentée de `security-headers.conf` activée dans le conteneur, chaque réponse (SPA, API, photos) porte un seul `max-age=31536000` (avant, `/api/*` et `/uploads/*` en auraient porté deux). Option `HSTS_MAX_AGE` non retenue : le port 3001 n'est plus publié, toute réponse passe par nginx, et un HSTS posé par le backend ne couvrirait que l'API et les photos, pas les pages ; le reverse proxy ou `security-headers.conf` couvrent déjà toutes les réponses (`docs/operations.md` › HTTPS, juste désormais sans modification). `touches` réduit à `app.ts` et `app.test.ts` (`config.ts`, `config.test.ts` et `.env.example` servaient à l'option). Tests : pas de HSTS sur une route API, une photo et une photo absente (échouent sans le correctif), en-têtes helmet témoins inchangés sur l'API et les photos.
- Notes de version : les réponses de l'API et des photos (`/api/*`, `/uploads/*`) ne portent plus `Strict-Transport-Security` (helmet l'envoyait avec `includeSubDomains`). Aucune action obligatoire. Recommandé pour une instance en HTTPS qui comptait sur cet en-tête : activer HSTS là où se termine TLS, dans le reverse proxy (exemple Caddy dans `docs/operations.md` › HTTPS) ou avec la ligne commentée de `frontend/security-headers.conf`. Les navigateurs qui l'ont déjà enregistré le gardent jusqu'à expiration (un an), sans effet tant que le site reste en HTTPS.
