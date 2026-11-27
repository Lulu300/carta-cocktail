import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { ADMIN_STATE_FILE, AdminApi, signInAsAdmin, uniqueName } from '../support/api';

test.use({ storageState: ADMIN_STATE_FILE });

test('the admin exports a backup, then restores the exported file', async ({ page, request }) => {
  const api = new AdminApi(request);
  const cocktailName = uniqueName('Backed up');
  await api.createCocktail(cocktailName);

  await page.goto('/admin/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Backup' }).click();
  const archivePath = test.info().outputPath('backup.zip');
  await (await download).saveAs(archivePath);
  // A ZIP archive starts with "PK"
  expect((await readFile(archivePath)).subarray(0, 2).toString()).toBe('PK');

  // The file input is hidden behind the "Select ZIP file" button
  await page.locator('input[type="file"][accept=".zip"]').setInputFiles(archivePath);
  await page.getByRole('button', { name: 'Restore Backup' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore Backup' }).click();

  // A restore ends every session: the admin has to sign in again
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/Backup restored/)).toBeVisible();

  // The journeys after this one need a session: the restored database holds the same admin
  await signInAsAdmin(request);
  expect(await api.listCocktailNames()).toContain(cocktailName);
});
