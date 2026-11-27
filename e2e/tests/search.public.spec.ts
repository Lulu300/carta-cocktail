import { expect, test } from '@playwright/test';
import { AdminApi, uniqueName } from '../support/api';

test('a guest searches the menu, with or without accents', async ({ page, request }) => {
  const dessertName = uniqueName('Crème Brûlée Martini');
  const classicName = uniqueName('Mojito');
  const api = new AdminApi(request);
  const dessert = await api.createCocktail(dessertName);
  const classic = await api.createCocktail(classicName);
  const menu = await api.createPublicMenu(uniqueName('Search'), [dessert.id, classic.id]);

  await page.goto(`/menu/${menu.slug}`);
  await expect(page.getByText(dessertName)).toBeVisible();
  await expect(page.getByText(classicName)).toBeVisible();

  const search = page.getByRole('searchbox', { name: 'Search recipes...' });
  await search.fill('creme brulee');
  await expect(page.getByText(dessertName)).toBeVisible();
  await expect(page.getByText(classicName)).toBeHidden();

  await search.fill('zzzz');
  await expect(page.getByText('No results for “zzzz”')).toBeVisible();
  await expect(page.getByText(dessertName)).toBeHidden();

  // The empty state offers a clear button too: the one of the field has a title
  await page.getByTitle('Clear search').click();
  await expect(page.getByText(classicName)).toBeVisible();
});
