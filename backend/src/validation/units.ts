import { z } from 'zod';
import { RequiredText, Translations } from './common';

// null: the unit cannot be converted to ml (piece, leaf...)
export const ConversionFactorToMl = z.number().nonnegative().nullable();

export const UnitCreate = z.object({
  name: RequiredText,
  abbreviation: RequiredText,
  conversionFactorToMl: ConversionFactorToMl.optional(),
  nameTranslations: Translations.optional(),
});

export const UnitUpdate = UnitCreate.partial();
