---
id: E-04
title: "Retours utilisateur : toasts et boîte de confirmation"
phase: E
lane: frontend
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [E-03]
touches: [frontend/src/components/ui/Toast, frontend/src/components/ui/ConfirmDialog, frontend/src/contexts/, frontend/src/main.tsx, frontend/src/i18n/locales/, frontend/src/pages/admin/SettingsPage.tsx]
sources: ["06-frontend-ux-perf.md §2", "05-frontend-archi.md §H2"]
branch:
pr:
---

## Décisions validées (2026-10-08)

- **Suppression forcée** (décision C-07) : `ConfirmDialog` doit pouvoir afficher une liste d'impacts et exiger une case à cocher « Je comprends les risques » avant d'activer le bouton de confirmation. E-15 s'en sert.

## Contexte

L'admin ne sait jamais si une action a réussi. Une suppression refusée par le backend (catégorie encore utilisée, unité référencée) ne produit rien de visible, et les confirmations passent par la boîte native du navigateur, parfois en français en dur. Cette tâche fournit les deux outils de retour : des toasts et une boîte de confirmation accessible. Le branchement page par page se fait dans E-05, E-06 et E-07.

## Problème constaté

- Aucun toast dans le code (`grep -ri toast src` : 0 résultat).
- 11 appels natifs `confirm()` / `alert()` : `CategoriesPage.tsx:99,144,149`, `IngredientsPage.tsx:80`, `UnitsPage.tsx:68`, `BottlesPage.tsx:181`, `MenusPage.tsx:40`, `CocktailsPage.tsx:79`, `MenuEditPage.tsx:105`, `MenuBottleEditPage.tsx:185`, `SettingsPage.tsx:110`. Ceux de `MenuEditPage.tsx:105` et `MenuBottleEditPage.tsx:185` sont en français en dur.
- Les 18 clés `*.created`, `*.updated`, `*.deleted` (6 entités × 3, présentes en `en` et `fr`) ne sont jamais utilisées. La revue en annonce 14 : il y en a 18.
- Les erreurs de mutation ne sont pas attrapées (liste dans `05-frontend-archi.md §H2`) : rejet non géré, modale bloquée, rien à l'écran.

## Ce qu'il faut faire

1. **Store de toasts hors React**, pour pouvoir l'appeler depuis le `QueryClient` (E-05 s'en sert dans `MutationCache.onError`) :
   - `components/ui/ToastStore.ts` : petit store à abonnement (`subscribe`, `getSnapshot`) et API
     ```ts
     export const toast = {
       success(message: string, opts?: ToastOptions): string;
       error(messageOrError: unknown, opts?: ToastOptions): string;
       info(message: string, opts?: ToastOptions): string;
       dismiss(id: string): void;
     };
     interface ToastOptions { duration?: number; action?: { label: string; onClick: () => void } }
     ```
     `error(err)` accepte une `ApiError` (A-10) ou une `Error` et affiche son `message`, déjà traduit par le backend. Sinon, message générique `i18n.t('common.error')`.
   - Durées par défaut : 4 s pour `success` et `info`, 8 s pour `error`. Pause au survol et au focus.
2. **`components/ui/Toaster.tsx`** : lit le store avec `useSyncExternalStore`, rend la pile en bas à droite (en bas au centre sous 640 px). Deux régions live : `role="status"` (`aria-live="polite"`) pour succès et info, `role="alert"` pour les erreurs. Chaque toast a un `IconButton icon="close" label={t('common.close')}` et le bouton `action` s'il est fourni (prévu pour « Annuler » plus tard).
3. **Boîte de confirmation** :
   - `components/ui/ConfirmDialog.tsx` : basé sur `Modal` (E-03), `role="alertdialog"`, props `open`, `title`, `message`, `details?: ReactNode` (liste d'impacts), `acknowledgeLabel?: string` (case à cocher obligatoire avant d'activer la confirmation), `confirmLabel`, `cancelLabel`, `tone: 'danger' | 'default'`, `onConfirm`, `onCancel`. Focus initial sur « Annuler » quand `tone="danger"`.
   - `contexts/ConfirmContext.tsx` : `ConfirmProvider` et
     ```ts
     useConfirm(): (opts: { title: string; message?: string; details?: ReactNode; acknowledgeLabel?: string; confirmLabel?: string; tone?: 'danger' | 'default' }) => Promise<boolean>
     ```
     Une seule boîte montée par le provider ; la promesse se résout à `false` sur Échap, clic sur le fond ou « Annuler ».
