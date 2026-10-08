---
id: A-09
title: "Bugs visibles de l'admin (sélection filtrée, pénuries, doublons, clés React)"
phase: A
lane: frontend
criticite: haute
effort: S
status: todo
owner: agent
depends_on: []
touches: [frontend/src/pages/admin/CocktailsPage.tsx, frontend/src/pages/admin/ShortagesPage.tsx, frontend/src/pages/admin/BottlesPage.tsx, frontend/src/pages/admin/CocktailFormPage.tsx, frontend/src/i18n/locales/en.json, frontend/src/i18n/locales/fr.json]
sources: ["05-frontend-archi.md §H3", "05-frontend-archi.md §H6", "05-frontend-archi.md §H7", "05-frontend-archi.md §M1", "05-frontend-archi.md §H2"]
branch:
pr:
---

## Contexte

Cinq bugs visibles de l'admin, chacun corrigeable localement. Ils affichent une information fausse (« aucune pénurie » pendant le chargement ou après une erreur), exportent plus que demandé, créent des bouteilles sans nom ou des cocktails en double. On les corrige ici sans attendre la migration vers TanStack Query (E-02) ni la refonte des formulaires (E-06).

## Problème constaté

1. **« Tout sélectionner » ignore les filtres** : `frontend/src/pages/admin/CocktailsPage.tsx:172-178` coche selon `items.length` et sélectionne `items.map(...)`, c'est-à-dire tout le catalogue, alors que la liste affichée est `filteredItems` (l.45-54). Avec une recherche « rhum », l'export ZIP (l.93-106) contient tous les cocktails.
2. **Pénuries** : `frontend/src/pages/admin/ShortagesPage.tsx:11-13` : état initial `[]`, `api.list().then(setItems)` sans `catch`. Pendant le chargement et après une erreur, la page affiche le bandeau vert `shortages.noShortages` (l.18-21). À la l.46, la division par `item.requiredPercent` donne `NaN` ou `Infinity` si ce pourcentage vaut 0.
3. **« Enregistrer et dupliquer » sans validation** : `frontend/src/pages/admin/BottlesPage.tsx:484` : bouton `type="button"` qui appelle `handleSubmit(e as unknown as React.FormEvent, true)`. La validation HTML (`required` sur le nom, l.425) est contournée et une bouteille sans nom part au backend. `openCreate` (l.131) met `categoryId: cats[0]?.id || 0` : si les catégories ne sont pas chargées, ou s'il n'y en a aucune, la requête part avec `categoryId: 0`. Le bouton « Ajouter » (l.302) n'est jamais désactivé.
4. **Clé React manquante** : `BottlesPage.tsx:232-263` : `renderGroupRow` renvoie un fragment `<>…</>` sans clé (la `key` est sur le `<tr>` interne, l.237), utilisé dans `paginatedGroups.map` (l.354-355). React émet un avertissement et réconcilie mal au dépliage d'un groupe. Variable morte `singles` (l.27 et l.40).
5. **Cocktails en double** (cas grave signalé dans H2) : `frontend/src/pages/admin/CocktailFormPage.tsx:135-169` : aucun état d'envoi, le bouton (l.372) reste actif ; un double-clic crée deux cocktails. Si `create` réussit et que `uploadImage` (l.163-165) échoue, l'utilisateur reste sur `/admin/cocktails/new` et un nouveau clic crée un doublon. Pas de `catch`, aucun message.

## Ce qu'il faut faire

1. **CocktailsPage**
   - `const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((i) => selectedIds.has(i.id));`
   - La case est cochée si `allFilteredSelected`. Cocher ajoute les ids de `filteredItems` à la sélection ; décocher les retire.
2. **ShortagesPage**
   - États `isLoading` (vrai au départ) et `error`. Pendant le chargement : `t('common.loading')`. En erreur : bandeau rouge `t('common.error')` et bouton `t('common.retry')` qui relance le chargement. Le bandeau vert seulement si le chargement est terminé, sans erreur, avec une liste vide.
   - Barre : `item.requiredPercent > 0 ? Math.min(100, (item.totalPercent / item.requiredPercent) * 100) : 100`.
3. **BottlesPage**
   - Deux boutons `type="submit"`. Le bouton « dupliquer » pose une intention dans une ref avant la soumission : `onClick={() => { submitIntent.current = 'duplicate'; }}`. `handleSubmit` lit la ref puis la remet à `'save'`. Le navigateur applique `required` dans les deux cas. Supprimer le cast `as unknown as`.
   - Désactiver le bouton « Ajouter » tant que `cats.length === 0`, avec un `title` explicatif (nouvelle clé `bottles.noCategoryHint`).
   - `renderGroupRow` : `<Fragment key={group.key}>`. Supprimer `singles`.
