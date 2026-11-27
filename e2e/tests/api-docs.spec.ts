import { expect, test } from '@playwright/test';
import { ADMIN_STATE_FILE } from '../support/api';

test.use({ storageState: ADMIN_STATE_FILE });

test('the API page shows every route under the CSP of nginx, and tries one with the session', async ({
  page,
  baseURL,
}) => {
  // The viewer is served by nginx with the app's CSP: anything it blocks, or any request to
  // another site, shows here
  const violations: string[] = [];
  const foreignRequests: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      !['data:', 'blob:'].includes(url.protocol) &&
      url.origin !== new URL(baseURL ?? '').origin
    ) {
      foreignRequests.push(request.url());
    }
  });

  await page.goto('/admin/api');
  await expect(page.getByRole('heading', { name: 'API', level: 1, exact: true })).toBeVisible();
  const documentTitle = page.getByRole('heading', { name: 'Carta Cocktail API', level: 1 });
  await expect(documentTitle).toBeVisible();

  // Back from another page, the viewer shows the document again
  const adminNavigation = page.getByRole('navigation', { name: 'Administration' });
  await adminNavigation.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await adminNavigation.getByRole('link', { name: 'API' }).click();
  await expect(documentTitle).toBeVisible();

  // The test request of an admin route goes out with the session token: the route answers 200
  // The viewer renders an operation once it is shown: go to it from its sidebar. The sidebar
  // only opens the first tag ("API tokens" in alphabetical order): open the one of the route.
  await page.getByRole('button', { name: 'Open Group - Auth' }).click();
  await page.getByRole('link', { name: /^Get the signed-in admin/ }).click();
  await page.getByRole('button', { name: 'Test Request (get /api/auth/me)' }).click();
  const answer = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/auth/me',
  );
  await page.getByRole('button', { name: /^Send/ }).first().click();
  expect((await answer).status()).toBe(200);

  expect(violations).toEqual([]);
  expect(foreignRequests).toEqual([]);
});
