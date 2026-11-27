import { expect, test } from '@playwright/test';
import { AdminApi, uniqueName } from '../support/api';

test('a guest switches to the light theme, and it stays after a reload', async ({
  page,
  request,
}) => {
  const api = new AdminApi(request);
  const cocktail = await api.createCocktail(uniqueName('Spritz'));
  const menu = await api.createPublicMenu(uniqueName('Theme'), [cocktail.id]);
  const html = page.locator('html');
  const toggle = page.getByRole('button', { name: 'Light theme' });

  await page.goto(`/menu/${menu.slug}`);
  await expect(html).not.toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'light');

  // The choice is applied before the first paint of the next visit (public/theme-init.js)
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await toggle.click();
  await expect(html).not.toHaveAttribute('data-theme', 'light');
});