4. **CocktailFormPage**
   - État `isSubmitting` : ignorer une soumission si une autre est en cours ; bouton désactivé pendant l'envoi.
   - `try/catch` autour de l'envoi, avec un message d'erreur affiché dans la page (message du serveur, sinon `t('common.error')`).
   - Après un `create` réussi, si `uploadImage` échoue : afficher l'erreur et ``navigate(`/admin/cocktails/${cocktail.id}`, { replace: true })``, pour que le clic suivant fasse un `update` et non un second `create`.
5. Clés i18n ajoutées en anglais et en français : `common.retry`, `bottles.noCategoryHint`.

Hors périmètre : `key={idx}` des lignes d'ingrédients et d'instructions (`CocktailFormPage.tsx:266,359`) et validation des lignes (E-06) ; toasts (E-04) ; TanStack Query (E-02) ; `try/catch` et `isSubmitting` des autres pages (E-05).

## Critères d'acceptation

- [ ] Recherche active puis « Tout sélectionner » : seuls les cocktails filtrés sont sélectionnés et exportés.
- [ ] Page Pénuries : jamais de bandeau vert pendant le chargement ni après une erreur ; en cas d'échec, un message et un bouton de relance s'affichent.
- [ ] Pas de `NaN` ni d'`Infinity` dans le style quand `requiredPercent` vaut 0.
- [ ] « Enregistrer et dupliquer » avec un nom vide : rien n'est envoyé, le navigateur signale le champ.
- [ ] Bouton « Ajouter » désactivé tant qu'aucune catégorie n'est chargée.
- [ ] Plus d'avertissement « unique "key" » dans la console sur la page Bouteilles.
- [ ] Double-clic sur Enregistrer d'un nouveau cocktail : un seul cocktail créé.
- [ ] Échec de l'upload après création : message affiché, URL en mode édition, un nouveau clic ne crée pas de doublon.

## Tests à ajouter ou adapter

- `frontend/src/pages/admin/CocktailsPage.test.tsx` : trois cocktails, une recherche qui n'en garde qu'un, mode sélection, clic sur « Tout sélectionner », export : `exportCocktailsAsZip` reçoit un seul id.
- `frontend/src/pages/admin/ShortagesPage.test.tsx` :
  - `list` en promesse jamais résolue : `common.loading` affiché, `shortages.noShortages` absent ;
  - `list` rejetée : `common.error` affiché, `shortages.noShortages` absent ; clic sur `common.retry` : `list` rappelée ;
  - adapter « should show no shortages message when empty » pour attendre la fin du chargement (`findByText`), ce qui supprime au passage l'avertissement `act(...)`.
- `frontend/src/pages/admin/BottlesPage.test.tsx` :
  - modale de création, nom vide, clic sur `bottles.saveDuplicate` : `api.create` non appelée ;
  - nom rempli, clic sur dupliquer : `api.create` appelée, modale toujours ouverte ;
  - aucune catégorie : bouton `bottles.add` désactivé ;
  - deux bouteilles identiques (groupe) avec `vi.spyOn(console, 'error')` : aucun appel contenant `unique "key"`.
- `frontend/src/pages/admin/CocktailFormPage.test.tsx` :
  - double clic rapide sur Enregistrer, `create` en promesse lente : `create` appelée une fois ;
  - `create` réussie et `uploadImage` rejetée : message d'erreur, `navigate` vers `/admin/cocktails/<id>` ; nouvelle soumission : `update` appelée, `create` toujours une seule fois.
- Vérifier que chaque nouveau test échoue avant le correctif.

## Points d'attention

- `form.requestSubmit(submitter)` et `SubmitEvent.submitter` ne sont pas fiables dans toutes les versions de jsdom : la ref d'intention évite d'en dépendre.
- La validation `required` est appliquée par jsdom lors d'un clic `userEvent` sur un bouton `submit` : s'assurer que le test « nom vide » échoue bien avant le correctif.
- E-02, E-05 et E-06 réécriront ces pages : changements petits, sans nouvelle abstraction.
- `frontend/src/test/setup.ts` mocke `t` en `key => key` : les tests vérifient des clés, pas des textes. Ajouter les nouvelles clés dans `en.json` et `fr.json` en même temps.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
