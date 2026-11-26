import { PrismaClient } from '../generated/prisma/client';
import { CaseInsensitiveIndex } from '../utils/uniqueness';

// Units every instance starts with. The admin may edit or delete them afterwards.
const DEFAULT_UNITS = [
  { name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10,
    nameTranslations: JSON.stringify({ fr: 'Centilitre', en: 'Centiliter' }) },
  { name: 'Millilitre', abbreviation: 'ml', conversionFactorToMl: 1,
    nameTranslations: JSON.stringify({ fr: 'Millilitre', en: 'Milliliter' }) },
  { name: 'Once (US)', abbreviation: 'oz', conversionFactorToMl: 29.5735,
    nameTranslations: JSON.stringify({ fr: 'Once (US)', en: 'Ounce (US)' }) },
  { name: 'Pièce', abbreviation: 'pce', conversionFactorToMl: null,
    nameTranslations: JSON.stringify({ fr: 'Pièce', en: 'Piece' }) },
  { name: 'Trait', abbreviation: 'trait', conversionFactorToMl: 0.6,
    nameTranslations: JSON.stringify({ fr: 'Trait', en: 'Dash' }) },
  { name: 'Cuillère à café', abbreviation: 'cc', conversionFactorToMl: 5,
    nameTranslations: JSON.stringify({ fr: 'Cuillère à café', en: 'Teaspoon' }) },
  { name: 'Cuillère à soupe', abbreviation: 'cs', conversionFactorToMl: 15,
    nameTranslations: JSON.stringify({ fr: 'Cuillère à soupe', en: 'Tablespoon' }) },
  { name: 'Feuille', abbreviation: 'feuille', conversionFactorToMl: null,
    nameTranslations: JSON.stringify({ fr: 'Feuille', en: 'Leaf' }) },
  { name: 'Tranche', abbreviation: 'tranche', conversionFactorToMl: null,
    nameTranslations: JSON.stringify({ fr: 'Tranche', en: 'Slice' }) },
  { name: 'Zeste', abbreviation: 'zeste', conversionFactorToMl: null,
    nameTranslations: JSON.stringify({ fr: 'Zeste', en: 'Zest' }) },
  { name: 'Gramme', abbreviation: 'g', conversionFactorToMl: null,
    nameTranslations: JSON.stringify({ fr: 'Gramme', en: 'Gram' }) },
  { name: 'Goutte', abbreviation: 'goutte', conversionFactorToMl: null,
    nameTranslations: JSON.stringify({ fr: 'Goutte', en: 'Drop' }) },
  { name: 'Rondelle', abbreviation: 'rondelle', conversionFactorToMl: null,
    nameTranslations: JSON.stringify({ fr: 'Rondelle', en: 'Wheel' }) },
  { name: 'Pincée', abbreviation: 'pincée', conversionFactorToMl: null,
    nameTranslations: JSON.stringify({ fr: 'Pincée', en: 'Pinch' }) },
  { name: 'Brin', abbreviation: 'brin', conversionFactorToMl: null,
    nameTranslations: JSON.stringify({ fr: 'Brin', en: 'Sprig' }) },
  { name: 'Branche', abbreviation: 'branche', conversionFactorToMl: null,
    nameTranslations: JSON.stringify({ fr: 'Branche', en: 'Branch' }) },
  { name: 'Écorce', abbreviation: 'écorce', conversionFactorToMl: null,
    nameTranslations: JSON.stringify({ fr: 'Écorce', en: 'Peel' }) },
  { name: 'Tasse', abbreviation: 'tasse', conversionFactorToMl: 250,
    nameTranslations: JSON.stringify({ fr: 'Tasse', en: 'Cup' }) },
];

/**
 * Creates the default units that are missing, and gives their translations to those that have none.
 * A unit is looked for by its abbreviation ignoring case, like the routes check it: an admin who
 * changed `cl` into `CL` keeps `CL`, and the seed does not add a second `cl` at the next start.
 * When older data holds several units that differ only by case ('CL' and 'Cl'), none exactly,
 * the seed leaves them as they are.
 */
export async function ensureDefaultUnits(db: PrismaClient): Promise<void> {
  const units = new CaseInsensitiveIndex(await db.unit.findMany(), (unit) => unit.abbreviation);
  for (const unit of DEFAULT_UNITS) {
    const match = units.match(unit.abbreviation);
    if (match.status === 'none') {
      await db.unit.create({ data: unit });
    } else if (match.status === 'found' && !match.row.nameTranslations) {
      await db.unit.update({ where: { id: match.row.id }, data: { nameTranslations: unit.nameTranslations } });
    }
  }
}
