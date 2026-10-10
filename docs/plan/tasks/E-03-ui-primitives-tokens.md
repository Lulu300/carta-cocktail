---
id: E-03
title: "Design system : tokens de thème et composants de base (Modal, Button, Field…)"
phase: E
lane: frontend
criticite: haute
effort: M
status: done
owner: agent
depends_on: []
touches: [frontend/src/index.css, frontend/src/components/ui/, frontend/src/test/setup.ts, frontend/src/i18n/locales/]
sources: ["06-frontend-ux-perf.md §2", "05-frontend-archi.md §4.1"]
branch: feature/E-03-ui-primitives-tokens
pr: https://github.com/Lulu300/carta-cocktail/pull/51
---

## Contexte

Les couleurs du thème sont écrites en dur dans chaque composant et les mêmes blocs (modale, bouton ambre, champ de saisie) sont recopiés partout. Changer une teinte demande plus de 200 remplacements, et chaque copie de modale porte les mêmes défauts d'accessibilité. Cette tâche crée les tokens et les composants de base. Elle ne migre pas les pages : E-05, E-06, E-07, E-08 et E-11 le font page par page.

## Problème constaté

Comptages refaits sur le code actuel (fichiers `.tsx` hors tests) :

| Motif | Occurrences |
|---|---|
| `bg-[#0f0f1a]` | 107 (+1 `bg-[#0f0f1a]/50`) |
| `bg-[#1a1a2e]` | 67 (+1 `bg-[#1a1a2e]/80` dans `PublicLayout.tsx:14`) |
| `text-[#0f0f1a]` (texte sur bouton ambre) | 39 (+1 `file:text-[#0f0f1a]`) |
| `bg-amber-400 hover:bg-amber-500` | 31 |
| `focus:outline-none` / `focus:border-amber-400` | 79 / 77 |
| Overlay `fixed inset-0 z-50 … bg-black/60` | 12 (`CategoriesPage.tsx:218,283`, `IngredientsPage.tsx:212`, `UnitsPage.tsx:124`, `MenusPage.tsx:138`, `BottlesPage.tsx:420`, `MenuEditPage.tsx:350,372`, `MenuBottleEditPage.tsx:405`, `ImportCocktailWizard.tsx:190`, `ImportBottlesWizard.tsx:167`, `MenuPublicPage.tsx:364`) |
| Interrupteur `w-12 h-6 rounded-full` | 4 (`CocktailFormPage.tsx:212`, `MenuEditPage.tsx:193`, `MenuBottleEditPage.tsx:282`, `MenusPage.tsx:159`) |
| `<label>` / `htmlFor` | 64 / 0 |

- `frontend/src/index.css:4-7` : le bloc `@theme` ne définit que les polices.
- `frontend/AGENTS.md` cite `#2a2a3e` comme couleur de fond : elle n'est utilisée nulle part.
- `frontend/src/index.css:22` : le sélecteur `.print\\:hidden` est mal échappé (double antislash), la règle est ignorée. La variante Tailwind `print:hidden` fait déjà le travail.
- Aucun composant `Button`, `Modal` ou `Field` dans `components/ui/`.

## Ce qu'il faut faire

### 1. Tokens dans `index.css`

Ajouter au bloc `@theme` (pas `@theme inline`, pour que F-06 puisse redéfinir les variables sous `[data-theme="light"]`) :

```css
@theme {
  --color-canvas: #0f0f1a;                       /* fond de page          -> bg-canvas */
  --color-surface: #1a1a2e;                      /* cartes, modales, header -> bg-surface */
  --color-line: var(--color-gray-800);           /* bordures de carte     -> border-line */
  --color-line-strong: var(--color-gray-700);    /* bordures de champ     -> border-line-strong */
  --color-fg: var(--color-gray-100);             /* texte principal       -> text-fg */
  --color-fg-muted: var(--color-gray-400);       /* texte secondaire      -> text-fg-muted */
  --color-accent: var(--color-amber-400);        /* -> bg-accent, text-accent, border-accent */
  --color-accent-hover: var(--color-amber-500);
  --color-accent-soft: var(--color-amber-300);   /* survol des liens ambre */
  --color-on-accent: #0f0f1a;                    /* texte sur fond ambre  -> text-on-accent */
  --color-danger: var(--color-red-400);
  --color-success: var(--color-green-400);
  --color-warning: var(--color-yellow-400);
  --color-info: var(--color-blue-400);
}
```

