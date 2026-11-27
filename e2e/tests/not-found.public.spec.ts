import { expect, test } from '@playwright/test';

test('an unknown address shows the 404 page, with a way back home', async ({ page }) => {
  await page.goto('/no/such/page');

  await expect(page.getByRole('alert').filter({ hasText: 'Page not found' })).toBeVisible();
  // The address is kept: nginx serves the app, which decides what to show
  await expect(page).toHaveURL(/\/no\/such\/page$/);

  await page.getByRole('link', { name: 'Back to home' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('an unknown menu says so', async ({ page }) => {
  await page.goto('/menu/no-such-menu-e2e');

  await expect(page.getByRole('alert').filter({ hasText: 'Menu not found' })).toBeVisible();
});
