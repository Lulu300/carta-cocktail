---
id: C-56
title: "Types de catégorie : caractères invisibles hors espaces dans un nom"
phase: C
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-55]
touches: [backend/src/utils/invisibleCharacters.ts, backend/src/utils/invisibleCharacters.test.ts, backend/src/services/categoryTypeService.ts, backend/src/services/categoryTypeService.test.ts, backend/src/routes/categoryTypes.ts, backend/src/routes/categoryTypes.test.ts, backend/src/routes/categories.test.ts, frontend/src/utils/invisibleCharacters.ts, frontend/src/utils/invisibleCharacters.test.ts, frontend/src/hooks/useCategoryTypeName.ts, frontend/src/hooks/useCategoryTypeName.test.ts, frontend/src/i18n/locales/admin/en.json, frontend/src/i18n/locales/admin/fr.json, frontend/src/pages/admin/CategoriesPage.test.tsx]
sources: []
branch: fix/C-56-category-type-invisible-chars
pr: 218
---

## Contexte

Trouvé pendant la relecture de #208 (C-55, nit 2). C-55 réduit les espaces internes d'un nouveau type (`\s`, qui couvre aussi l'espace insécable, la tabulation et les sauts de ligne) et marque ceux des noms existants. Les caractères invisibles qui ne sont pas des blancs au sens de `\s` passent encore.

## Problème constaté

- L'espace sans chasse (U+200B), le gluon de mot (U+2060) et le trait d'union conditionnel (U+00AD) ne sont pas dans `\s`. `X​Y` (avec U+200B) est créé tel quel et s'affiche exactement comme `XY`, dans Manage Types comme dans la liste des types du formulaire.
- Comportement antérieur à C-55, peu probable à la saisie (copier-coller depuis une page web ou un tableur).

## Ce qu'il faut faire

1. Choisir la liste des caractères invisibles à traiter (au minimum U+200B, U+2060, U+00AD, U+FEFF hors début de nom).
2. À la création d'un nouveau type (`newCategoryTypeName`), les retirer ; un type existant choisi tel quel reste inchangé, comme dans C-55.
3. `useCategoryTypeName` : marquer leur présence dans un nom existant, comme les espaces cachés.

## Critères d'acceptation

- [x] Un nouveau type saisi avec un de ces caractères est créé sans lui.
- [x] Un type existant qui en contient se distingue du type sans, dans Manage Types et dans la liste des types du formulaire.
- [x] Les noms normaux, y compris ceux qui contiennent des lettres accentuées ou non latines, restent inchangés.

## Tests à ajouter ou adapter

- `backend/src/services/categoryTypeService.test.ts` : chaque caractère retiré à la création, type existant gardé.
- `frontend/src/pages/admin/CategoriesPage.test.tsx` : marquage d'un nom existant.

## Points d'attention

- Ne pas retirer les caractères de jonction utiles à certaines écritures (U+200C, U+200D dans les emojis composés ou l'écriture persane) sans le vérifier.

## Journal

- 2026-11-24 : tâche créée pendant la relecture de #208 (hors périmètre).
- 2026-11-24 : PR #218 (branche `fix/C-56-category-type-invisible-chars`). Liste retenue : la propriété Unicode `Default_Ignorable_Code_Point` (ce qu'un moteur de rendu dessine comme rien) plutôt que la catégorie `Cf` : elle couvre les caractères demandés (U+200B, U+200C, U+200D, U+2060, U+FEFF, U+00AD, marques et isolats de direction, U+061C), plus les remplisseurs hangul (U+3164…), le gluon de graphème U+034F, les sélecteurs de variante et les étiquettes, et elle laisse les caractères `Cf` dessinés (signes numériques arabes U+0600–U+0605, contrôles des hiéroglyphes). Règle commune dans `utils/invisibleCharacters.ts` du backend et du frontend (même code, mêmes cas de test, pas de paquet partagé entre les deux). Exceptions, gardées parce qu'elles changent le dessin : ZWJ, ZWNJ et séparateur de voyelle mongol entre deux caractères qui se joignent (emoji, dont 👩 + ZWJ + 💻 et le drapeau arc-en-ciel ; lettres et marques des écritures autres que latine, grecque et cyrillique, dont le persan avec ZWNJ et le devanagari avec ZWJ) ; sélecteur de variante après un emoji (cœur rouge en emoji plutôt qu'en texte, touches de clavier) ou une lettre de ces autres écritures (variantes idéographiques) ; étiquettes après un emoji (drapeaux d'Écosse, du pays de Galles, d'Angleterre). Ailleurs (entre lettres latines, en début ou fin de nom, à côté d'un espace) ils sont retirés. Limite assumée : un ZWJ entre deux emoji qu'aucune police ne joint reste invisible et gardé (le vérifier demanderait la liste des séquences emoji, qui change chaque année). Backend : `newCategoryTypeName` retire ces caractères avant le trim et la réduction des espaces ; un nom fait seulement de caractères invisibles répond 400 sur son champ (`requireNewCategoryTypeName`, `body.type` pour une catégorie, `body.name` pour `POST /api/category-types`, ajouté à `touches`) ; un type existant choisi tel quel reste inchangé. Le BOM U+FEFF au milieu d'un nom, compté comme blanc par JS, n'est plus changé en espace mais retiré. Frontend : `visibleName` montre chaque caractère invisible par son code (`X[U+200B]Y`) suivi de « (with invisible characters) » / « (avec caractères invisibles) », après « (with spaces) » si le nom a aussi des espaces cachés ; `typeLabel` ajoute le nom stocké marqué à une traduction. Tous les écrans de C-54 en profitent (même hook). Bundle public inchangé (135,72 kB). Sondes de sabotage (nom nouveau non nettoyé, joiners, sélecteurs ou étiquettes toujours retirés, exception des lettres latines retirée, liste réduite à U+200B, joiner avant un caractère invisible, voisin précédent non suivi, route sans garde du nom vide, correspondance exacte retirée, affichage sans marquage, `typeLabel` sans les caractères invisibles, espaces traités avant les caractères, joiners retirés côté frontend, libellé absent) : chacune fait échouer au moins un test. Pas de ligne « Notes de version » : un nom saisi est rangé sans ses caractères invisibles et les noms anciens sont marqués, sans action de l'utilisateur. Hors périmètre : C-61 (nom composé et forme décomposée, NFC / NFD).
