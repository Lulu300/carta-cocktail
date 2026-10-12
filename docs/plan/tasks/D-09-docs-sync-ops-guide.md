---
id: D-09
title: "Documentation : AGENTS.md/README synchronisés et guide d'exploitation"
phase: D
lane: docs
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [A-01, A-04, C-01, C-05, D-01, D-03, D-05]
touches: [AGENTS.md, backend/AGENTS.md, frontend/AGENTS.md, README.md, docs/operations.md, backend/src/bootstrap/ensureAdmin.ts, .gitignore]
sources: ["07-devops-history.md §5"]
branch:
pr:
---

## Décisions validées (2026-10-10)

- **Port du frontend** : le conteneur frontend écoute sur 8080 (D-02, changement cassant).

## Contexte

Les `AGENTS.md` sont lus par chaque agent avant une tâche : une affirmation fausse y produit du code faux. Le README est la seule doc d'installation pour qui déploie l'application. Après les phases A, C et D, la procédure d'exploitation change (secrets obligatoires, migrations, volumes, healthchecks, versions épinglées). Il faut un guide d'exploitation écrit pour le NAS.

## Problème constaté

Écarts vérifiés sur `develop`. Les numéros de ligne sont ceux de `develop` avant l'ajout de la section « Action Plan » dans `AGENTS.md`, qui les décale de 9 lignes :
- `AGENTS.md:58` : CI « on Node 20 ». La CI est en Node 24 (`ci.yml:24,74`).
- `AGENTS.md:76` et `backend/AGENTS.md:74` : « 14 models ». `schema.prisma` en compte 15 (le README `:125` dit bien 15).
- `AGENTS.md:31`, `frontend/AGENTS.md:13` : `npx tsc --noEmit` présenté comme contrôle des types frontend. Il ne compile rien (`frontend/tsconfig.json:2`, `"files": []`).
- `README.md:119`, `backend/AGENTS.md:49` : « 14 route files ». Il y en a 15 (`backup.ts` manque dans l'arborescence).
- `backend/AGENTS.md:66-72` : seul `translations.ts` dans utils (manquent `bottlesExport.ts`, `bottlesImport.ts`), et `i18n/locales/` au lieu de `src/i18n/*.json`.
- `backend/AGENTS.md:134` : images « stored in `/uploads/cocktails/` ». Elles sont à la racine de `uploads/` (`routes/cocktails.ts:24`).
- `backend/AGENTS.md:151` : `@prisma/client` et `ts-node` listés en dev.
- `frontend/AGENTS.md:106`, `README.md:136` : `nginx.conf` présenté comme config de production. C'est `nginx.conf.template` (`frontend/Dockerfile:14`).
- `frontend/AGENTS.md:69-97` : arborescence incomplète (wizards, `Pagination`, `SearchInput`, `SortableHeader`, hooks `usePagination`, `useSort`, utils `cocktailSearch`, `uploads`...). `:173-180` : scripts `test`, `test:watch`, `test:coverage` absents.
- `README.md:31` : « Node.js 20+ ». `README.md:77` : `test.db` « created and destroyed automatically », faux (cf. B-03). `README.md:148` : défaut `JWT_SECRET` différent de celui du code (`config.ts:8`, corrigé par A-04). `README.md:152` : défaut `BACKEND_HOST` = `backend`. `README.md:186-202` : il manque `/api/backup/*`, `/api/bottles/import` et `/export`, `/api/category-types`, `/api/menu-bottles`, `/api/menu-sections`, `/api/auth/me`.
- Relevé en revue de la phase A (vérifié sur `develop` le 2026-10-08) :
  - `UPLOAD_DIR` (A-01, `config.ts` `resolveUploadDir`) n'est documenté nulle part : absent du tableau « Environment Variables » du README et des `AGENTS.md`. Défaut en dev : `<repo>/uploads` ; l'image et les deux compose le fixent à `/app/uploads`.
  - `AGENTS.md`, « Running Locally » : aucune étape `.env`. Depuis A-04, le backend refuse de démarrer sans `JWT_SECRET` et le seed refuse de créer l'admin sans `ADMIN_PASSWORD` : la commande donnée échoue. La ligne « Admin: admin@carta.local / admin123 » est fausse (identifiants pris dans `.env`, `admin123` refusé).
  - `backend/AGENTS.md`, arborescence : `src/bootstrap/` (`ensureAdmin.ts`, A-04) manque.
- Aucun guide d'exploitation : mise à jour, sauvegarde, restauration, rotation des secrets, récupération du mot de passe admin, HTTPS.

## Ce qu'il faut faire

1. Lister les tâches mergées depuis la création du plan (`node docs/plan/build.mjs --json`) et relire leurs PR : la doc décrit l'état de `develop` au moment du travail, pas l'état de la revue.
2. Corriger chaque écart ci-dessus. Remplacer les nombres en dur (« 14 route files », « 15 models ») par des formulations sans nombre.
3. `AGENTS.md` : « Running Locally » commence par `cp .env.example backend/.env` puis renseigner `JWT_SECRET` (`openssl rand -hex 32`) et `ADMIN_PASSWORD` (12 caractères au moins), comme le README ; remplacer la ligne `admin123` par « identifiants `ADMIN_EMAIL` / `ADMIN_PASSWORD` du `.env` ». Commande de typage frontend `npx tsc -b` ; convention de commit retenue dans D-07. Garder la section « Action Plan » (renvoi vers `docs/plan/`) ajoutée avec le plan.
4. `UPLOAD_DIR` : ligne dans le tableau « Environment Variables » du README (défaut `<repo>/uploads` hors Docker, `/app/uploads` dans l'image) et mention dans `backend/AGENTS.md` (`config.ts`). Ajouter `src/bootstrap/` (`ensureAdmin.ts` : création et réinitialisation de l'admin au démarrage) à l'arborescence de `backend/AGENTS.md`.
5. README : avertissement en tête de la section Docker production, « définir `JWT_SECRET` et `ADMIN_PASSWORD` avant d'exposer l'application » ; épinglage de version comme mode par défaut ; lien vers `docs/operations.md`, vers `UPGRADING.md` pour les mises à jour et vers les GitHub Releases pour le changelog.
6. Créer `docs/operations.md`, en français, avec ces sections :
   - Installation : `.env` minimal, génération du secret (`openssl rand -hex 32`), `docker compose -f docker-compose.prod.yml up -d --wait`.
   - Volumes : `db-data` → `/app/data` (SQLite), `uploads` → `/app/uploads` (photos). Sauvegarde à froid : `docker run --rm -v <projet>_db-data:/data -v "$PWD":/backup alpine tar czf /backup/db-$(date +%F).tgz -C /data .`.
   - Mise à jour : sauvegarde, changement de tag épinglé, `pull`, `up -d --wait`, vérification de `/api/health`. Rôle de la copie de sécurité automatique avant migration (C-01).
   - Retour arrière : tag précédent + restauration de la copie pré-migration.
   - Sauvegarde et restauration depuis l'admin (`/api/backup/*`), et un exemple de cron hôte.
   - Récupération du mot de passe admin (`ADMIN_RESET_PASSWORD=true`, A-04).
   - Rotation de `JWT_SECRET` : déconnecte toutes les sessions.
   - HTTPS : reverse proxy (Caddy ou Traefik) devant le port 80, en-têtes `X-Forwarded-*`, HSTS à activer à ce niveau.
   - Mise à jour depuis une ancienne version : renvoi vers `UPGRADING.md` (D-11), qui liste les actions obligatoires version par version (photos à récupérer pour A-01, droits des volumes pour D-01, port 8080 du frontend pour D-02, port 3001 non publié pour D-03…). Ne pas recopier ces étapes ici : `UPGRADING.md` et les notes de release font référence.
7. Supprimer les sections devenues fausses plutôt que de les annoter.

## Critères d'acceptation

- [ ] Chaque écart listé ci-dessus est corrigé ou n'a plus d'objet.
- [ ] `grep -rnE '14 (models|route)|Node 20|ts-node|uploads/cocktails' AGENTS.md backend/AGENTS.md frontend/AGENTS.md README.md` ne renvoie rien.
- [ ] `grep -n admin123 AGENTS.md backend/AGENTS.md frontend/AGENTS.md` ne renvoie rien ; les commandes de « Running Locally » fonctionnent sur un clone neuf.
- [ ] `UPLOAD_DIR` figure dans le tableau des variables du README.
- [ ] Toutes les commandes de `docs/operations.md` ont été exécutées au moins une fois sur une pile locale (`docker compose up`), noté dans la PR.
- [ ] Le README renvoie vers `docs/operations.md`.
- [ ] Les arborescences des `AGENTS.md` correspondent à `ls` des dossiers concernés.

## Tests à ajouter ou adapter

- Pas de test automatisé. Vérification par `grep` (critère ci-dessus) et par exécution des commandes du guide sur une pile locale.
- Facultatif : vérifier les liens Markdown relatifs avec `npx markdown-link-check README.md docs/operations.md`.

## Points d'attention

- Ordre (décidé le 2026-10-11) : après D-01, D-03, D-05 et C-05, ajoutées à `depends_on` (D-02 est déjà faite), car le guide décrit le non-root, le port 8080, le healthcheck, les tags `major.minor` et les backups.
- Ne pas recopier le contenu des rapports de revue dans les `AGENTS.md` : ils décrivent le code actuel, pas son historique.
- `backend/AGENTS.md` et `frontend/AGENTS.md` sont aussi modifiés par d'autres tâches qui ajoutent des fichiers (E-03, C-02...). Rebaser juste avant le merge.
- `docs/operations.md` donne des commandes destructrices (restauration, `down -v`). Les accompagner d'un avertissement explicite.
- Transmis par D-11 : `AGENTS.md` décrit encore l'ancien modèle de release (« Git Workflow », étape 10 : `git tag v1.0.0 && git push --tags` ; « CI/CD », Release : tout tag `v*` publie les images et déplace `latest`). L'aligner sur `README.md` (section « Release ») et `docs/plan/README.md` (section « Releases ») : pré-versions `vX.Y.Z-rc.N` sur `develop`, versions finales sur `main`, notes `docs/releases/vX.Y.Z.md` et `UPGRADING.md` mergées avant le tag, branche poussée avant le tag.
- Transmis par D-11 (revue de la PR #39) : le libellé de l'interface est « Settings > Admin Profile » (`settings.profileConfig`), repris dans les notes de release et `UPGRADING.md`. `README.md` (« change the password from Settings > Profile ») et l'avertissement de `backend/src/bootstrap/ensureAdmin.ts` (« Change it in Settings > Profile ») disent encore « Profile » : les aligner (fichier ajouté à `touches` ; aucun test ne vérifie ce texte).
- Transmis par C-01 (PR #44) : `npm run db:push` n'existe plus (remplacé par `db:deploy`, `db:status`, `db:check`). `AGENTS.md` (« Running Locally » : `npx prisma db push`) et `backend/AGENTS.md` (tableau « Scripts » : `db:push` ; `prisma/migrations/` absent de « Structure ») sont à aligner sur la section « Database migrations » du `README.md`.
- Transmis par D-07 : la convention de commit (Conventional Commits) est déjà dans « Coding Conventions » d'`AGENTS.md`, ainsi que le format `ID: titre` des PR. Reste à décrire dans « Git Workflow » (étapes 7 et 8) :
  - le modèle de PR `.github/pull_request_template.md` : `gh pr create --body-file` l'ignore, donc un agent part de ce fichier pour écrire le corps de sa PR ;
  - le label de PR qui la classe dans les notes de release (`breaking`, `feature`, `fix`, `dependencies`, `ci`, `docs`, voir `.github/release.yml`) ;
  - le mode de merge décidé le 2026-10-12 : merge commit partout (feature → `develop` et `develop` → `main`), squash et rebase désactivés ;
  - les rulesets de D-07 : push direct sur `main` et `develop` refusé, PR et checks `Backend` / `Frontend` obligatoires. Le contournement admin reste possible sur une PR, mais **les agents n'utilisent jamais `gh pr merge --admin`** : seul l'humain contourne, en cas d'urgence.
- Transmis par D-04 (PR #112) : les descriptions de la CI ne correspondent plus à `.github/workflows/ci.yml`. Les réécrire d'après le `ci.yml` du moment (les deux jobs lancent aussi `npm audit --omit=dev` : `critical` côté backend jusqu'à B-11, `high` côté frontend) :
  - `AGENTS.md`, section « CI/CD » (lignes 80-82 au 2026-10-12) : le job Backend lance aussi `npm run db:check` et `npm run lint` ; le job Frontend lance `npx tsc -b` (pas `tsc --noEmit`, qui ne vérifie aucun fichier côté frontend) ; quatre jobs en parallèle et non deux : `Backend`, `Frontend`, `Docker build (backend)` et `Docker build (frontend)` (build des images sans push) ; le workflow est aussi appelable par `workflow_call` (release, D-05) ;
  - `backend/AGENTS.md` (ligne 19) : « CI runs automatically on PRs: prisma generate → tsc → build → test → coverage check » oublie le lint, `db:check` et le build Docker ;
  - `frontend/AGENTS.md` (ligne 20) : « tsc → lint → build → test → coverage check » ; préciser `tsc -b`, le budget de bundle et le build Docker.
- Transmis par B-08 (PR #110) : le commentaire `# Plan d'action : page de suivi générée par docs/plan/build.mjs` de `.gitignore` est encore en français ; le traduire en anglais.
- Transmis par D-05 (PR #118) : le pipeline de release a changé, `README.md` (section « Release », tableau des tags), `AGENTS.md` (« CI/CD », Release) et `docs/plan/README.md` (« Releases ») ne le décrivent pas encore. À dire : la release lance la CI complète (`ci.yml` par `workflow_call`) avant de pousser une image ; images `linux/amd64` et `linux/arm64` ; une version finale publie `:X.Y.Z`, `:X.Y`, `:X` et `latest`, une pré-version `:X.Y.Z-rc.N` seulement ; SBOM et provenance attachées ; les deux images reçoivent `APP_VERSION` (`dev` hors release). Le paragraphe « Pulling release images » peut recommander `:<majeure>.<mineure>`.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : suivi des revues de la phase A. Ajout de `UPLOAD_DIR` (A-01), de l'étape `.env` dans « Running Locally » d'`AGENTS.md` (secrets obligatoires depuis A-04, ligne `admin123` à retirer) et de `src/bootstrap/` dans `backend/AGENTS.md` (étapes 3 et 4, deux critères).
- 2026-10-09 : les étapes de mise à jour depuis une ancienne version renvoient vers `UPGRADING.md` (D-11) au lieu d'être recopiées dans `docs/operations.md`.
- 2026-10-09 : D-11 (PR de D-11) transmet l'alignement d'`AGENTS.md` sur le nouveau modèle de release (Points d'attention).
- 2026-10-09 : revue de la PR #39 (D-11). Libellé « Settings > Admin Profile » à aligner dans `README.md` et dans l'avertissement d'`ensureAdmin` (Points d'attention) ; `backend/src/bootstrap/ensureAdmin.ts` ajouté à `touches`.
- 2026-10-09 : C-01 (PR #44) transmet l'alignement des `AGENTS.md` sur les migrations (Points d'attention).
- 2026-10-11 : décision humaine : D-09 passe après D-01, D-03, D-05 et C-05, ajoutées à `depends_on` comme le suggéraient les Points d'attention (D-02 déjà faite), pour documenter l'image finale et les backups en une fois. Dans le lot C-04, E-11, D-14, l'humain l'a remplacée par C-16 (`--ready` propose D-13 à cette place).
- 2026-10-12 : relecture de B-08 (PR #110) : le point « `backend/AGENTS.md:151` » de « Problème constaté » est réglé (`@prisma/client` et `prisma` rangés en « Runtime (database) », plus de `ts-node`). Commentaire français de `.gitignore` ajouté aux Points d'attention (fichier ajouté à `touches`).
- 2026-10-12 : relecture de D-04 (PR #112, seconde passe) : l'étape d'audit est bien dans `ci.yml`, Points d'attention mis à jour.
- 2026-10-12 : D-05 (PR #118) transmet la description du nouveau pipeline de release (Points d'attention).
