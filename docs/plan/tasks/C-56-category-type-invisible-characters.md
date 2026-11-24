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
touches: [backend/src/utils/invisibleCharacters.ts, backend/src/utils/invisibleCharacters.test.ts, backend/src/services/categoryTypeService.ts, backend/src/services/categoryTypeService.test.ts, backend/src/routes/categoryTypes.ts, backend/src/routes/categoryTypes.test.ts, backend/src/routes/categories.test.ts, backend/src/routes/bottles.test.ts, backend/src/services/cocktail/cocktailImport.test.ts, frontend/src/utils/invisibleCharacters.ts, frontend/src/utils/invisibleCharacters.test.ts, frontend/src/hooks/useCategoryTypeName.ts, frontend/src/hooks/useCategoryTypeName.test.ts, frontend/src/components/admin/categories/categoryForm.ts, frontend/src/components/admin/categories/useCategoryTypeForm.ts, frontend/src/i18n/locales/admin/en.json, frontend/src/i18n/locales/admin/fr.json, frontend/src/pages/admin/CategoriesPage.test.tsx]
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
- 2026-11-25 : relecture de #218 (changements demandés), corrigée dans la même PR, rebasée sur C-59 (#216). (1) ZWJ et ZWNJ ne sont plus gardés entre deux lettres de n'importe quelle écriture autre que latine, grecque ou cyrillique, mais seulement pour les écritures qui s'en servent : cursives (arabe, syriaque, mongol, N'Ko, mandéen, manichéen, pehlevi des psautiers, phags-pa, adlam, hanifi rohingya, sogdien) et brahmiques à virama (devanagari, bengali, malayalam, cinghalais, khmer, birman… : 44 écritures, liste tirée des caractères de classe combinatoire 9). Seules des écritures d'Unicode 11 ou plus anciennes : un nom d'écriture inconnu serait une erreur de syntaxe dans Safari 16.0. Un ZWJ entre deux idéogrammes CJK, kana, hangul, lettres hébraïques, thaïes ou arméniennes est retiré et marqué. Les sélecteurs de variante ont leur propre liste (han pour les séquences idéographiques comme `葛` + U+E0100, mongol, phags-pa, manichéen, birman). (2) Caractères dessinés comme un blanc mais hors de `\s` : U+2800 (motif braille vide) et les remplisseurs hangul U+3164 et U+FFA0 (dans `Default_Ignorable_Code_Point`, mais dessinés comme un espace large par la plupart des polices) suivent la règle des espaces de C-55 : trim et réduction à la création (`tidyName`, partagé par les deux paquets), `␣` et « (with spaces) » à l'affichage. Aucun autre trouvé : les autres caractères de largeur nulle sont dans `Default_Ignorable_Code_Point`. (3) Le type personnalisé du formulaire de catégorie (`toCategoryInput`) et le nom de Manage Types passent par `tidyName` : un nom fait seulement de caractères invisibles ou blancs affiche le message du champ (formulaire de catégorie) ou n'est pas envoyé (Manage Types, comme un nom blanc) au lieu du 400 ; le nom envoyé est déjà nettoyé. (4) Nits : un ZWJ après une lettre d'une écriture qui lie est gardé quoi qui suive (chillu malayalam, demi-forme devanagari, forme de liaison arabe en fin de mot) ; ZWNJ et séparateur de voyelle mongol gardent la règle des deux côtés ; un sélecteur de présentation après un chiffre, `#` ou `*` n'est gardé que devant U+20E3 (touche de clavier). (5) Conflit avec C-59 : `ensureCategoryType(db, name, typePath = ['body', 'type'])` appelle `requireNewCategoryTypeName(name, typePath)`, `blankTypeError` supprimé ; les imports de bouteilles et de cocktails répondent 400 au chemin de leur résolution pour un nouveau type fait seulement de caractères invisibles ou blancs (`touches` complété : tests des deux imports, `categoryForm.ts`, `useCategoryTypeForm.ts`). Sondes de sabotage (joiners gardés pour toute écriture, des deux côtés ; ZWJ à deux côtés ; sélecteur gardé après toute lettre ; sélecteur gardé après tout chiffre ; han retiré des variantes ; remplisseurs hangul de nouveau invisibles ; blancs non traités comme des espaces, des deux côtés ; motif d'affichage sans les blancs ; chemin d'import remplacé par celui de la catégorie ; type personnalisé et nom de Manage Types seulement trimés) : chacune fait échouer au moins un test. Bundle public : 135,73 kB.
- Notes de version (ajoutée par le coordinateur, relecture de la PR #219) : un nouveau type de catégorie perd ses caractères invisibles (espace de largeur nulle, marques de direction…), sauf les liaisons nécessaires aux écritures qui les utilisent et aux emoji ; U+2800, U+3164 et U+FFA0 comptent comme des espaces ; un nom stocké qui en contient s'affiche sur les écrans admin avec le code du caractère (`[U+200B]`) et « (with invisible characters) » / « (avec caractères invisibles) ».
