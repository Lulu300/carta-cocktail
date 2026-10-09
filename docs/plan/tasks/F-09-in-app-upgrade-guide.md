---
id: F-09
title: "Guide de mise à jour dans l'application"
phase: F
lane: backend
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [D-11, D-05, C-01]
touches: [backend/prisma/schema.prisma, backend/prisma/migrations/, backend/src/services/upgradeNoticeService.ts, backend/src/routes/system.ts, backend/src/app.ts, backend/src/index.ts, backend/src/i18n/, backend/package.json, backend/package-lock.json, backend/Dockerfile, .github/workflows/release.yml, docker-compose.yml, frontend/src/components/admin/UpgradeNoticeBanner.tsx, frontend/src/components/layout/AdminLayout.tsx, frontend/src/services/api.ts, frontend/src/i18n/locales/]
sources: ["07-devops-history.md §3.4"]
branch:
pr:
---

## Décisions validées (2026-10-09)

- **Guide de mise à jour.** Un utilisateur qui a plusieurs versions de retard doit voir l'enchaînement de toutes les actions obligatoires, dans le dépôt (`UPGRADING.md`, D-11) et si possible directement dans son instance (cette tâche).
- Chaque release a des notes structurées dans `docs/releases/vX.Y.Z.md`, avec un front matter lisible par une machine (`version`, `date`, `breaking`, `required_actions`) : voir D-11.

## Contexte

L'instance tourne sur un NAS et se met à jour par `docker compose pull`, souvent en sautant plusieurs versions. Les actions obligatoires de chaque version sont écrites dans les notes de release (D-11), mais l'admin ne les lit pas forcément. L'application connaît sa version (`APP_VERSION`, injectée par D-05) et dispose de migrations versionnées (C-01) : elle peut se souvenir de la dernière version lancée et montrer, au premier démarrage d'une nouvelle version, la liste ordonnée des actions des versions sautées.

## Problème constaté

- Aucune trace en base de la version qui a tourné en dernier.
- Les notes de release (`docs/releases/`, D-11) sont hors du contexte de build de l'image backend (`docker-compose.yml:4` et `release.yml` utilisent `./backend`) : elles ne sont pas embarquées.
- Rien n'alerte l'admin après une mise à jour.

## Ce qu'il faut faire

1. **Schéma** (migration Prisma, C-01) : un modèle `AppState` à une ligne (`id = 1`), avec `lastRunVersion String?`, `pendingNoticeFrom String?`, `pendingNoticeTo String?`, `noticeAcknowledgedAt DateTime?`. Ou des champs équivalents sur `SiteSettings` si c'est plus simple : le justifier dans la PR.
2. **Notes dans l'image** : copier `docs/releases/*.md` dans `/app/releases` sans élargir le contexte de build. Utiliser un contexte nommé : `build-contexts: releases=./docs/releases` dans `release.yml` (`docker/build-push-action`), `additional_contexts: { releases: ./docs/releases }` dans `docker-compose.yml`, et `COPY --from=releases . /app/releases` dans le Dockerfile. `RELEASES_DIR` (défaut `/app/releases`, `../docs/releases` en dev) permet de le changer.
3. **`src/services/upgradeNoticeService.ts`** :
   ```ts
   export interface RequiredAction { version: string; when: 'before' | 'after'; action: string }
   export function compareVersions(a: string, b: string): number;           // X.Y.Z et X.Y.Z-rc.N
   export function loadReleaseNotes(dir: string): ReleaseNote[];            // front matter seulement
   export function requiredActionsBetween(notes: ReleaseNote[], from: string, to: string): RequiredAction[];
   export async function recordStartup(db: Db, currentVersion: string, dir: string): Promise<RequiredAction[]>;
   ```
   - `requiredActionsBetween` garde les versions `from < v ≤ to`, de la plus ancienne à la plus récente, et dans chaque version l'ordre du fichier. Une pré-version dont la version finale existe aussi est ignorée (le fichier final fait foi).
   - `recordStartup` : si `APP_VERSION` vaut `dev` ou n'est pas une version valide, ne rien faire. Si `lastRunVersion` est vide (installation neuve, ou première version qui embarque cette tâche), enregistrer la version sans avis. Si la version a monté, calculer les actions, mémoriser `pendingNoticeFrom`/`pendingNoticeTo`, remettre `noticeAcknowledgedAt` à `null`, puis mettre à jour `lastRunVersion`. Si elle a baissé, journaliser un avertissement et ne rien changer.
   - Un fichier illisible ou un front matter invalide : avertissement dans les logs, le fichier est ignoré, le démarrage continue.
4. **Démarrage** (`src/index.ts`, après les migrations et avant `listen`) : appeler `recordStartup`, puis écrire dans les logs la liste ordonnée des actions (une ligne par action, avec la version et « before »/« after »). Une erreur ici ne bloque pas le démarrage.
5. **Route admin** (`src/routes/system.ts`, protégée par `authMiddleware`) :
   - `GET /api/system/upgrade-notice` → `{ from, to, actions, acknowledged }`, ou `204` s'il n'y a pas d'avis en attente ;
   - `POST /api/system/upgrade-notice/acknowledge` → enregistre `noticeAcknowledgedAt`.
6. **Frontend** : `UpgradeNoticeBanner` dans `AdminLayout`. Il affiche « Mise à jour de vX vers vY », la liste ordonnée des actions (groupées par version), un lien vers `UPGRADING.md` sur GitHub et un bouton « J'ai fait ces actions » qui appelle `acknowledge` puis masque le bandeau. Il reste visible sur toutes les pages admin jusqu'à validation. Textes via i18n (`en`, `fr`) ; le texte des actions reste en anglais (notes de release en anglais).
7. **Actions « before »** : la nouvelle version ne peut pas les afficher à temps, puisqu'elles devaient être faites avant de la lancer. Le bandeau les montre quand même, sous un titre explicite (« À faire avant la mise à jour : à vérifier maintenant »), avec un lien vers `UPGRADING.md`. `UPGRADING.md` le dit déjà dans son introduction (D-11) : lui et les notes de release restent la référence.

