---
id: E-55
title: "Export de sauvegarde sans réponse ou coupé en cours : message traduit"
phase: E
lane: frontend
criticite: basse
effort: S
status: in-progress
owner: agent
depends_on: [E-50, E-53]
touches: [frontend/src/pages/admin/SettingsPage.tsx, frontend/src/pages/admin/SettingsPage.test.tsx, frontend/src/i18n/locales/admin/]
sources: []
branch: fix/E-55-backup-export-cut-message
pr: ""
---

## Contexte

Relevé par la relecture de la PR #186 (E-53), nit 3. E-47 (#182) donne un message traduit au 504 de l'export, et E-50 (#183) donne à la restauration un message traduit quand elle n'a pas de réponse HTTP. L'export n'avait rien de tel : E-50 l'avait laissé de côté exprès (« il ne modifie rien, réessayer est sans risque »).

Décision de l'humain : « Code fix before the rc » — « Small frontend task (author + reviewer): a translated message when the export fails without an answer or is cut mid-download (export is read-only: 'check your connection and try again'). »

## Problème constaté

Vérifié sur `develop` :

- **Lecture de la réponse** (`backup.exportBackup()`, `frontend/src/services/api.ts`) : `await send('/backup/export')`, puis `await res.blob()`, puis `attachmentFilename`, `URL.createObjectURL`, et un clic sur un lien `download`.
- **Erreurs qui remontent** :
  - sans réponse HTTP, `fetch` rejette dans `send()` avec une `TypeError` (spécification Fetch), qui passe telle quelle ;
  - une réponse en erreur donne une `ApiError` (`readErrorBody` attrape un corps illisible) : 504 d'E-47, 409 d'E-51, 500 du backend ;
  - un téléchargement coupé après les en-têtes fait rejeter `res.blob()` avec une `TypeError`, qui passe aussi telle quelle ;
  - l'étape du lien ne rejette pas avec une `TypeError` dans les navigateurs supportés : `createObjectURL` reçoit toujours un `Blob`.
- **Écran actuel** (Settings > Backup & Restore) : `showBackupError` affiche `err.message`, donc le texte brut du navigateur : « Failed to fetch » (Chrome, Edge), « NetworkError when attempting to fetch resource. » (Firefox), « Load failed » (Safari), ou « network error » pour un corps coupé dans Chrome. Le test d'E-53 sur le téléchargement coupé utilisait une `Error('Connection lost')`, qu'un navigateur ne produit pas.

## Ce qu'il faut faire

1. Dans `SettingsPage` seulement, réutiliser la détection d'E-50 pour l'export : une `TypeError` venant de l'appel `backupApi.exportBackup()` (requête ou lecture du corps) affiche un message traduit (en/fr, bundle admin) : connexion coupée, l'export ne modifie rien, vérifier la connexion et réessayer.
2. Une seule détection pour les deux actions : le helper d'E-50 (`requestRestore`) devient générique (`orNoAnswer`), sans dupliquer le `try`/`TypeError`.
3. Le 504 (E-47), les 409 (E-49/E-51), les autres erreurs JSON et l'erreur qui n'est pas une `Error` gardent leur message. Les deux boutons redeviennent actifs (E-53).
4. Ne pas modifier `services/api.ts`, le backend ni nginx.

## Critères d'acceptation

- [x] Un export sans réponse HTTP affiche `settings.backup.exportNoAnswer`, ni le texte du navigateur, ni un message de restauration, ni `exportTimeout`, ni un succès, et ne télécharge rien.
- [x] Un export dont le téléchargement est coupé (`blob()` qui rejette avec une `TypeError`) affiche `settings.backup.exportNoAnswer`, pas « network error ».
- [x] Le 504 garde `exportTimeout`, le 502 `common.serverUnavailable`, un 500 ou un 409 JSON le message du backend, une erreur qui n'est pas une `Error` `common.error`.
- [x] La restauration sans réponse garde `restoreNoAnswer` suivi de `restoreMayStillRun`.
- [x] Après un export sans réponse ou coupé, « Export Backup » et « Restore Backup » sont de nouveau actifs.
- [x] Pas de modification de `services/api.ts`, du backend ni de nginx.

## Tests à ajouter ou adapter

- `pages/admin/SettingsPage.test.tsx` :
  - le test « export sans réponse » d'E-50 (qui vérifiait le texte du navigateur) attend maintenant le nouveau message, l'absence de succès et de téléchargement, et les deux boutons actifs ;
  - `holdExportDownload().fail()` coupe le corps avec une `TypeError('network error')`, comme un navigateur, et le test du téléchargement coupé d'E-53 attend le nouveau message ;
  - `NO_ANSWER_CAUSE` couvre les deux clés, donc les tests du 504 (export et restauration), de la réponse 200 de corps `null` et du 409 vérifient aussi l'absence du message de l'export ;
  - les tests existants du 500, du 502, du 409 et de l'erreur qui n'est pas une `Error` passent sans changement.
- Sondes de sabotage sur `SettingsPage.tsx` et les fichiers de traduction : voir le Journal.

## Points d'attention

- **Portée de la détection** : comme pour la restauration, seul l'appel à l'API est enveloppé. Pour l'export, cet appel comprend la lecture du corps (le cas visé) et l'étape du lien de téléchargement, qui est dans `exportBackup()`. Séparer les deux demanderait de modifier `api.ts`. Ce n'est pas nécessaire : l'étape du lien ne rejette pas avec une `TypeError` (voir « Problème constaté »).
- **Une seule clé, sans conseil séparé** : la restauration sépare la cause et le conseil (`restoreMayStillRun`) parce que deux causes partagent le même conseil. L'export n'a qu'un message, qui couvre les deux cas (« avant la fin du téléchargement » est vrai sans réponse comme après une coupure).
- **Pas de reprise de `public.loadErrorHint`** (« Check your connection and try again. ») : elle sert aux pages publiques, et la phrase de l'export dit en plus qu'il ne modifie rien sur le serveur.

## Journal

- 2026-11-13 : tâche créée et faite (branche `fix/E-55-backup-export-cut-message`). `requestRestore` devient `orNoAnswer`, utilisé par l'export et la restauration ; nouveau message `settings.backup.exportNoAnswer`. `services/api.ts` n'est pas modifié. Sondes de sabotage, chacune annulée : export non enveloppé (2 échecs), toute `Error` comptée comme sans réponse (11), tout ce qui n'est pas une `ApiError` (2), message de la restauration sur l'export (2), pas de `return` après le message (2), texte brut affiché (2), message de l'export sur la restauration (1), clé fr absente (1), clé en absente (2).
- Notes de version : quand un export de sauvegarde n'obtient pas de réponse du serveur ou que son téléchargement est coupé, l'écran de sauvegarde dit que la connexion a été coupée, que l'export ne modifie rien et qu'on peut réessayer, au lieu du texte brut du navigateur (« Failed to fetch », « network error »).
