import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL } from '../support/api';

test('the admin signs in, then signs out', async ({ page }) => {
  // An admin page without a session leads to the sign-in page
  await page.goto('/admin/cocktails');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(process.env.ADMIN_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // ...and signing in brings the admin back to the page that was asked for
  await expect(page).toHaveURL(/\/admin\/cocktails$/);
  await expect(page.getByRole('heading', { name: 'Cocktails', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login$/);
});

test('a wrong password is refused with a message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByText('Invalid email or password')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
