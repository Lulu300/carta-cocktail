# Plan d'action Carta Cocktail

Ce dossier contient le plan d'amélioration issu de la revue du 8 octobre 2026. Il sert de référence aux humains comme aux agents IA.

```
docs/
├── plan/
│   ├── README.md        ← ce guide (règles de travail)
│   ├── build.mjs        ← génère la page de suivi et répond aux questions « quoi faire ensuite ? »
│   ├── index.html       ← page de suivi générée (non versionnée)
│   └── tasks/           ← une tâche = un fichier Markdown (source de vérité)
└── review/2026-10-08/   ← rapports détaillés de la revue (contexte des tâches)
```

## Démarrage rapide

```bash
node docs/plan/build.mjs            # valide les tâches et génère docs/plan/index.html
open docs/plan/index.html           # macOS (xdg-open sous Linux)
node docs/plan/build.mjs --ready    # liste des tâches prêtes et lots parallélisables
node docs/plan/build.mjs --check    # validation seule (code de sortie ≠ 0 en cas d'erreur)
node docs/plan/build.mjs --json     # graphe complet en JSON (pour un agent coordinateur)
```

Le script n'a aucune dépendance : Node 20 ou plus suffit.

## Source de vérité

- **Les fichiers `tasks/*.md` font foi.** La page HTML se régénère à partir d'eux. Elle n'est pas versionnée (`.gitignore`), ce qui évite les conflits entre branches.
- Chaque fichier commence par un en-tête (frontmatter) lu par `build.mjs` :

| Champ | Valeurs | Rôle |
|---|---|---|
| `id` | `A-01`… | Lettre = phase, numéro = ordre dans la phase |
| `phase` | `A` à `F` | A Urgences, B Socle, C Fiabilité backend, D Infra & CI/CD, E Frontend, F Évolutions |
| `lane` | `backend`, `frontend`, `infra`, `ci`, `deps`, `docs` | Couloir de travail (voir parallélisme) |
| `criticite` | `critique`, `haute`, `moyenne`, `basse` | Gravité du problème traité |
| `effort` | `S` (< ½ j), `M` (1-2 j), `L` (> 2 j) | Estimation pour un agent + relecture |
| `status` | `todo`, `in-progress`, `review`, `done`, `blocked`, `dropped` | Voir cycle de vie |
| `owner` | `agent`, `human`, `mixed` | `human`/`mixed` : une partie demande une action manuelle (réglages GitHub, décision produit) |
| `depends_on` | liste d'`id` | Tâches à terminer avant de commencer |
| `touches` | liste de chemins ou dossiers (`dossier/`) | Fichiers modifiés. Sert à détecter les conflits entre tâches lancées en parallèle |
| `sources` | `"0X-rapport.md §section"` | Passages des rapports de revue qui justifient la tâche |
| `branch`, `pr` | texte | Renseignés par l'agent qui traite la tâche |

Le corps suit toujours les mêmes sections : **Contexte**, **Problème constaté**, **Ce qu'il faut faire**, **Critères d'acceptation** (cases à cocher), **Tests à ajouter ou adapter**, **Points d'attention**, **Journal**.

## Cycle de vie d'une tâche

```
todo ──► in-progress ──► review ──► done
  │            │
  └──► blocked ◄┘            (dropped : abandonnée, avec la raison dans le Journal)
```

- `in-progress` est **détecté automatiquement** : si une branche locale ou distante contient l'`id` de la tâche (ex. `fix/A-02-menu-sections-save`), `build.mjs` l'affiche « en cours ». Inutile de committer ce statut sur `develop`.
- L'agent passe la tâche à **`done`** dans le **dernier commit de sa PR**, avec `branch` et `pr` renseignés et une ligne dans le Journal. Le statut devient donc `done` sur `develop` au moment exact du merge. Si la PR est refusée, rien ne change sur `develop`.
- `blocked` : l'agent explique pourquoi dans le Journal et le signale dans sa PR ou à l'humain.

## Règles pour un agent qui prend une tâche

