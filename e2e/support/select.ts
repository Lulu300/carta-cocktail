import type { Locator } from '@playwright/test';

/**
 * Picks the option whose text contains `text`. Option labels carry more than the name
 * ("Rum (Spirit)", "Havana (Rum)"): matching the whole label would tie a test to them.
 */
export async function selectOptionContaining(select: Locator, text: string): Promise<void> {
  const value = await select.locator('option', { hasText: text }).getAttribute('value');
  await select.selectOption(value ?? '');
}
