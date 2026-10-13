---
id: E-30
title: "Locales : scinder les traductions public/admin pour alléger le chargement public"
phase: E
lane: frontend
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: [E-01, D-14]
touches: [frontend/src/i18n/, frontend/src/App.tsx, frontend/src/App.test.tsx, frontend/AGENTS.md, docs/plan/tasks/C-39-english-uk-variant.md, .github/scripts/bundle-budget.mjs, .github/scripts/bundle-budget.test.mjs]
sources: ["06-frontend-ux-perf.md §1"]
branch: feature/E-30-locales-public-admin-split
pr: https://github.com/Lulu300/carta-cocktail/pull/133
---

## Décisions validées

- 2026-10-12, décision humaine : E-30 scinde les locales en un paquet public (chargé au démarrage) et un paquet admin (chargé avec le code admin, par exemple `i18n.addResourceBundle` au chargement du chunk admin). E-30 est mergée avant E-10, qui est ensuite rebasée dessus. Ne charger que la langue active n'est pas retenu (hors périmètre). Le budget de 140 kB n'est pas relevé.

## Contexte

Le budget du chargement public (`.github/scripts/bundle-budget.mjs`, 140 kB gzip, vérifié en CI par D-14) est à 139,94 kB sur `develop`. `frontend/src/i18n/index.ts` importe `locales/en.json` et `locales/fr.json` en entier : les 461 messages des deux langues partent dans le chunk `api` du premier chargement de la carte publique, alors que les pages publiques et les composants partagés n'en utilisent que 60. E-10 (textes en dur extraits, prête mais non poussée) dépasse le budget de 90 octets (140,09 kB).

## Problème constaté

- `i18n/index.ts:4-5` : import statique des deux fichiers complets, donc environ 10 kB gzip de messages admin dans le JavaScript qu'un invité télécharge en scannant le QR code d'une carte.
- `App.tsx` découpe déjà le code de `/login` et `/admin` en chunks à la demande (E-01), mais leurs textes restent dans le chunk d'entrée.
- Chaque nouvelle clé admin (E-10, E-15, E-23, E-27, F-08, F-09…) alourdit la carte publique.

## Ce qu'il faut faire

1. Découper chaque langue en deux fichiers, sans changer aucun texte : `locales/public/{en,fr}.json` pour les clés utilisées par le premier chargement (fichiers atteints depuis `main.tsx` par des imports statiques : pages publiques, `PublicLayout`, `Toaster`, `ConfirmDialog`, `App.tsx`…), `locales/admin/{en,fr}.json` pour toutes les autres (page de connexion et admin). Un même espace de noms (`common`, `cocktails`…) peut être partagé entre les deux paquets.
2. `i18n/index.ts` n'initialise i18next qu'avec le paquet public.
3. Nouveau module `i18n/admin.ts` qui enregistre le paquet admin des deux langues à son évaluation (`addResourceBundle` en fusion profonde, sans écraser).
4. `App.tsx` : chaque chunk paresseux de `/login` et `/admin` attend aussi `i18n/admin` (`lazyWithAdminMessages`), donc les messages admin sont enregistrés avant le premier rendu de la page de connexion, d'`AdminLayout` et des pages admin.
5. Une future langue s'ajoute à un seul endroit par paquet : la table de messages d'`index.ts` et celle d'`admin.ts`, typées par `TRANSLATED_LANGUAGES` (langues qui ont leurs propres fichiers, dont part `SUPPORTED_LANGUAGES`) et contrôlées par `satisfies Record<TranslatedLanguage, …>`. Une variante régionale sans fichier (`en-GB`, C-39) n'a pas d'entrée dans ces tables : elle s'ajoute à `SUPPORTED_LANGUAGES` et à `LanguageSelector`, et i18next lui sert les messages de sa langue de base.
6. `bundle-budget.mjs` : refuser `src/i18n/admin.ts` et `src/i18n/locales/admin/` dans le premier chargement.

## Critères d'acceptation

- [x] Aucune clé non traduite visible, même un instant, sur une page admin ou sur la page de connexion : le paquet admin est enregistré avant le premier rendu de ces chunks.
- [x] Les composants partagés (`Toaster`, `ConfirmDialog`, layouts, `RouteFallback`) trouvent leurs clés partout où ils sont rendus : toutes leurs clés sont dans le paquet public.
- [x] Une langue s'ajoute à un seul endroit par paquet ; le repli `en` fonctionne aussi pour les messages admin.
- [x] Le contenu des traductions est identique à `develop` (461 clés par langue, mêmes valeurs ; déplacement seulement).
- [x] Les messages admin ne sont plus dans le premier chargement, et le contrôle de budget échoue s'ils y reviennent.
- [x] Budget mesuré avant et après (Journal et PR) ; le budget de 140 kB n'est pas modifié.

