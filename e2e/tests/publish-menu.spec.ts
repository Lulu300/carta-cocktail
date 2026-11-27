import { expect, test } from '@playwright/test';
import { ADMIN_STATE_FILE, AdminApi, toSlug, uniqueName } from '../support/api';

test.use({ storageState: ADMIN_STATE_FILE });

test('the admin builds a menu with a section, publishes it, and a guest reads it', async ({
  page,
  request,
  browser,
}) => {
  const cocktailName = uniqueName('Negroni');
  const menuName = uniqueName('Summer');
  const sectionName = uniqueName('Bitter');
  await new AdminApi(request).createCocktail(cocktailName);

  await page.goto('/admin/menus');
  await page.getByRole('button', { name: 'Add Menu' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^Name/ }).fill(menuName);
  await dialog.getByRole('textbox', { name: /^URL Slug/ }).fill(toSlug(menuName));
  await dialog.getByRole('switch', { name: 'Public' }).check();
  await dialog.getByRole('button', { name: 'Save' }).click();

  // A new menu opens in its editor
  await expect(page).toHaveURL(/\/admin\/menus\/\d+$/);
  await page.getByRole('button', { name: 'Add a section' }).click();
  await page.getByRole('textbox', { name: /^Section name/ }).fill(sectionName);
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  // The editor saves the composition at each change: wait for the answer before the next step
  const menuSaved = () =>
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' && /\/api\/menus\/\d+$/.test(response.url()),
    );
  await page.getByRole('button', { name: 'Add Cocktail' }).click();
  const addSaved = menuSaved();
  await page.getByRole('dialog').getByRole('button', { name: cocktailName }).click();
  expect((await addSaved).ok()).toBe(true);

  const sectionSaved = menuSaved();
  await page.getByLabel(`Section of ${cocktailName}`).selectOption({ label: sectionName });
  expect((await sectionSaved).ok()).toBe(true);

  // A guest has no session: a context of its own, which shares nothing with the admin's
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const guestPage = await guest.newPage();
  await guestPage.goto(`/menu/${toSlug(menuName)}`);
  await expect(guestPage.getByRole('heading', { name: sectionName })).toBeVisible();
  await expect(guestPage.getByText(cocktailName)).toBeVisible();
  await guest.close();
});