Les valeurs reprennent exactement le rendu actuel : aucun changement visuel attendu. Les noms évitent `bg-bg`. Les opacités restent possibles (`bg-accent/10`, `bg-surface/80`). Supprimer la règle `.print\\:hidden` de la ligne 22 (garder `header, nav`).

### 2. Composants dans `components/ui/`

Chaque composant accepte `className` en plus et transmet les props natives. React 19 : `ref` est une prop, pas besoin de `forwardRef`.

| Composant | API |
|---|---|
| `Button` | `variant?: 'primary' \| 'secondary' \| 'ghost' \| 'danger'`, `size?: 'sm' \| 'md'`, `loading?: boolean` (désactive et affiche `Spinner`), `type` vaut `'button'` par défaut |
| `Icon` | `name: 'edit' \| 'delete' \| 'close' \| 'search' \| 'chevron-down' \| 'download' \| 'plus'`, SVG `aria-hidden`. Reprend les chemins copiés dans les pages (`CategoriesPage.tsx:197-204`) |
| `IconButton` | `icon: IconName`, `label: string` obligatoire (devient `aria-label` et `title`), `variant?: 'default' \| 'danger'`, zone cliquable d'au moins 40×40 px |
| `Modal` | `open: boolean`, `onClose: () => void`, `title: ReactNode`, `size?: 'sm' \| 'md' \| 'lg' \| 'xl'`, `footer?: ReactNode`, `closeOnBackdrop?: boolean` (true par défaut), `children` |
| `Field` | `label: string`, `hint?: string`, `error?: string`, `required?: boolean`, `children`. Génère un id avec `useId()` et le fournit par contexte |
| `Input`, `Select`, `Textarea` | Champs stylés. Lisent le contexte de `Field` pour `id`, `aria-describedby` et `aria-invalid`. Utilisables seuls |
| `ToggleSwitch` | `checked: boolean`, `onChange: (checked: boolean) => void`, `label: string`, `hideLabel?: boolean`. Rendu `<button role="switch" aria-checked>` |
| `Card` | `as?: 'div' \| 'section'`, `padding?: 'none' \| 'md'` (`bg-surface border border-line rounded-xl`) |
| `Badge` | `tone?: 'neutral' \| 'accent' \| 'success' \| 'warning' \| 'danger' \| 'info'` |
| `EmptyState` | `icon?: ReactNode`, `title: string`, `description?: string`, `action?: ReactNode` |
| `Skeleton` | `className` (forme et taille), `animate-pulse motion-reduce:animate-none` |
| `Spinner` | `label?: string` (texte masqué visuellement, `t('common.loading')` par défaut) |

`Modal` repose sur `<dialog>` natif : `showModal()` à l'ouverture, `close()` à la fermeture, événement `cancel` (Échap) qui appelle `onClose`, clic sur le fond détecté par `event.target === dialogRef.current`, `aria-labelledby` vers le titre, bouton de fermeture `IconButton icon="close" label={t('common.close')}`. Le navigateur gère le piège à focus et la restitution du focus. Bloquer le défilement du fond (`document.body.style.overflow = 'hidden'` pendant l'ouverture).

Les états de focus des composants utilisent `focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2`. Ne jamais écrire `focus:outline-none` sans remplacement.

### 3. Fichiers annexes

- `src/test/setup.ts` : jsdom 28 n'implémente pas `HTMLDialogElement.showModal`. Ajouter un polyfill minimal (`showModal` et `close` qui basculent `open` et émettent `close`).
- `i18n/locales/en.json` et `fr.json` : ajouter `common.close` (« Close » / « Fermer »).
- Ne migrer aucune page dans cette tâche.

