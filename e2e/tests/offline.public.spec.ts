import { expect, test } from '@playwright/test';
import { AdminApi, uniqueName } from '../support/api';

test('a menu visited once opens again without a network', async ({ page, context, request }) => {
  const cocktailName = uniqueName('Americano');
  const api = new AdminApi(request);
  const cocktail = await api.createCocktail(cocktailName);
  const menu = await api.createPublicMenu(uniqueName('Offline'), [cocktail.id]);
  const menuData = `/api/public/menus/${menu.slug}`;

  await page.goto(`/menu/${menu.slug}`);
  await expect(page.getByText(cocktailName)).toBeVisible();

  // The service worker takes control, then keeps the menu data the page loaded before it existed
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(async (url) => (await caches.match(url)) !== undefined, menuData))
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(cocktailName)).toBeVisible();
});