1. Lire `AGENTS.md` (racine, puis `backend/` ou `frontend/` selon la tâche), ce guide, puis le fichier de la tâche et ses `sources`.
2. Vérifier que toutes les tâches de `depends_on` sont `done` (`node docs/plan/build.mjs --ready`).
3. Créer **un worktree et une branche depuis `origin/develop`**, nommée `<type>/<ID>-<slug>` : `fix/` pour un bug, `feature/` pour un ajout, `chore/` pour l'outillage ou les dépendances, `docs/` pour la documentation. Exemple : `fix/A-02-menu-sections-save`.
4. Rester dans le périmètre : ne modifier que les fichiers listés dans `touches`, plus les tests associés. Si un autre fichier est indispensable, l'ajouter à `touches` et le noter dans le Journal.
5. Respecter la définition de terminé d'`AGENTS.md` : tests ajoutés, `npm test`, lint, `tsc`, couverture globale ≥ 60 % et couverture des lignes modifiées ≥ 80 %.
6. Cocher les critères d'acceptation dans le fichier de la tâche, passer `status: done`, renseigner `branch` et `pr`, ajouter une ligne datée au Journal.
7. Écrire le code, les commentaires et les messages de commit en anglais (voir « Coding Conventions » dans `AGENTS.md`), au format Conventional Commits (`fix:`, `feat:`, `chore(deps):`, `docs:`…). Ouvrir une PR vers `develop` dont le titre commence par l'`id` : `A-02: keep menu sections when saving a menu` (en anglais, comme le code et les commits).
8. Si une découverte change le plan (nouveau bug, tâche à découper), **ne pas élargir la PR** : créer un nouveau fichier de tâche (prochain numéro libre de la phase), avec `status: todo`, et le mentionner dans la PR.
9. **Notes de version.** Une tâche ne modifie ni `docs/releases/` ni `UPGRADING.md` (sauf les tâches de release, D-11 et D-12). Si la PR impose une action à l'utilisateur (nouvelle variable, port, migration manuelle…) ou un changement cassant, sa description contient une section « Required actions » en anglais (before / after upgrade, `breaking: true` le cas échéant, épinglage recommandé), et le Journal de la tâche une ligne « Notes de version » qui la résume. Au moment de la release, le coordinateur reprend ces sections dans `docs/releases/vX.Y.Z.md` et `UPGRADING.md`.

## Travailler en parallèle

### Ce qui permet le parallélisme

- **Une tâche = une branche = un worktree = une PR.** Chaque agent a son propre répertoire de travail, ses `node_modules`, sa base de test SQLite (le chemin est relatif au worktree). Les agents ne se marchent pas dessus pendant l'exécution.
- **Les conflits se jouent au merge.** Deux tâches peuvent tourner en même temps si elles sont prêtes et que leurs `touches` ne se recouvrent pas. `build.mjs --ready` calcule ces lots à partir du graphe de dépendances et des fichiers touchés.

### Ce qui doit rester séquentiel

| Zone | Raison | Règle |
|---|---|---|
| `package.json` / `package-lock.json` (couloir `deps`) | Les lockfiles fusionnent mal | Une seule tâche qui touche les dépendances d'un même paquet à la fois |
| `backend/prisma/schema.prisma` et `migrations/` | Les migrations sont ordonnées | Une seule tâche de schéma à la fois, migration régénérée après rebase |
| `backend/src/routes/` pendant C-02 et C-03 | Ces deux tâches modifient toutes les routes | Rien d'autre sur les routes tant qu'elles sont ouvertes |
| `backend/Dockerfile`, `docker-compose*.yml` | Petits fichiers modifiés par plusieurs tâches | Enchaîner, ou regrouper dans la même PR si c'est plus simple |

### Organisation recommandée

1. **Un coordinateur** (toi, ou une session Claude Code dédiée sur `develop`) lance `node docs/plan/build.mjs --ready`, choisit un lot de 3 ou 4 tâches de **couloirs différents** (ex. 1 backend + 1 frontend + 1 infra) et lance un agent par tâche.
2. **Chaque agent** travaille dans son worktree, par exemple :
   - Claude Code : un sous-agent avec `isolation: worktree`, ou `claude --worktree` dans un terminal ;
   - Orca : un worktree Orca par tâche, puis Claude lancé dedans ;
   - à la main : `git worktree add ../carta-wt/A-02 -b fix/A-02-menu-sections-save origin/develop`, puis `npm ci` dans `backend/` et `frontend/`.
3. **La relecture est le goulot d'étranglement**, pas les agents. Au-delà de 3 ou 4 PR ouvertes en même temps, on passe plus de temps à relire et à résoudre des conflits qu'on n'en gagne.
4. Après chaque merge, le coordinateur relance `--ready` : de nouvelles tâches se débloquent.
5. Si plusieurs agents lancent des serveurs de dev, changer les ports (`PORT=3011` pour le backend, `--port 5174` pour Vite) pour éviter les collisions.

### Prompt type pour lancer un agent

