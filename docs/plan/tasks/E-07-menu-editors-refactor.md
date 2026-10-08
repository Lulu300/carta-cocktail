---
id: E-07
title: "Éditeurs de menus : code commun, mises à jour fiables, un seul modèle de sauvegarde"
phase: E
lane: frontend
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [A-02, C-13, E-02, E-03]
touches: [frontend/src/pages/admin/MenuEditPage.tsx, frontend/src/pages/admin/MenuBottleEditPage.tsx, frontend/src/components/admin/menus/, frontend/src/services/api.ts, frontend/src/i18n/locales/]
sources: ["05-frontend-archi.md §4.3", "05-frontend-archi.md §H5"]
branch:
pr:
---

## Décisions validées (2026-10-08)

- **Modèle de sauvegarde** : enregistrement immédiat pour la composition (ajout, retrait, ordre, sections, visibilité), avec mise à jour optimiste et retour arrière en cas d'erreur. Bouton « Enregistrer » seulement pour le bloc d'infos (nom, slug, description, public).
- **Bouteilles vides (2026-10-09)** : une bouteille cochée qui devient vide reste dans ses cartes, à sa place, avec sa section et son état masqué (C-06). L'éditeur la liste donc : la marquer d'un badge « vide ». Les cartes personnelles de bouteilles sont traitées par F-08.

## Contexte

L'admin compose ses cartes dans deux éditeurs : un pour les cocktails, un pour les bouteilles (apéritifs, digestifs). Ils partagent environ 40 % de code recopié, mais pas la même logique de sauvegarde : dans l'un « Annuler » défait le travail, dans l'autre tout est déjà enregistré. Deux clics rapides perdent une modification, et déplacer un groupe de bouteilles envoie une requête par bouteille. Aucun des deux n'a de test.

## Problème constaté

- **Modèles de sauvegarde incohérents.** `MenuEditPage.tsx:136-151` enregistre les cocktails au clic sur « Enregistrer », mais les sections immédiatement (`:83-112`). `MenuBottleEditPage.tsx` enregistre tout immédiatement (`:109-196`) sauf nom, description et visibilité (`:198-202`).
- **Mises à jour perdues.** `MenuBottleEditPage.tsx:112, 119, 193` : `setMenuBottlesList(menuBottlesList.map(…))` après un `await`, sur une valeur capturée avant l'appel. Masquer le groupe A puis le groupe B rapidement perd la première modification locale.
- **Déplacements coûteux.** `moveGroupUp` / `moveGroupDown` (`MenuBottleEditPage.tsx:124-161`) sont copiés à 95 % et envoient un `PUT` par bouteille de la section, sans transaction ni gestion d'erreur.
- **Requêtes inutiles.** `deleteSection` (`MenuBottleEditPage.tsx:188-192`) remet `menuSectionId` à `null` bouteille par bouteille, alors que le schéma Prisma fait déjà `onDelete: SetNull` (`backend/prisma/schema.prisma:152, 166`). Point non relevé par la revue.
- **Duplication.** Gestion des sections (`MenuEditPage.tsx:26-29, 83-112, 205-244, 370-388` contre `MenuBottleEditPage.tsx:62-65, 163-196, 297-336, 403-421`), formulaire d'infos, boutons ▲/▼, sélecteur de section, regroupement par section (`MenuEditPage.tsx:156-166` contre `MenuBottleEditPage.tsx:81-94`).
- **Petits bugs.** `MenuEditPage.tsx:33-50` : un 404 laisse « Chargement… » indéfiniment. `MenuBottleEditPage.tsx:257` : tout menu non `APEROS` est titré « digestifs ». `:241` : `{group.alcoholPercentage && …}` affiche « 0 ». `:24` : `mb.bottle!`. `:30` : nom de catégorie non localisé. `:206` : menus système détectés par slug en dur.
- **Textes en dur** : `MenuEditPage.tsx:105, 208, 211, 216, 263, 275, 281, 322, 374, 378, 384` et `MenuBottleEditPage.tsx:185, 235, 242, 257, 300, 303, 308, 341, 347, 353-354, 360, 366, 407, 411, 417`.
- **Sections non réordonnables** : `menuSections.reorder` existe dans `api.ts:229-233` mais n'est appelé nulle part.

## Ce qu'il faut faire

### 0. Modèle de sauvegarde (validé le 2026-10-08)

Modèle retenu :

- **Enregistrement immédiat** pour tout ce qui touche la composition (ajout, retrait, visibilité, section, ordre, sections), avec mise à jour optimiste et retour arrière en cas d'erreur.
- **Bouton « Enregistrer »** seulement pour le bloc d'infos (nom, slug, description, public), qui contient du texte libre.
- Le bouton « Annuler » du bas disparaît au profit de « Retour à la liste ».

L'option « brouillon local + un seul Enregistrer » a été écartée.

### 1. Code commun dans `components/admin/menus/`