## Critères d'acceptation

- [ ] La migration ajoute l'état applicatif ; `npm run db:check` passe.
- [ ] Installation neuve : aucun bandeau ; `lastRunVersion` vaut la version lancée.
- [ ] Passage de 1.5.0 à 1.7.0 avec des notes pour 1.6.0 et 1.7.0 : les logs et le bandeau listent les actions de 1.6.0 puis de 1.7.0, dans l'ordre des fichiers.
- [ ] Après validation, le bandeau disparaît et ne revient pas au redémarrage suivant de la même version.
- [ ] Retour à une version plus ancienne : avertissement dans les logs, pas de bandeau, `lastRunVersion` inchangé.
- [ ] `APP_VERSION=dev` : rien n'est enregistré ni affiché.
- [ ] Un fichier de notes invalide n'empêche pas le démarrage.
- [ ] Les actions « before » sont signalées comme telles, avec le lien vers `UPGRADING.md`.
- [ ] Les fichiers `docs/releases/*.md` sont présents dans l'image (`docker run --rm --entrypoint ls <image> /app/releases`).
- [ ] Couverture ≥ 80 % sur les lignes modifiées, backend et frontend.

## Tests à ajouter ou adapter

- `upgradeNoticeService.test.ts` (unitaire, dossier de notes temporaire) :
  - `compareVersions` : `1.5.0 < 1.10.0`, `1.5.0-rc.1 < 1.5.0`, `1.5.0-rc.2 > 1.5.0-rc.1` ;
  - `requiredActionsBetween` : bornes (version de départ exclue, version d'arrivée incluse), ordre, pré-version ignorée quand la finale existe, liste vide ;
  - `loadReleaseNotes` : fichier sans front matter ou YAML invalide → ignoré avec avertissement ; `TEMPLATE.md` ignoré.
- `recordStartup` sur la base de test : installation neuve, montée de version, même version (pas de nouvel avis), descente, `dev`.
- `system.test.ts` (supertest) : 401 sans token ; 204 sans avis ; avis renvoyé après une montée ; `acknowledge` puis `GET` → plus d'avis en attente.
- `UpgradeNoticeBanner.test.tsx` : rendu de la liste groupée par version, section « before » distincte, clic sur « J'ai fait ces actions » → appel `acknowledge` et bandeau masqué ; rien n'est affiché sur une réponse 204.

## Points d'attention

- **Limite à dire clairement** : les actions à faire *avant* la mise à jour (ex. ajouter une variable au `.env`) ne peuvent pas être affichées par la nouvelle version avant qu'elle démarre ; si elles manquent, elle peut même refuser de démarrer. `UPGRADING.md` et les notes de release restent la référence ; le bandeau est un rappel.
- Première version qui embarque cette tâche : `lastRunVersion` est vide sur une instance existante, la version d'origine est inconnue. Pas de bandeau ce jour-là.
- **Notes de version** (règle de D-11 : la PR ne touche ni `docs/releases/` ni `UPGRADING.md`). Changement non cassant (`breaking: false`). La description de la PR a une section « Required actions » et le Journal une ligne « Notes de version » : aucune action obligatoire ; préciser que le bandeau n'apparaît qu'à partir de la mise à jour **suivante**, et qu'un compose personnalisé qui construit l'image lui-même doit passer le contexte `releases` (voir plus bas). Épinglage recommandé : `:<majeure>.<mineure>` (D-05 est une dépendance).
- **Restauration de backup (C-05)** : une sauvegarde restaure aussi la ligne `AppState`. Un `lastRunVersion` ancien ferait apparaître au redémarrage un faux bandeau (ou un faux avertissement de retour en arrière). Après une restauration, réenregistrer la version courante (`lastRunVersion = APP_VERSION`, sans avis), ou exclure cet état de la restauration. Le tester avec C-05.
- Lecture du front matter : un parseur YAML (paquet `yaml`) est le plus sûr. L'ajouter touche `backend/package.json` et le lockfile : une seule tâche du couloir `deps` à la fois. Sinon, D-11 peut restreindre le format pour une lecture sans dépendance : à trancher dans la PR.
- `additional_contexts` demande Docker Compose ≥ 2.17 ; `build-contexts` est géré par `docker/build-push-action@v6`. D-01 refond le Dockerfile : placer la copie des notes dans le stage runtime.
- `COPY --from=releases` casse un simple `docker build ./backend` : sans le contexte nommé, Docker cherche une image appelée `releases`. Le job de build Docker de D-04 (CI) et le smoke test de D-08 doivent aussi passer `build-contexts: releases=./docs/releases` (ou `--build-context releases=./docs/releases`). Les mettre à jour dans la même PR, ou documenter la commande dans le README si ces tâches ne sont pas encore mergées.
- `release.yml` et le Dockerfile sont aussi modifiés par D-05 et D-01 : enchaîner.
- Le chemin des notes en dev (`../docs/releases` depuis `backend/`) doit être résolu depuis le dossier du fichier, comme `resolveDatabasePath` de C-05, pas depuis le cwd.

## Journal

- 2026-10-09 : tâche créée à partir des décisions humaines du 2026-10-09 (guide de mise à jour dans l'instance).
- 2026-10-09 : revue de la PR #38. Points d'attention ajoutés : notes de version (règle de D-11), restauration de backup (réenregistrer la version courante), contexte `releases` pour les builds de D-04 et D-08.