Le bouton « Copier le prompt » de la page de suivi produit ce texte, complété pour la tâche :

```
Tu travailles sur le projet Carta Cocktail. Prends en charge la tâche <ID> — <titre>.
1. Lis AGENTS.md, docs/plan/README.md (règles de travail), puis docs/plan/tasks/<fichier>.md et ses sources dans docs/review/2026-10-08/.
2. Travaille dans un worktree dédié, sur la branche <type>/<ID>-<slug> créée depuis origin/develop.
3. Reste dans le périmètre (champ touches). Ajoute les tests demandés.
4. Vérifie : npm test, lint et tsc dans les paquets modifiés ; couverture ≥ 60 % global et ≥ 80 % sur les lignes modifiées.
5. Coche les critères d'acceptation, passe status: done, renseigne branch et pr, ajoute une ligne au Journal.
6. Commits au format Conventional Commits. Ouvre une PR vers develop intitulée « <ID>: … ». Ne merge pas.
```

## Releases

Modèle fixé par D-11, appliqué par `.github/workflows/release.yml` (détails dans `README.md`, section « Release ») :

- **Pré-version** `vX.Y.Z-rc.N`, taguée sur `develop` : images `:X.Y.Z-rc.N` sans toucher `latest`, GitHub Release marquée pre-release.
- **Version finale** `vX.Y.Z`, taguée sur `main` après le merge `develop` → `main` : images `:X.Y.Z` et `latest`, release normale.
- **Notes d'abord** : `docs/releases/vX.Y.Z.md` (copie de `docs/releases/TEMPLATE.md`) et la section de `UPGRADING.md` sont mergées sur `develop` avant le premier tag. Une pré-version utilise le fichier de sa version cible, sauf si `docs/releases/vX.Y.Z-rc.N.md` existe. Le coordinateur les rédige à partir des sections « Required actions » des PR et des lignes « Notes de version » des Journaux (règle 9).
- **Pousser la branche avant le tag** : le job `verify` vérifie que le commit du tag est atteignable depuis `origin/main` (version finale) ou `origin/develop` (pré-version), et que le fichier de notes existe et a un front matter valide. Sinon il échoue avant tout push d'image.
- Un tag refusé par `verify` n'a rien publié : le supprimer (local et distant), corriger, puis le reposer.
- Un tag qui a publié une image n'est jamais déplacé ni repoussé : en cas d'échec après le push d'une image, corriger puis taguer la pré-version suivante (`-rc.N+1`) pour une pré-version, ou la version suivante (ex. `v1.5.1`) pour une version finale.
- Chaque tag demande l'accord de l'humain. Première release avec ce modèle : D-12 (`v1.5.0-rc.1` puis `v1.5.0`).

## Décisions validées

Décisions prises par l'humain le 2026-10-08, complétées le 2026-10-09 (lignes datées). Chaque tâche concernée les reprend en tête, dans une section « Décisions validées ». Un agent ne les remet pas en cause sans le signaler dans sa PR.

