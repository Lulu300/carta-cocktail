---
id: F-21
title: "Test instable : révocation de l'URL après l'export ZIP des cocktails"
phase: F
lane: frontend
criticite: basse
effort: S
status: done
owner: agent
depends_on: []
touches: [frontend/src/services/exportZip.test.ts]
sources: []
branch: test/F-21-flaky-export-zip-revoke
pr: 300
---

## Contexte

`downloadBlob()` (`frontend/src/utils/downloadBlob.ts`) révoque l'URL d'objet au tick suivant (`setTimeout(…, 0)`), pour que le navigateur ait lancé le téléchargement.

## Problème constaté

`exportZip.test.ts` › « should clean up object URL after download » vérifie `URL.revokeObjectURL` juste après `await exportCocktailsAsZip([1])`, sans attendre ce `setTimeout`. Sous Node 26 (D-47), le test échoue environ une fois sur trois en local (`Number of calls: 0`), seul ou dans la suite complète : il peut faire échouer le job Frontend de la CI sans rapport avec la PR.

## Ce qu'il faut faire

1. Attendre la révocation dans le test (`await vi.waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download'))`, ou faux minuteurs avancés explicitement).
2. Chercher les autres tests qui vérifient `revokeObjectURL` juste après un téléchargement et les corriger de la même façon.

## Critères d'acceptation

- [x] Le test passe 20 fois de suite (`npx vitest run src/services/exportZip.test.ts --repeat 20` ou une boucle).
- [x] Aucun autre test ne dépend du tick de `downloadBlob()` sans l'attendre.

## Tests à ajouter ou adapter

- `frontend/src/services/exportZip.test.ts`.

## Points d'attention

- Ne pas changer `downloadBlob()` : le délai est voulu.

## Journal

- 2026-11-27 : tâche créée pendant F-10 (#299), après le merge de `develop` passé à Node 26 : le test a échoué 2 fois sur 5 en local, sans lien avec F-10.
- 2026-11-27 : cause confirmée : le test lisait `revokeObjectURL` avant le `setTimeout(…, 0)` de `downloadBlob()` (course entre le tick et l'assertion). Correctif : `vi.waitFor`. Avant : 10 échecs sur 50 exécutions du fichier ; après : 0 sur 50, et 0 sur 5 exécutions de la suite complète (1615 tests). Aucun autre test ne vérifie la révocation d'un téléchargement ; le code de production est inchangé.
