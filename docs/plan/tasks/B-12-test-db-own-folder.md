---
id: B-12
title: "Base de test backend dans son propre dossier"
phase: B
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [B-03]
touches: [backend/src/test/, backend/AGENTS.md]
sources: []
branch:
pr:
---

## Contexte

Depuis B-03, la base de test est `backend/prisma/test.db`, créée une fois par run par `src/test/globalSetup.ts`. Ce dossier contient aussi la base locale du développeur : avec `.env.example`, `DATABASE_URL="file:./carta_cocktail.db"` donne `backend/prisma/carta_cocktail.db`.

## Problème constaté

- La restauration d'une sauvegarde garde une copie de la base remplacée dans `<dossier de la base>/backups/pre-restore-<horodatage>.db` (`backend/src/services/backupService.ts`, `restoreBackup`). Pendant les tests, `backend/src/routes/backup.test.ts` écrit donc ses copies dans `backend/prisma/backups/`, le dossier où le développeur trouve les copies de sa vraie base.
- Le test ne supprime que les copies qu'il a créées, et `*.db` est ignoré par git. Mais un run interrompu (Ctrl+C, plantage) laisse des `pre-restore-*.db` à côté des copies réelles, et rien ne permet de les distinguer.
- Même chose pour les fichiers temporaires `.restore-*` que la restauration crée à côté de la base.

## Ce qu'il faut faire

1. Mettre la base de test dans un dossier à elle, qui ne contient rien d'autre, par exemple `backend/prisma/test/test.db` (`DATABASE_URL=file:./test/test.db`, résolu depuis `backend/prisma/`) ou un dossier temporaire du système créé par `globalSetup`.
   - `src/test/testDatabase.ts` reste le seul endroit qui définit l'URL et le chemin.
   - `globalSetup.ts` crée le dossier avant `prisma db push` et le supprime entièrement en fin de run (base, journaux, `backups/`).
   - Avec un dossier temporaire, `setup.ts` (exécuté dans chaque worker) doit recevoir le même chemin que `globalSetup` (variable d'environnement posée par `globalSetup`, ou `provide`/`inject` de Vitest).
2. Vérifier que `backup.test.ts` passe sans modification : ses chemins dérivent de `resolveDatabasePath()`.
3. Mettre à jour la ligne « Tests run against a real SQLite test DB » de `backend/AGENTS.md`.

Hors périmètre : la variable `DATABASE_URL` de `.github/workflows/ci.yml` (D-04) ; le README (D-09).

## Critères d'acceptation

- [ ] Pendant et après `npm test`, rien n'est écrit dans `backend/prisma/` en dehors du dossier de la base de test.
- [ ] Le dossier de la base de test n'existe plus après le run, `backups/` compris.
- [ ] Une base `backend/prisma/carta_cocktail.db` et un dossier `backend/prisma/backups/` existants restent intacts après `npm test`.
- [ ] Tous les tests passent ; couverture inchangée ou meilleure.

## Tests à ajouter ou adapter

- `backend/src/test/helpers.test.ts` : la base ouverte par les tests (`resolveDatabasePath()`) se trouve dans le dossier de test et non directement dans `backend/prisma/`.
- Vérification manuelle décrite dans la PR : créer un `backend/prisma/backups/sentinel.db`, lancer `npm test` puis l'interrompre pendant `backup.test.ts`, et constater que `backend/prisma/backups/` ne contient que `sentinel.db`.

## Points d'attention

- Prisma résout un chemin SQLite relatif depuis le dossier de `schema.prisma`, pas depuis le dossier courant (voir B-03).
- `globalSetup` tourne dans le processus principal, `setup.ts` dans chaque worker, avant tout import de `@prisma/client`.

## Journal

- 2026-10-11 : tâche créée à partir de la revue de la PR #89 (B-03, remarque 2), hors revue du 2026-10-08.
