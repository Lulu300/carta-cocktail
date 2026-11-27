import { expect, test } from '@playwright/test';
import { ADMIN_STATE_FILE, AdminApi, toSlug, uniqueName } from '../support/api';

test.use({ storageState: ADMIN_STATE_FILE });

test('the admin composes a personal aperitifs menu from bottles, and a guest reads it', async ({
  page,
  request,
  browser,
}) => {
  const bottleName = uniqueName('Campari');
  const menuName = uniqueName('Summer aperitif');
  const api = new AdminApi(request);
  const category = await api.createCategory(uniqueName('Bitter'));
  await api.createBottle(bottleName, category.id, { isApero: true });

  await page.goto('/admin/menus');
  await page.getByRole('button', { name: 'Add Menu' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^Name/ }).fill(menuName);
  await dialog.getByRole('textbox', { name: /^URL Slug/ }).fill(toSlug(menuName));
  await dialog.getByLabel('Type').selectOption({ label: 'Aperitifs' });
  await dialog.getByRole('switch', { name: 'Public' }).check();
  await dialog.getByRole('button', { name: 'Save' }).click();

  // A personal bottle menu opens in the bottle editor, empty: nothing is added by itself
  await expect(page).toHaveURL(/\/admin\/menus\/\d+\/bottles$/);
  await expect(page.getByText('No bottles yet.')).toBeVisible();

  const added = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && /\/api\/menu-bottles/.test(response.url()),
  );
  await page.getByRole('button', { name: `Add ${bottleName} to the menu` }).click();
  expect((await added).ok()).toBe(true);
  await expect(page.getByRole('button', { name: `Add ${bottleName} to the menu` })).toBeHidden();

  // The addition is saved at once: it survives a reload
  await page.reload();
  await expect(page.getByText('No bottles yet.')).toBeHidden();
  await expect(page.getByText(bottleName)).toBeVisible();

  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const guestPage = await guest.newPage();
  await guestPage.goto(`/menu/${toSlug(menuName)}`);
  await expect(guestPage.getByText(bottleName)).toBeVisible();
  await guest.close();
});
