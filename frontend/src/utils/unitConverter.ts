// Unit conversion factors to milliliters (ml) as base unit
export const UNIT_TO_ML: Record<string, number> = {
  'ml': 1,
  'cl': 10,
  'oz': 29.5735, // US fluid ounce
  'cc': 5, // cuillère à café (teaspoon) ≈ 5ml
  'cs': 15, // cuillère à soupe (tablespoon) ≈ 15ml
  'dash': 0.6, // bartender's dash ≈ 0.6ml
  'trait': 0.6, // same as dash
};

// Units that can be converted (measurable volumes)
export const CONVERTIBLE_UNITS = ['ml', 'cl', 'oz', 'cc', 'cs', 'dash', 'trait'];

// Units that cannot be converted (countable items)
export const NON_CONVERTIBLE_UNITS = ['pce', 'piece', 'pièce', 'feuille', 'tranche', 'zeste'];

/**
 * Check if a unit can be converted
 */
export function isConvertible(unitAbbreviation: string): boolean {
  const unit = unitAbbreviation.toLowerCase();
  return CONVERTIBLE_UNITS.includes(unit);
}

/**
 * Convert a quantity from one unit to milliliters
 */
export function toMilliliters(quantity: number, fromUnit: string): number {
  const unit = fromUnit.toLowerCase();
  const factor = UNIT_TO_ML[unit];

  if (factor === undefined) {
    console.warn(`Unknown unit: ${fromUnit}, cannot convert`);
    return quantity; // Return original if unknown
  }

  return quantity * factor;
}

/**
 * Convert a quantity from milliliters to another unit
 */
export function fromMilliliters(ml: number, toUnit: string): number {
  const unit = toUnit.toLowerCase();
  const factor = UNIT_TO_ML[unit];

  if (factor === undefined) {
    console.warn(`Unknown unit: ${toUnit}, cannot convert`);
    return ml; // Return ml if unknown
  }

  return ml / factor;
}

/**
 * Convert a quantity from one unit to another
 */
export function convertUnit(quantity: number, fromUnit: string, toUnit: string): number {
  const ml = toMilliliters(quantity, fromUnit);
  return fromMilliliters(ml, toUnit);
}

/**
 * Format a converted quantity with appropriate precision
 */
export function formatQuantity(quantity: number, unit: string): string {
  const unit_lower = unit.toLowerCase();

  // For very small quantities (dash, trait), show 1 decimal
  if (unit_lower === 'dash' || unit_lower === 'trait') {
    return quantity.toFixed(1);
  }

  // For ml, show integer or 1 decimal if needed
  if (unit_lower === 'ml') {
    return quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(1);
  }

  // For cl and oz, show up to 2 decimals
  if (unit_lower === 'cl' || unit_lower === 'oz') {
    // Remove trailing zeros
    const formatted = quantity.toFixed(2);
    return parseFloat(formatted).toString();
  }

  // For spoons (cc, cs), show 1 decimal
  if (unit_lower === 'cc' || unit_lower === 'cs') {
    const formatted = quantity.toFixed(1);
    return parseFloat(formatted).toString();
  }

  // Default: up to 2 decimals, remove trailing zeros
  const formatted = quantity.toFixed(2);
  return parseFloat(formatted).toString();
}

/**
 * Get all possible unit conversions for display
 */
export function getAllConversions(quantity: number, fromUnit: string): Array<{unit: string, quantity: number, formatted: string}> {
  if (!isConvertible(fromUnit)) {
    return [];
  }

  const ml = toMilliliters(quantity, fromUnit);

  return CONVERTIBLE_UNITS
    .filter(unit => unit !== fromUnit.toLowerCase())
    .map(unit => {
      const convertedQty = fromMilliliters(ml, unit);
      return {
        unit,
        quantity: convertedQty,
        formatted: formatQuantity(convertedQty, unit),
      };
    });
}