| Sujet | Décision | Tâches |
|---|---|---|
| Mot de passe admin au démarrage | Le seed crée l'admin seulement s'il n'existe pas ; réinitialisation uniquement avec `ADMIN_RESET_PASSWORD=true` | A-04 |
| Secrets obligatoires | `JWT_SECRET` et `ADMIN_PASSWORD` contrôlés partout, développement compris | A-04 |
| Photos déjà en production | L'humain les récupère avec `docker cp` avant de déployer le correctif | A-01 |
| Passage aux migrations | Bascule automatique avec garde-fous (sauvegarde, baseline `0_init` si la base correspond, refus sinon) ; vérification humaine sur une copie avant le premier déploiement | C-01 |
| Seuil de couverture | Cliquet : seuil fixé au chiffre mesuré s'il est sous 60 %, jamais abaissé ensuite, remonté jusqu'à 60 % | B-02, B-10 |
| Navigateurs supportés | Cible par défaut de Vite 8 : Safari et iOS ≥ 16.4 | B-06 |
| TypeScript | Étape TypeScript 6.0 après Prisma 7 ; TypeScript 7 quand typescript-eslint le supportera | F-07 |
| Conventions Git | Conventional Commits pour les commits, titres de PR `ID: titre`, `.mailmap` vers `Ludwig SIMON <ludwig@simonl.fr>` | D-07 |
| Suppression d'un élément utilisé | Bloquée par défaut avec la liste des impacts ; suppression forcée en cascade possible après confirmation explicite des risques ; pas de forçage pour les unités | C-07, E-04, E-05, E-15 |
| Nom de cocktail | Pas unique ; doublons signalés à l'import sans tenir compte de la casse | C-07, C-09 |
| Bouteilles préférées | Toutes les bouteilles de la catégorie comptent ; avertissement quand aucune préférée n'est disponible | C-08, E-06 |
| Disponibilité publique | Disponible = interrupteur manuel activé **et** stock suffisant | C-08, E-11 |
| Éditeurs de menus | Enregistrement immédiat de la composition, bouton « Enregistrer » seulement pour les infos du menu | E-07 |
| Lien « Connexion » public | Déplacé dans un pied de page discret | E-11 |
| Exporter / Imprimer une recette | Conservés pour tous, en style secondaire sous la recette | E-11 |
| Cartes de bouteilles (2026-10-09) | `isApero` / `isDigestif` = « disponible pour les cartes de ce type ». Les cartes système « Apéritifs » et « Digestifs » restent non supprimables (renommables, dépubliables) et contiennent automatiquement toutes les bouteilles cochées, sauf celles que l'admin en a retirées. L'utilisateur peut créer ses propres cartes `APEROS` ou `DIGESTIFS`, supprimables, composées à la main parmi les bouteilles cochées. Décocher retire la bouteille de toutes les cartes du type. Pas de fusion des deux types. Le type d'une carte non système ne change plus après sa création | C-06, E-07, F-08 |
| Retrait d'une carte système (2026-10-09) | Liste d'exclusions : retirer une bouteille d'une carte système l'exclut de cette carte seulement ; elle reste cochée, présente dans l'autre carte système et disponible pour les cartes personnelles. La synchro ne la remet jamais, même après décochage puis recochage. L'éditeur liste les bouteilles retirées et permet de les remettre. Supprimer la bouteille ou la carte supprime l'exclusion | C-06, E-07, F-08 |
| Bouteilles vides (2026-10-09) | Une bouteille cochée qui devient vide reste dans ses cartes (place, section, état masqué) et n'est pas affichée sur la carte publique. L'admin la retire à la main si elle ne revient pas en stock (exclusion sur une carte système, retrait simple sur une carte personnelle) | C-06, E-07, F-08 |
| Numéros de version (2026-10-09) | v1.5.0 pour la phase A, taguée après le merge de D-11 ; versions intermédiaires pendant la refonte, v2.0.0 à la fin du plan. Les changements cassants (D-01, D-02, D-03, et C-01 qui peut refuser de démarrer) sortent donc en 1.x, avec `breaking: true`, les actions obligatoires dans les notes et `UPGRADING.md`, et l'épinglage recommandé (`:<version>` avant D-05, `:<majeure>.<mineure>` ensuite) | D-11, D-12, D-05, D-01, D-02, D-03, C-01 |
| Releases (2026-10-09) | Travail sur `develop`. Pré-versions `vX.Y.Z-rc.N` **uniquement sur `develop`** : images versionnées sans `latest`, GitHub Release marquée pre-release. Versions finales taguées sur `main`, publiées de temps en temps. Chaque release a un résumé, un changelog détaillé et les actions obligatoires ; notes en anglais. Pas de tag jetable publié : le pipeline se teste avec `v1.5.0-rc.1` sur `develop` puis `v1.5.0` sur `main` (accord humain donné pour cette séquence). La règle de branche se vérifie avec un tag posé sur une branche jetable, qui doit échouer avant tout push d'image et qu'on supprime ensuite | D-11, D-12, D-05 |
| Rédaction des notes (2026-10-09) | Les tâches ne touchent ni `docs/releases/` ni `UPGRADING.md`. Une PR qui impose une action ou un changement cassant a une section « Required actions » dans sa description et une ligne « Notes de version » dans son Journal ; le coordinateur les reprend au moment de la release (règle 9 ci-dessus) | D-11, D-12, C-01, C-06, D-01, D-02, D-03, F-09 |
| Guide de mise à jour (2026-10-09) | Enchaînement des actions obligatoires de toutes les versions sautées, dans `UPGRADING.md` et si possible dans l'instance | D-11, F-09 |

## Ajouter ou modifier une tâche

- Copier un fichier existant, changer l'`id` (prochain numéro libre de la phase) et vider le Journal.
- Lancer `node docs/plan/build.mjs --check` : le script refuse un `id` en double, une dépendance inconnue, un cycle ou une valeur hors liste.
- Une tâche trop grosse (effort `L` qui dépasse 2-3 jours) se découpe en plusieurs fichiers liés par `depends_on`.