## Critères d'acceptation

- [x] Les 14 tokens existent dans `index.css` ; `bg-canvas`, `bg-surface`, `text-on-accent` produisent les mêmes couleurs que les valeurs en dur (vérification visuelle sur une page de démonstration en dev, sans la committer).
- [x] Les 14 composants listés existent, avec au moins un test chacun (`Input`, `Select` et `Textarea` peuvent partager un fichier).
- [x] `Modal` : Échap ferme, clic sur le fond ferme, clic dans le contenu ne ferme pas, le titre est le nom accessible du dialogue.
- [x] `Field` + `Input` : `getByLabelText('Nom')` trouve le champ ; `error` est relié par `aria-describedby` et `aria-invalid="true"`.
- [x] Aucune classe `focus:outline-none` dans les nouveaux composants.
- [x] Le build n'émet plus d'avertissement CSS sur le bloc `@media print`.
- [x] Couverture ≥ 80 % sur les fichiers créés.

## Tests à ajouter ou adapter

Un fichier par composant, à côté de la source (`components/ui/Modal.test.tsx`…). Scénarios minimum :
- `Button` : `loading` désactive le bouton et affiche le spinner ; `type="button"` par défaut.
- `IconButton` : `getByRole('button', { name: label })`.
- `Modal` : `open=false` ne rend rien de visible ; `fireEvent(dialog, new Event('cancel'))` appelle `onClose` ; clic sur le fond appelle `onClose`, clic sur le contenu non ; `closeOnBackdrop={false}` respecté ; `getByRole('dialog', { name: title })`.
- `Field` : association label/champ, message d'erreur annoncé, `required` ajoute l'attribut au champ.
- `ToggleSwitch` : `role="switch"`, `aria-checked` suit `checked`, clic appelle `onChange(!checked)`.
- `Skeleton`, `Spinner`, `Badge`, `Card`, `EmptyState` : rendu et classes de variante (un test court chacun).

## Points d'attention

- Décision humaine, non bloquante : garder Inter comme police de corps ou en choisir une autre (Outfit, DM Sans, Jost, proposés en `06 §2.3`). Le token `--font-sans` reste à sa valeur actuelle ; E-12 auto-héberge la police retenue.
- `B-04` touche aussi `src/test/` : si les deux tâches sont ouvertes en même temps, le polyfill de `setup.ts` devra être reporté au rebase.
- Ne pas créer ici `ConfirmDialog` et `Toast` (E-04), `TranslationFields` et `DataTable` (E-05), `TagList` (E-06), `ReorderButtons` et `SectionSelect` (E-07), `WizardModal` et `FileDropzone` (E-08).
- Les pages qui ne sont couvertes par aucune tâche de refonte (`SettingsPage`, `LoginPage`, layouts) passent aux tokens dans E-09.
- Mettre à jour la section « Styling Conventions » de `frontend/AGENTS.md` relève de D-09 ; signaler les noms de tokens dans la PR pour que D-09 les reprenne.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-10 : tokens et 14 composants livrés (PR #51), aucune page migrée. Écarts : `IconButton` a une troisième variante `neutral` (bouton de fermeture de `Modal`, gris comme les boutons actuels) ; le `className` d'`Icon` remplace la taille par défaut au lieu de s'y ajouter ; dans un `Field`, l'`id` du champ vient toujours du `Field` (le label reste associé) ; `ToggleSwitch` activé passe de `green-500` à `bg-success` (`green-400`) ; `Button variant="danger"` reprend le style teinté (`bg-danger/10`). Ajouts internes : `classNames.ts` (`cx()`, anneau de focus partagé) et `fieldContext.ts`. `Modal` ne monte son contenu qu'à l'ouverture et resynchronise le parent si le navigateur ferme le dialogue seul. Vérification des tokens sur une page de démo non commitée (Chromium headless) : couleurs calculées identiques aux valeurs en dur. Police : Inter conservée, choix reporté à E-12. Noms des tokens listés dans la PR pour D-09. Aucune action utilisateur requise.