4. **`main.tsx`** : ajouter `<ConfirmProvider>` autour de `<App />` et monter `<Toaster />` une fois, à côté de `<App />`.
5. **Clés i18n** (en et fr) : `common.undo`, `confirm.deleteTitle` (« Supprimer ? »), `confirm.irreversible` (« Cette action est définitive. »). `common.close` vient de E-03, `common.confirm` et `common.cancel` existent.
6. **Pilote** : `SettingsPage.tsx:110` remplace `confirm(t('settings.backup.confirmRestore'))` par `await confirm({ title: …, tone: 'danger' })`. La page garde ses messages en ligne existants ; ajouter seulement `toast.success` après une restauration réussie. Aucune autre page dans cette tâche.

Répartition des 10 autres `confirm()` / `alert()` : E-05 (Categories ×3, Ingredients, Units, Bottles, Menus), E-06 (Cocktails), E-07 (MenuEdit, MenuBottleEdit).

## Critères d'acceptation

- [ ] Avec `acknowledgeLabel`, le bouton de confirmation reste désactivé tant que la case n'est pas cochée ; `details` s'affiche sous le message.
- [ ] `toast.success('x')` appelé hors composant affiche le toast (testé).
- [ ] Les erreurs sont annoncées dans une région `role="alert"`, les succès dans `role="status"`.
- [ ] Un toast d'erreur reste au moins 8 s et peut être fermé au clavier.
- [ ] `useConfirm()` renvoie `true` sur « Confirmer », `false` sur « Annuler », Échap et clic sur le fond.
- [ ] La restauration d'une sauvegarde dans `SettingsPage` passe par `ConfirmDialog` ; plus de `confirm(` dans ce fichier.
- [ ] Les nouvelles clés existent en `en` et `fr`.
- [ ] Couverture ≥ 80 % sur les fichiers créés et modifiés.

## Tests à ajouter ou adapter

- `components/ui/ToastStore.test.ts` : ajout, retrait automatique avec `vi.useFakeTimers()`, `dismiss`, `error(new ApiError(...))` affiche le message serveur, `error('boom')` hors `Error` affiche `common.error`.
- `components/ui/Toaster.test.tsx` : un succès apparaît dans `getByRole('status')`, une erreur dans `getByRole('alert')`, le bouton fermer retire le toast, le bouton `action` appelle son callback.
- `contexts/ConfirmContext.test.tsx` : un composant de test appelle `confirm()` ; vérifier la résolution `true` / `false` pour chaque chemin de sortie, et que deux appels successifs fonctionnent.
- `SettingsPage.test.tsx` : remplacer le mock de `window.confirm` par l'interaction avec la boîte (`getByRole('alertdialog')`, clic sur « Confirmer »), et vérifier qu'« Annuler » n'appelle pas `backup.importBackup`.

## Points d'attention

- `ToastStore.ts` exporte un objet, pas un composant : le séparer de `Toaster.tsx` évite l'avertissement `react-refresh/only-export-components`.
- Le message d'une `ApiError` est déjà localisé par le backend selon `Accept-Language`. Si A-10 n'a pas ajouté cet en-tête, l'admin peut voir des erreurs dans une autre langue que l'UI.
- Ne pas ajouter de dépendance (sonner, react-hot-toast) : le besoin tient en une centaine de lignes, et la revue note que le projet n'a aucune lib UI.
- `SettingsPage` n'est dans le périmètre d'aucune autre tâche E avant E-09 ; la modifier ici ne crée pas de conflit attendu.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
