---
id: F-04
title: "Tests E2E Playwright sur les parcours clés"
phase: F
lane: ci
criticite: basse
effort: L
status: done
owner: agent
depends_on: [D-08]
touches: [e2e/, .github/workflows/, .github/dependabot.yml, AGENTS.md, frontend/AGENTS.md, README.md]
sources: ["04-tests.md §7"]
branch: test/F-04-playwright-e2e
pr: 297
---

## Contexte

Le smoke test D-08 vérifie la tuyauterie (nginx, upload, volume) avec `curl`. Il ne dit rien de l'interface : un formulaire qui n'envoie plus le bon champ ou une carte publique qui ne s'affiche plus passent inaperçus. Les tests frontend actuels mockent l'API (`vi.mock`), donc aucun test ne fait tourner un vrai navigateur contre un vrai backend.

## Problème constaté

- Aucun outil E2E dans le repo (ni Playwright, ni Cypress), aucun job CI correspondant (`04-tests.md §7`, vérifié : pas de dossier `e2e/`, `.github/workflows/` ne contient que `ci.yml` et `release.yml`).
- Les parcours critiques ne sont testés que par morceaux : sauvegarde d'un menu (bug C1 de la revue frontend, A-02), token expiré (A-10), export/import de backup (couverture de `backup.ts` à 5,5 %).

## Ce qu'il faut faire

1. Attendre D-08 : la pile compose démarre en CI avec `--wait` et des secrets générés.
2. Créer `e2e/` à la racine avec son propre `package.json` (`@playwright/test`), `playwright.config.ts` (`baseURL` `http://localhost`, projets `chromium` desktop et `Pixel 7` pour les pages publiques, `trace: 'retain-on-failure'`), et `tests/`.
3. Parcours, un fichier chacun :
   - connexion admin, puis déconnexion ;
   - créer une catégorie, une bouteille, puis un cocktail qui l'utilise, avec photo ;
   - créer une carte, y ajouter le cocktail dans une section, la publier, l'ouvrir en navigation privée (contexte sans token) ;
   - recherche sur la carte publique (accents, aucun résultat) ;
   - export de backup, puis import du fichier exporté ;
   - token expiré ou invalide dans `localStorage` → retour à la page de connexion sans perte de message.
4. Données : chaque test crée ses données avec un suffixe unique. Pas de remise à zéro de la base entre tests.
5. Workflow `.github/workflows/e2e.yml` : démarre la pile comme D-08 (factoriser le démarrage dans `scripts/smoke/` si utile), `npx playwright install --with-deps chromium`, `npx playwright test`, artefact du rapport HTML en cas d'échec. Non bloquant au début.

## Critères d'acceptation

- [x] `cd e2e && npx playwright test` passe en local contre `docker compose up -d --wait`.
- [x] Le workflow E2E tourne sur les PR vers `develop` et publie le rapport en cas d'échec.
- [x] Les 6 parcours passent trois fois de suite sans échec intermittent.
- [x] Le job dure moins de 15 minutes.

## Tests à ajouter ou adapter

- Les parcours ci-dessus. Facultatif : `@axe-core/playwright` sur les trois pages publiques (signalement seulement), et `toHaveScreenshot` sur la carte publique si le rendu est stable.

## Points d'attention

- Choix à valider avant de commencer : tests contre la pile compose (fidèle à la prod, plus lent, retenu ici) ou contre `npm run dev` + backend local (plus rapide, permet la couverture, mais ne teste ni nginx ni l'image).
- Sélecteurs : préférer `getByRole` et `getByLabel`. Ils dépendent des `htmlFor` ajoutés par E-09 ; avant E-09, certains champs n'ont pas de label lié. Ajouter E-09 à `depends_on` si les sélecteurs deviennent fragiles.
- Ajouter `/e2e` à Dependabot (D-06) et passer le check en obligatoire dans D-07 seulement après quelques semaines stables.
- Le dossier `e2e/` sort du périmètre de la couverture Vitest : il ne compte pas dans les seuils 60 % et 80 %.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-11-27 : PR 297 (branche `test/F-04-playwright-e2e`). Faits vérifiés : D-08 fait (`smoke.yml`), `docs/plan` à jour. Choix : pile compose (comme prévu), Chromium seul (le profil Pixel 7 tourne sur Chromium), un seul worker (une base SQLite), aucun retry. Parcours : connexion et déconnexion, jeton invalide ou rejeté en cours de session, catégorie → bouteille → cocktail avec photo, carte avec section publiée et lue par un invité (contexte sans jeton), recherche (accents, aucun résultat), export puis restauration d'une sauvegarde, et les parcours apparus depuis : carte hors ligne (F-02, service worker bloqué = le test échoue), thème clair après rechargement (F-06), page 404 (E-20), carte personnelle de bouteilles (F-08). Les données passent par l'API (`AdminApi`) avec un suffixe unique, la base n'est jamais remise à zéro (les listes sont paginées : le test cherche sa ligne). Une seule connexion par l'API (`auth.setup.ts`) ; le parcours de sauvegarde se reconnecte après la restauration, qui coupe toutes les sessions. Workflow `e2e.yml` : PR vers `develop`, non requis, 15 minutes au plus, rapport Playwright (traces, captures) et journaux compose en artefact en cas d'échec ; `/e2e` ajouté à Dependabot. 19 tests (dont les 5 fichiers publics rejoués en mobile) passent trois fois de suite en local, environ 14 s chacun. Sans notes de version (aucun effet visible). Reste à l'humain : rendre le check obligatoire (D-07) après quelques semaines stables.
