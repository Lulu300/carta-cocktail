---
id: C-48
title: "ensureAdmin : ne plus recopier la valeur de ADMIN_RESET_PASSWORD dans les logs"
phase: C
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [D-35]
touches: [backend/src/bootstrap/ensureAdmin.ts, backend/src/bootstrap/ensureAdmin.test.ts]
sources: []
branch: fix/C-48-admin-reset-warning-no-value
pr: "#168"
---

## Contexte

Triage CodeQL de D-35, alerte #27 `js/clear-text-logging` (« high ») : `backend/src/bootstrap/ensureAdmin.ts`, ligne 49, « This logs sensitive data returned by an access to ADMIN_RESET_PASSWORD as clear text ».

`isResetRequested()` ne déclenche la réinitialisation qu'avec la valeur exacte `'true'`. Pour toute autre valeur non vide sauf `'false'` (le défaut du compose), elle écrit :

```ts
console.warn(`ADMIN_RESET_PASSWORD='${flag}' is ignored: set it to exactly 'true' to reset the admin credentials`);
```

## Décisions validées

- 2026-11-12, humain (via D-35) : l'avertissement ne recopie plus la valeur de `ADMIN_RESET_PASSWORD`.

## Problème constaté

`ADMIN_RESET_PASSWORD` est un drapeau, mais son nom fait penser à un mot de passe : un opérateur peut y mettre le nouveau mot de passe au lieu de `true`. Ce mot de passe part alors en clair dans les logs du conteneur (`docker logs`, collecteurs de logs).

## Ce qu'il faut faire

1. Réécrire l'avertissement sans la valeur, en gardant l'aide utile : la variable est ignorée, seule la valeur exacte `true` réinitialise les identifiants, et une valeur comme `TRUE` ou `1` ne compte pas.
2. Mettre à jour le commentaire de `isResetRequested()` (« is logged » vise la valeur aujourd'hui).
3. Ne rien changer d'autre : la ligne `Admin credentials reset from environment (login email: …)` ne contient pas de secret.

## Critères d'acceptation

- [x] Avec `ADMIN_RESET_PASSWORD` à `1`, `TRUE`, `yes` ou un mot de passe, l'avertissement est écrit et ne contient pas la valeur.
- [x] Le comportement est inchangé : réinitialisation seulement avec `true`, aucun avertissement avec `false` ou une variable vide.

## Tests à ajouter ou adapter

- `ensureAdmin.test.ts`, cas `it.each(['1', 'TRUE', 'yes'])` : attendre le nouveau message, et vérifier qu'aucun appel à `console.warn` ne contient la valeur passée. Ajouter une valeur qui ressemble à un mot de passe (par exemple `'My-new-password-42'`).

## Points d'attention

- Aucune documentation ne cite le texte de ce message (vérifié le 2026-11-12) : `README.md` (lignes « Recovering the admin account » et tableau des variables) et `docs/releases/v1.5.0.md` disent seulement « ignored with a warning », qui reste vrai. Rien d'autre à mettre à jour.
- Après l'arrivée sur `main`, vérifier que l'alerte #27 passe à `fixed` ; sinon, la signaler au coordinateur plutôt que de contourner CodeQL.

## Journal

- 2026-11-12 : tâche créée par D-35 (triage CodeQL) pour l'alerte #27.
- 2026-11-12 : avertissement réécrit sans la valeur (aide conservée : seule la valeur exacte `true` compte, `TRUE` ou `1` non), commentaire de `isResetRequested()` mis à jour. Tests : `it.each` étendu à une valeur de type mot de passe avec le message exact, nouveau test qui vérifie que ni `console.warn` ni `console.log` ne contiennent ce mot de passe ; sondes de sabotage (valeur ajoutée au message, ou écrite dans un second `console.warn`) détectées. Couverture delta 100 %. PR #168.
