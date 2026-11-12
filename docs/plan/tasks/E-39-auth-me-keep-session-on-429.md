---
id: E-39
title: "Vérification de session au chargement : ne déconnecter que sur un 401"
phase: E
lane: frontend
criticite: moyenne
effort: S
status: review
owner: agent
depends_on: [C-47]
touches: [frontend/src/contexts/AuthContext.tsx, frontend/src/contexts/AuthContext.test.tsx, frontend/src/App.tsx, frontend/src/App.test.tsx, frontend/src/i18n/locales/public/, frontend/src/pages/public/MenuPublicPage.test.tsx, frontend/AGENTS.md, docs/plan/tasks/E-38-admin-error-boundary-focus.md, frontend/src/components/layout/BackHomeLink.tsx, frontend/src/components/layout/RouteErrorBoundary.tsx]
sources: []
branch: fix/E-39-auth-me-keep-session-on-429
pr: #175
---

## Contexte

Relecture des notes de v1.13.0 (PR #174, dernier commentaire du relecteur, « User-visible gaps » n° 1, gravité moyenne). Décision de l'humain : « Code fix before the rc » — « Frontend task (author + reviewer): /auth/me ends the session only on a 401, other errors keep the token. The notes then describe the new behaviour. »

Après la relecture de #175 (« The screen has no way out »), seconde décision de l'humain : « Add links in E-39 now » — « Before the merge: 'Back to home' (and/or 'Sign in again', which clears the token) on this screen, with tests; the reviewer re-checks. »

Au montage, `AuthProvider` (`frontend/src/contexts/AuthContext.tsx`) appelle `GET /api/auth/me` quand un token est stocké, sur toutes les pages, publiques comprises. `services/api.ts` gère déjà le 401 : `send()` appelle `handleUnauthorized`, qui retire le token et lance le gestionnaire enregistré par `setUnauthorizedHandler` (`logout`), sauf si le token a changé depuis l'envoi de la requête.

## Problème constaté

Vérifié sur `develop` (589e579) :

- `AuthContext.tsx:39` : `.catch(logout)` termine la session sur **toute** erreur de `/auth/me`. Un 429 du limiteur de C-47 (600 requêtes par minute et par adresse), un 5xx ou une erreur réseau retire le token et `ProtectedRoute` envoie l'admin sur `/login`, où la connexion répond aussi 429 jusqu'à la fin de la fenêtre. Sur les installations où tous les clients partagent une adresse (Docker rootless, Podman, Docker Desktop, `docker-proxy` IPv6), le trafic public consomme le quota de l'admin.
- Double déconnexion sur un 401 : `handleUnauthorized` appelle `logout`, puis `.catch(logout)` le rappelle. Sans effet visible tant que les deux s'accordent, mais `.catch(logout)` ignore la garde « token remplacé entre-temps » : un 401 tardif pour l'ancien token déconnecte une session ouverte pendant la vérification.

## Ce qu'il faut faire

1. Sur une erreur de `/auth/me` : laisser le 401 au chemin `handleUnauthorized` (pas de second `logout`) ; pour toute autre erreur, garder le token et exposer l'erreur (`sessionError`) avec une relance (`retrySession`).
2. `ProtectedRoute` : avec un `sessionError` et sans utilisateur, ni redirection vers `/login` ni page admin vide, mais un écran traduit avec le message du backend, un bouton « Réessayer », un bouton « Se reconnecter » (termine la session locale, puis `/login`) et le lien « Retour à l'accueil » de `RouteErrorBoundary`, partagé sans copie.
3. Tests : 401 → déconnexion ; 429, 500 et erreur réseau → token conservé et écran décrit.

## Critères d'acceptation

- [x] Un 401 de `/auth/me` au chargement termine la session (une seule fois, par `handleUnauthorized`) ; un 401 tardif pour un token remplacé ne déconnecte pas la nouvelle session.
- [x] Un 429, un 500 ou une erreur réseau garde le token (`localStorage` et état), sans chargement infini.
- [x] Sur une page admin, l'admin voit un écran « Votre session n'a pas pu être vérifiée » avec le message du backend (ou « Vérifiez votre connexion puis réessayez. » sans réponse HTTP) et « Réessayer » ; la relance rouvre la page si la vérification réussit, renvoie vers `/login` sur un 401.
- [x] L'écran a deux sorties : « Se reconnecter » efface le token et l'erreur puis ouvre `/login`, qui ramène ensuite à la page demandée ; « Retour à l'accueil » ouvre `/` sans toucher à la session. Le lien est le même composant que celui de `RouteErrorBoundary` (`BackHomeLink`).
- [x] Textes en anglais et en français, dans le paquet public (l'écran est dans `App.tsx`, premier chargement) ; `bundles.test.ts` vert.

## Tests à ajouter ou adapter

- `contexts/AuthContext.test.tsx` : 401 → déconnexion et pas de `sessionError` ; 401 tardif pour l'ancien token après une connexion → nouvelle session gardée ; 429, 500, erreur réseau → token gardé et `sessionError` ; relance réussie → session rétablie ; relance avec 401 → déconnexion ; relance après retrait du token par un autre onglet → déconnexion sans requête.
- `App.test.tsx` : écran de session non vérifiée (message du 429, pas de `/login`, pas de layout admin, axe, « Réessayer » appelle `retrySession`) ; erreur réseau → indication de connexion, pas le texte anglais de `fetch` ; utilisateur connecté après un échec → layout admin ; « Se reconnecter » appelle `logout` puis ouvre `/login` avec la page demandée ; « Retour à l'accueil » ouvre `/` sans `logout` ni relance.
- `pages/public/MenuPublicPage.test.tsx` : le mock de `useAuth` reçoit les deux nouveaux champs (type `AuthContextType`).

## Points d'attention

- L'écran passe `role="alert"` à tout l'`EmptyState`, bouton compris, comme `PublicErrorState` et `RouteErrorBoundary`. E-38 (qui touche déjà `App.tsx`) doit l'aligner sur la règle « alerte sur le titre seulement ».
- `RouteErrorBoundary.tsx` utilise maintenant `BackHomeLink` : E-38, qui le modifie, part de ce composant.
- Le message affiché est celui de l'`ApiError`. Une réponse sans corps JSON (502 de nginx quand le backend est arrêté) donne `HTTP 502`, comme sur la page de connexion (`getLoginErrorMessage`).
- Pages publiques : l'en-tête et le pied de page sont ceux d'un invité pour ce chargement (ils suivent `user`), mais les requêtes suivent le token, toujours stocké et envoyé : l'`optionalAuth` du backend les traite comme celles de l'admin, donc l'aperçu d'une carte non publiée ou la page d'un cocktail masqué s'ouvrent encore (déjà le cas pendant la vérification).

## Journal

- 2026-11-12 : tâche créée et traitée. Faits vérifiés sur `develop` (589e579) : `.catch(logout)` à `AuthContext.tsx:39`, double `logout` sur un 401 (gestionnaire puis `catch`), `ProtectedRoute` redirige dès que `user` est nul. Correctif : le `catch` ne fait plus rien sur un 401 (déjà traité par `handleUnauthorized`) et garde l'erreur sinon ; `ProtectedRoute` affiche `SessionCheckError` (`App.tsx`) ; nouvelle clé `auth.sessionCheckFailed` dans `locales/public/` (en, fr). `MenuPublicPage.test.tsx` ajouté à `touches` : son mock de `useAuth` est typé par `AuthContextType`. `frontend/AGENTS.md` (« Auth Flow ») décrit le nouveau comportement.
- 2026-11-12 : ce que voit l'admin sur un 429 au chargement :
  - page admin (ouverture ou rechargement) : « Chargement... », puis un écran plein « ⚠️ Votre session n'a pas pu être vérifiée », le message du backend « Trop de requêtes : réessayez dans quelques minutes » (« Too many requests: try again in a few minutes » en anglais), un bouton « Réessayer », un bouton « Se reconnecter » et un lien « Retour à l'accueil ». Pas de passage par `/login`, le token reste. « Réessayer » relance la vérification : la page admin demandée s'ouvre si la fenêtre est passée, le même écran revient sinon. Un 500 donne le même écran avec le message du serveur, une erreur réseau avec « Vérifiez votre connexion puis réessayez. ». « Se reconnecter » termine la session locale (token effacé) et ouvre `/login` ; « Retour à l'accueil » ouvre la carte publique, token gardé.
  - page publique : l'en-tête et le pied de page d'invité pour ce chargement (pas de lien « Tableau de bord » dans l'en-tête, lien « Connexion » dans le pied de page), sans stock ni notes ; le contenu suit toujours le token (aperçu d'une carte non publiée possible), et l'erreur de la carte avec « Réessayer » si ses propres requêtes reçoivent aussi le 429. Le token reste : un rechargement ou l'ouverture de `/admin` après la fenêtre retrouve la session sans se reconnecter.
- 2026-11-12 : Notes de version : aucune action requise. Un 429 (ou une erreur serveur ou réseau) pendant la vérification de session au chargement ne déconnecte plus l'admin : sur une page admin, il voit « Your session could not be checked » avec le message du serveur (ou « Check your connection and try again. » après une erreur réseau), un bouton « Retry », un bouton « Sign in again » (efface la session et ouvre la connexion) et un lien « Back to home », et reste connecté ; sur une page publique, il voit l'en-tête et le pied de page d'invité pour ce chargement, et reste connecté ; seul un 401 (session expirée ou révoquée) renvoie vers la connexion. Remplace la ligne proposée par le relecteur (« opening or reloading a page signs the admin out »).
- 2026-11-12 : PR #175 ouverte vers `develop`, `status: review`.
- 2026-11-12 : relecture de #175 approuvée. Précisions reprises : « en-tête et pied de page d'invité » au lieu de « vue invité » (le contenu suit le token), ligne « Notes de version » complétée (message après une erreur réseau, pages publiques). Ligne ajoutée au Journal d'E-38 (ajouté à `touches`) pour qu'elle aligne `SessionCheckError`. Point « l'écran n'a pas de sortie » transmis à l'humain.
- 2026-11-12 : décision de l'humain sur « l'écran n'a pas de sortie » : « Add links in E-39 now » — « Before the merge: 'Back to home' (and/or 'Sign in again', which clears the token) on this screen, with tests; the reviewer re-checks. » Ajouts : « Se reconnecter » (`logout`, puis la redirection de `ProtectedRoute` vers `/login` avec la page demandée) et « Retour à l'accueil » ; le lien de `RouteErrorBoundary` est extrait dans `components/layout/BackHomeLink.tsx` (ajouté à `touches` avec `RouteErrorBoundary.tsx`) ; nouvelle clé `auth.signInAgain` (en, fr) dans le paquet public. Sondes : retirer l'un ou l'autre bouton ou lien, ou brancher « Se reconnecter » sur la relance, fait échouer un test. Premier chargement public : 132,95 kB gzip sur 140. Ligne « Notes de version » mise à jour.
