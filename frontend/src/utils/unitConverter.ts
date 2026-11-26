import type { Unit } from '../types';

/**
 * Check if a unit can be converted based on its conversion factor
 */
export function isConvertible(unit: Unit | undefined): boolean {
  return unit?.conversionFactorToMl !== null && unit?.conversionFactorToMl !== undefined;
}

/**
 * Convert a quantity from one unit to milliliters
 */
export function toMilliliters(quantity: number, unit: Unit): number {
  if (!unit.conversionFactorToMl) {
    console.warn(`Unit ${unit.abbreviation} is not convertible`);
    return quantity;
  }
  return quantity * unit.conversionFactorToMl;
}

/**
 * Convert a quantity from milliliters to another unit
 */
export function fromMilliliters(ml: number, unit: Unit): number {
  if (!unit.conversionFactorToMl) {
    console.warn(`Unit ${unit.abbreviation} is not convertible`);
    return ml;
  }
  return ml / unit.conversionFactorToMl;
}

/**
 * Convert a quantity from one unit to another
 */
export function convertUnit(quantity: number, fromUnit: Unit, toUnit: Unit): number {
  const ml = toMilliliters(quantity, fromUnit);
  return fromMilliliters(ml, toUnit);
}

/**
 * Round a converted quantity to the precision that suits its unit
 */
export function roundQuantity(quantity: number, unit: Unit): number {
  const factor = unit.conversionFactorToMl || 1;

  // Very small units (dash, trait < 1ml) and ml: 1 decimal
  if (factor <= 1) {
    return Number(quantity.toFixed(1));
  }

  // cl, spoons, oz and larger: up to 2 decimals
  return Number(quantity.toFixed(2));
}

/**
 * Write a quantity with the number format of the interface language ("3,33" in French)
 */
export function formatQuantity(quantity: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 3 }).format(quantity);
}

/**
 * Get all possible unit conversions for display
 */
export function getAllConversions(
  quantity: number,
  fromUnit: Unit,
  allUnits: Unit[],
): Array<{ unit: Unit; quantity: number }> {
  if (!isConvertible(fromUnit)) {
    return [];
  }

  const ml = toMilliliters(quantity, fromUnit);

  return allUnits
    .filter((unit) => isConvertible(unit) && unit.id !== fromUnit.id)
    .map((unit) => {
      return { unit, quantity: roundQuantity(fromMilliliters(ml, unit), unit) };
    });
}
