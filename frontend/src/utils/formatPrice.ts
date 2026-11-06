// Prices are entered in euros; only the way they are written follows the interface language.
const CURRENCY = 'EUR';

/** Purchase price written for the interface language: "€12.50" in English, "12,50 €" in French. */
export function formatPrice(amount: number, language: string): string {
  return new Intl.NumberFormat(language, { style: 'currency', currency: CURRENCY }).format(amount);
}
