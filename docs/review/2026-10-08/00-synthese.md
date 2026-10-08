# Synthèse de la revue du 8 octobre 2026

Revue complète du dépôt (environ 23 000 lignes, 163 fichiers) menée par huit agents spécialisés, chacun sur un périmètre : routes backend, données et performance, sécurité, tests, architecture frontend, UI/UX et performance frontend, DevOps et historique, dépendances. Les points marqués ✅ ont été revérifiés directement dans le code. Les rapports détaillés suivent celui-ci (01 à 08).

## Verdict

Le projet est riche fonctionnellement et bien construit pour un projet solo : code lisible, TypeScript strict, vrais tests d'intégration côté backend (sans mock de la base), CI en place et workflow PR suivi depuis fin février. 531 tests passent (249 backend, 282 frontend).

En revanche, plusieurs bugs de **perte de données** et de **sécurité** existent en production sans que les tests les détectent. Trois raisons à ça :
- le contrôle de couverture sur les lignes modifiées est presque inopérant ;
- la couverture frontend affichée est gonflée ;
- rien ne teste la chaîne complète nginx → Express → Docker.

## Points critiques

**Perte de données**

| | Constat | Où | Tâche |
|---|---|---|---|
| ✅ | Les photos ne sont pas écrites dans le volume Docker (`/uploads` au lieu de `/app/uploads`). Elles disparaissent à chaque mise à jour de l'image. | `backend/src/config.ts:11` | A-01 |
| ✅ | Sauvegarder un menu cocktails efface les sections : `menuSectionId` est ignoré par le backend. | `backend/src/routes/menus.ts:99-108` | A-02 |
| ✅ | Un `PUT` partiel sur un cocktail vide la recette (suppression sans condition, hors transaction). | `backend/src/routes/cocktails.ts:512-513` | A-03 |
| | `prisma db push --accept-data-loss` à chaque démarrage, sans migrations versionnées. | `backend/Dockerfile:18` | C-01 |
| | La restauration de backup écrase SQLite sous des connexions ouvertes, sans validation ni copie de l'existant. | `backend/src/routes/backup.ts` | C-05 |

**Sécurité**

| | Constat | Où | Tâche |
|---|---|---|---|
| ✅ | Le seed remet le mot de passe admin à `admin123` à chaque redémarrage. | `backend/prisma/seed.ts:9-15` | A-04 |
| | Secrets JWT par défaut publics (le dépôt est public). | `backend/src/config.ts:8`, compose | A-04 |
| ✅ | `isAdmin = !!token` : n'importe quel en-tête `Authorization` ouvre les menus privés. | `backend/src/routes/public.ts:73` | A-05 |
| | L'API publique expose les prix d'achat, les notes privées, les éléments masqués et tous les cocktails par id. | `backend/src/routes/public.ts` | A-05 |
| | Pas de limitation des essais de connexion, port 3001 publié sur l'hôte. | `auth.ts`, compose | C-11, D-03 |
| | 11 vulnérabilités en production côté backend (2 critiques), 2 hautes côté frontend ; images Docker en Node 20 (fin de vie). | `package.json`, Dockerfiles | A-07, B-07, B-01 |

**Fonctionnel**

| | Constat | Où | Tâche |
|---|---|---|---|
| ✅ | nginx sans `client_max_body_size` : limite de 1 Mo, photos et backups refusés en 413. | `frontend/nginx.conf.template` | A-06 |
| ✅ | i18n sans `supportedLngs` : un navigateur `fr-FR` voit l'interface en français mais les noms d'entités en anglais. | `frontend/src/i18n/index.ts` | A-08 |
| | Toute réponse 401 supprime le token, même « mot de passe actuel incorrect ». | `frontend/src/services/api.ts:31-34` | A-10 |

## Performance

- **Frontend** : un seul chunk de 605 kB (168 kB gzip), aucun `React.lazy`. Les invités téléchargent l'admin et `jszip`. nginx ne compresse pas. Les images sont servies brutes, sans `loading="lazy"`. → A-06, E-01, E-11, F-01.
- **Backend** : `availabilityService` fait environ 600 requêtes pour 100 cocktails, avec une table d'unités en dur qui fausse les volumes (« 1 tasse » = 1 ml). Il y a 14 instances de `PrismaClient` et aucun index sur les clés étrangères. → C-02, C-07, C-08.

## Lisibilité et refactorisation

- **Backend** : 71 `try/catch` et 39 `parseInt` sans contrôle → middleware d'erreur (C-03) et zod (C-04). La synchro des menus système existe en 3 implémentations divergentes (C-06). L'export de cocktail est copié-collé (C-09).
- **Frontend** : pas de gestion de l'état serveur (E-02), mutations sans retour visuel (E-04), 11 modales copiées-collées, éditeurs de menus dupliqués à ~40 % (E-03, E-05, E-07, E-08), une cinquantaine de chaînes en dur (E-10).
- **Tests** : couverture frontend réelle autour de 55-60 % ; le script de delta-coverage compte `backup.ts` à 98,5 % au lieu de 5,5 % (B-02). Mocks `as never` (E-13). Pas d'E2E (D-08, F-04).

## Design et UX

**Points forts** : ambiance « speakeasy » cohérente (bleu nuit, ambre, Playfair), feuille d'impression façon bristol, bascule grille/liste.

**À améliorer**
- Couleurs codées en dur ~180 fois → tokens de thème (E-03).
- Ni skeletons, ni toasts, ni `<label>` liés aux champs ; `focus:outline-none` partout (E-04, E-09).
- La carte publique n'affiche rien quand la recherche est vide, perd le scroll au retour et n'a pas de navigation par sections (E-11).

## Dépendances

Les lockfiles datent du 23 février. Il faut d'abord passer les images en Node 24 (B-01) et appliquer les correctifs sans montée majeure (A-07), puis les majeures par lots sérialisés par paquet :

| Lot | Contenu | Tâche |
|---|---|---|
| 2 | adm-zip 0.6, archiver 8, dotenv 18 | B-07 |
| 3 | ESLint 10, et ESLint côté backend | B-05 |
| 4 | Vitest 5, jsdom 29, jest-dom 7 | B-04 |
| 5 | Vite 8 | B-06 |
| 6 | i18next 26 | B-09 |
| 7 | Prisma 7 | C-15 |

TypeScript 7 est bloqué par typescript-eslint (F-07). Détail dans `08-dependencies.md`.

## Plan

Le plan d'action complet est dans `docs/plan/` : une tâche par fichier, avec dépendances, fichiers touchés et critères d'acceptation. Mode d'emploi dans `docs/plan/README.md`, page de suivi générée par `node docs/plan/build.mjs`.
