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
 * Format a converted quantity with appropriate precision
 */
export function formatQuantity(quantity: number, unit: Unit): string {
  const factor = unit.conversionFactorToMl || 1;

  // For very small factors (dash, trait < 1ml), show 1 decimal
  if (factor < 1) {
    return quantity.toFixed(1);
  }

  // For ml (factor = 1), show integer or 1 decimal if needed
  if (factor === 1) {
    return quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(1);
  }

  // For medium factors (cl, teaspoon, tablespoon), show up to 2 decimals
  if (factor <= 20) {
    const formatted = quantity.toFixed(2);
    return parseFloat(formatted).toString();
  }

  // For large factors (oz ~30), show up to 2 decimals
  const formatted = quantity.toFixed(2);
  return parseFloat(formatted).toString();
}

/**
 * Get all possible unit conversions for display
 */
export function getAllConversions(
  quantity: number,
  fromUnit: Unit,
  allUnits: Unit[]
): Array<{ unit: Unit; quantity: number; formatted: string }> {
  if (!isConvertible(fromUnit)) {
    return [];
  }

  const ml = toMilliliters(quantity, fromUnit);

  return allUnits
    .filter(unit => isConvertible(unit) && unit.id !== fromUnit.id)
    .map(unit => {
      const convertedQty = fromMilliliters(ml, unit);
      return {
        unit,
        quantity: convertedQty,
        formatted: formatQuantity(convertedQty, unit),
      };
    });
}