| Élément | API |
|---|---|
| `groupBySection.ts` | `groupBySection<T extends { menuSectionId: number \| null }>(items: T[], sections: MenuSection[]): { section: MenuSection \| null; items: T[] }[]` (fonction pure, sections vides incluses) |
| `useMenuSections.ts` | `useMenuSections(menuId: number): { create(name), rename(id, name), remove(id), reorder(ids) }`, mutations qui invalident `qk.menu(menuId)` et affichent un toast en cas d'erreur |
| `MenuSectionsManager.tsx` | `sections`, `itemLabel: 'cocktails' \| 'bottles'` (pour le texte de confirmation), utilise `useMenuSections`, `Modal` pour la création, `useConfirm` pour la suppression, ▲/▼ pour réordonner |
| `MenuInfoForm.tsx` | `menu`, `fields: ('name' \| 'slug' \| 'description' \| 'isPublic')[]`, `lockedFields?`, `onSave(values)`, `isSaving` |
| `ReorderButtons.tsx` | `onUp`, `onDown`, `disableUp`, `disableDown`, `label` (nom de l'élément, pour les `aria-label`) |
| `SectionSelect.tsx` | `value: number \| null`, `sections`, `onChange` |
| `moveItem.ts` | `moveItem<T>(list: T[], from: number, to: number): T[]` (remplace les 4 fonctions de déplacement) |

Si E-05 a créé `isSystemMenu()` dans ce dossier, l'utiliser ; sinon le créer ici.

### 2. `MenuEditPage` (cocktails)

- Lecture : `useQuery(qk.menu(id))`. Erreur ou 404 : état d'erreur avec lien retour.
- Toute modification de la composition appelle une mutation `useSaveMenuCocktails(menuId)` qui envoie `menus.update(id, { cocktails })` avec la liste complète (`cocktailId`, `position`, `isHidden`, `menuSectionId`). A-02 rend ce `PUT` transactionnel et conserve `menuSectionId`.
- `onMutate` : `cancelQueries`, sauvegarde de l'ancien cache, `setQueryData` avec la nouvelle liste. `onError` : restauration et `toast.error`. `onSettled` : `invalidateQueries`.
- Mutations successives sérialisées (`scope: { id: 'menu-' + id }` de TanStack v5) pour que deux clics rapides s'appliquent dans l'ordre.

### 3. `MenuBottleEditPage` (bouteilles)

- Regroupement via `bottleGroupKey` de `utils/bottleGrouping.ts` (créé par E-05) au lieu de la copie locale `:19-48`. Si E-05 n'est pas encore fusionnée, garder la fonction locale (déplacée dans `components/admin/menus/`) avec un `TODO E-05`.
- Visibilité et section d'un groupe : mises à jour optimistes du cache, puis les `PUT` du groupe.
- Ordre : un seul appel `menuBottles.reorder(menuId, orderedIds)` vers l'endpoint de C-13. Ajouter cette méthode dans `api.ts` (signature exacte selon C-13).
- Suppression de section : un seul `menuSections.delete`, puis invalidation. Plus de boucle de `PUT`.
- Titre selon `menu.type` avec un cas par type, `alcoholPercentage != null`, catégorie localisée, pas de `!`.
- Badge « vide » sur les bouteilles à 0 % (clé i18n), puisqu'elles restent dans la carte.

### 4. Textes

Les composants communs utilisent des clés i18n (`menus.sections.*`). Les textes en dur des deux pages sont remplacés au passage ; E-10 n'aura plus rien à faire sur ces fichiers.

## Critères d'acceptation

- [ ] Modèle de sauvegarde appliqué : enregistrement immédiat, bouton uniquement pour le bloc d'infos.
- [ ] Ranger des cocktails en sections, quitter la page, revenir : les sections sont conservées.
- [ ] Masquer deux groupes de bouteilles en moins d'une seconde : les deux restent masqués après rechargement.
- [ ] Déplacer un groupe de bouteilles : une seule requête réseau.
- [ ] Supprimer une section : une seule requête réseau.
- [ ] Une erreur serveur sur une modification remet l'écran dans son état précédent et affiche un toast.
- [ ] Un id de menu inexistant affiche une erreur, pas « Chargement… » sans fin.
- [ ] Les sections se réordonnent depuis l'UI.
- [ ] Les deux pages font chacune moins de 200 lignes ; aucun texte en dur ; aucun `confirm(`.
- [ ] Couverture ≥ 80 % sur les lignes modifiées (0 % aujourd'hui).

## Tests à ajouter ou adapter

- `groupBySection.test.ts`, `moveItem.test.ts` : cas limites (premier, dernier, section vide, `menuSectionId` d'une section supprimée).
- Nouveau `MenuEditPage.test.tsx` : non-régression du bug C1 (le corps envoyé à `menus.update` contient `menuSectionId`) ; ajout et retrait de cocktail ; échec → retour arrière et `role="alert"` ; 404 → état d'erreur.
- Nouveau `MenuBottleEditPage.test.tsx` : deux bascules de visibilité rapides (résoudre les promesses dans l'ordre inverse) → les deux groupes masqués ; déplacement → un appel `reorder` avec les ids dans le bon ordre ; suppression de section → un seul appel.
- `MenuSectionsManager.test.tsx` : création, renommage, suppression confirmée, réordonnancement.

## Points d'attention

- Dépend du contrat de C-13 (`POST /menu-bottles/menu/:id/reorder` et sections). Lire la PR de C-13 avant d'écrire `menuBottles.reorder`.
- La carte publique trie les groupes de bouteilles par nom (`MenuPublicPage.tsx:44`) et ignore l'ordre défini ici, alors que le backend renvoie bien les bouteilles par `position` (`backend/src/routes/public.ts:61`). Réordonner dans l'admin n'a donc aucun effet visible pour l'invité. Correction prévue dans E-11.
- E-14 retire le code mort de `api.ts` : garder `menuSections.reorder`, désormais utilisé.
- `isDefaultMenu` (`MenuBottleEditPage.tsx:206`) bloque le renommage côté UI ; A-02 doit le bloquer côté serveur. Garder les deux.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
- 2026-10-09 : décision « bouteilles vides » reprise ; badge « vide » ajouté à l'étape 3.