## Tests à ajouter ou adapter

- `src/i18n/bundles.test.ts` : parité des clés en/fr par paquet ; aucune clé définie dans les deux paquets (ni clé d'un côté qui serait un espace de noms de l'autre) ; chaque clé citée par un fichier du premier chargement est dans le paquet public et le paquet public ne contient que celles-là ; pas de clé construite à l'exécution (`` `ns.${x}` ``) dans le premier chargement ; après `import('./admin')`, tous les messages des deux paquets sont présents dans les deux langues ; repli `en` d'une clé admin.
- `src/App.test.tsx` :
  - contrôle structurel sur le source d'`App.tsx` (`?raw`) : un seul appel `lazy(`, celui de `lazyWithAdminMessages`, qui attend `./i18n/admin` ; chaque import de `pages/admin/`, `pages/auth/` et d'`AdminLayout` passe par ce helper. Il couvre toutes les routes (vérifié par mutation : une route admin en `lazy` simple le fait échouer) ;
  - ordre de chargement : `./i18n/admin` est chargé avant le premier rendu de `LoginPage`, d'`AdminLayout` et d'une page admin. Le module simulé ne s'exécute qu'une fois par fichier : ce test prouve que le helper attend les messages, sur la première route rendue seulement, d'où le contrôle structurel.
  - Le mock global de `react-i18next` (`setup.ts`) ignore les ressources : ces tests suivent le chargement au lieu du texte rendu, et `bundles.test.ts` utilise la vraie instance i18next.
- `.github/scripts/bundle-budget.test.mjs` : un chunk préchargé qui contient les messages admin fait échouer le contrôle.

## Points d'attention

- Rebase d'E-10 : `locales/en.json` et `fr.json` n'existent plus. Les clés modifiées par E-10 vont dans le paquet que `bundles.test.ts` indique (par exemple `menus.bottleCount` et `menus.cocktailCount`, utilisées par `HomePage`, vont dans le paquet public ; `units.ml` et `units.abv` aussi si une page publique les utilise). Le `locales.test.ts` d'E-10 importe les anciens fichiers : il doit fusionner les deux paquets (ou réutiliser `flatten` et `BUNDLES` de `bundles.test.ts`).
- Les tâches qui ajoutent des clés (E-15, E-23, E-27, F-08, F-09) les ajoutent au paquet admin, sauf clé utilisée par le premier chargement : le test donne la liste exacte.
- Un nouveau chunk paresseux derrière `/login` ou `/admin` passe par `lazyWithAdminMessages` (E-18 et E-20 touchent aussi `App.tsx`).
- Le test « clés du premier chargement » lit le code source (imports statiques depuis `main.tsx`, chaînes en forme de clé) : une clé lue depuis les données ou construite à l'exécution dans le code public ne serait pas vue, d'où le test qui interdit les clés construites dans ce périmètre.

## Journal

- 2026-10-12 : tâche créée sur décision humaine (voir Décisions validées), après le dépassement de budget d'E-10.
- 2026-10-13 : faite dans la PR #133 (`feature/E-30-locales-public-admin-split`). 60 clés publiques et 401 clés admin par langue, contenu identique à `develop` (vérifié clé par clé). Premier chargement : 139,94 kB gzip avant, 131,80 kB après (−8,14 kB) ; le chunk `api` passe de 11,83 à 1,81 kB et un chunk `i18n` de 1,78 kB porte le paquet public. Le paquet admin part dans un chunk `admin` de 8,89 kB gzip, chargé en parallèle du premier chunk de `/login` ou `/admin`. Messages seuls (JSON minifié, gzip) : public 0,85 / 0,99 kB (en / fr), admin 4,79 / 5,48 kB. `frontend/AGENTS.md` décrit les deux paquets et la règle de rangement des clés. Aucune action requise.
- 2026-10-13 : relecture de la PR #133 : contrôle structurel des routes paresseuses ajouté dans `App.test.tsx` (le test d'ordre ne voyait que la première route rendue) ; tables de messages typées par `TRANSLATED_LANGUAGES`, `SUPPORTED_LANGUAGES` en dérive, pour que la variante `en-GB` de C-39 passe par le repli d'i18next (ligne ajoutée au Journal de C-39) ; `frontend/AGENTS.md` cite `LanguageSelector` pour l'ajout d'une langue. `docs/plan/tasks/C-39-english-uk-variant.md` ajouté à `touches`. Rebase sur `develop` (B-11, C-37, C-35).
