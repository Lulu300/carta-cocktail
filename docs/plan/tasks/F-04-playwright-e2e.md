---
id: F-04
title: "Tests E2E Playwright sur les parcours clés"
phase: F
lane: ci
criticite: basse
effort: L
status: todo
owner: agent
depends_on: [D-08]
touches: [e2e/, .github/workflows/]
sources: ["04-tests.md §7"]
branch:
pr:
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

- [ ] `cd e2e && npx playwright test` passe en local contre `docker compose up -d --wait`.
- [ ] Le workflow E2E tourne sur les PR vers `develop` et publie le rapport en cas d'échec.
- [ ] Les 6 parcours passent trois fois de suite sans échec intermittent.
- [ ] Le job dure moins de 15 minutes.

## Tests à ajouter ou adapter

- Les parcours ci-dessus. Facultatif : `@axe-core/playwright` sur les trois pages publiques (signalement seulement), et `toHaveScreenshot` sur la carte publique si le rendu est stable.

## Points d'attention

- Choix à valider avant de commencer : tests contre la pile compose (fidèle à la prod, plus lent, retenu ici) ou contre `npm run dev` + backend local (plus rapide, permet la couverture, mais ne teste ni nginx ni l'image).
- Sélecteurs : préférer `getByRole` et `getByLabel`. Ils dépendent des `htmlFor` ajoutés par E-09 ; avant E-09, certains champs n'ont pas de label lié. Ajouter E-09 à `depends_on` si les sélecteurs deviennent fragiles.
- Ajouter `/e2e` à Dependabot (D-06) et passer le check en obligatoire dans D-07 seulement après quelques semaines stables.
- Le dossier `e2e/` sort du périmètre de la couverture Vitest : il ne compte pas dans les seuils 60 % et 80 %.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
