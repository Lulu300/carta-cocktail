import { expect, test } from '@playwright/test';
import { ADMIN_STATE_FILE } from '../support/api';

const REJECTED_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.e30.not-a-valid-signature';

test('an invalid token in localStorage leads back to the sign-in page', async ({ page }) => {
  await page.addInitScript((token) => localStorage.setItem('token', token), REJECTED_TOKEN);

  await page.goto('/admin/bottles');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  // The rejected token is gone: reloading does not loop
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
});

test.describe('a session that ends while the admin works', () => {
  test.use({ storageState: ADMIN_STATE_FILE });

  test('the next request signs the admin out', async ({ page }) => {
    await page.goto('/admin/categories');
    await expect(page.getByRole('heading', { name: 'Categories', level: 1 })).toBeVisible();

    // The server stops accepting the token, as when it expires or "Sign out everywhere" is used
    await page.evaluate((token) => localStorage.setItem('token', token), REJECTED_TOKEN);
    await page.getByRole('link', { name: 'Units' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    // No error banner: the form is the plain sign-in form
    await expect(page.getByText('Invalid email or password')).toHaveCount(0);
  });
});
