import { expect, test } from '@playwright/test';
import { ADMIN_STATE_FILE, uniqueName } from '../support/api';
import { PHOTO_PNG } from '../support/photo';
import { selectOptionContaining } from '../support/select';

test.use({ storageState: ADMIN_STATE_FILE });

test('the admin creates a category, a bottle and a cocktail that uses it, with a photo', async ({
  page,
}) => {
  const categoryName = uniqueName('Rum');
  const bottleName = uniqueName('Havana');
  const cocktailName = uniqueName('Daiquiri');

  const dialog = page.getByRole('dialog');

  await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'Add Category' }).click();
  await dialog.getByRole('textbox', { name: /^Name/ }).first().fill(categoryName);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  // The lists are paginated and the database keeps the data of earlier runs: search for the new row
  await page.getByLabel('Search categories').fill(categoryName);
  await expect(page.getByRole('cell', { name: categoryName })).toBeVisible();

  await page.goto('/admin/bottles');
  await page.getByRole('button', { name: 'Add Bottle' }).click();
  await dialog.getByLabel('Name (brand)').fill(bottleName);
  await selectOptionContaining(dialog.getByLabel('Category'), categoryName);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByLabel('Search bottles').fill(bottleName);
  await expect(page.getByText(bottleName)).toBeVisible();

  await page.goto('/admin/cocktails/new');
  await page.getByRole('textbox', { name: /^Name/ }).first().fill(cocktailName);
  await page.getByRole('button', { name: 'Add Ingredient', exact: true }).click();
  await page.getByLabel('Source').selectOption({ label: 'Specific Bottle' });
  await selectOptionContaining(page.getByLabel('Specific Bottle'), bottleName);
  await page.getByLabel('Qty').fill('50');
  await page.getByLabel('Unit').selectOption({ index: 1 });
  await page.getByLabel('Image').setInputFiles({
    name: 'daiquiri.png',
    mimeType: 'image/png',
    buffer: PHOTO_PNG,
  });
  await page.getByRole('button', { name: 'Save' }).click();

  // Saving the recipe and uploading the photo end on the list
  await expect(page).toHaveURL(/\/admin\/cocktails$/);
  await page.getByLabel('Search cocktails').fill(cocktailName);

  // The photo went through nginx and the backend, and is served back by both
  const photo = page.getByRole('img', { name: cocktailName });
  await photo.scrollIntoViewIfNeeded();
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
});
