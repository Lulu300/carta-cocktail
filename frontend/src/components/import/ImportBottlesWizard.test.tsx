import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestQueryClient, render, screen, waitFor, fireEvent, within } from '../../test/test-utils';
import { qk } from '../../queries/keys';
import userEvent from '@testing-library/user-event';
import ImportBottlesWizard from './ImportBottlesWizard';
import { buildCategory, buildCategoryType } from '../../test/factories';
import { captureRequest, mockApiError, mockApiResponse, mockValidationError } from '../../test/msw/utils';
// The validation messages of a refused import are admin messages, as in the app
import '../../i18n/admin';
import type { BottleImportConfirmResponse, BottleImportPreviewResponse } from '../../types';

const samplePreview: BottleImportPreviewResponse = {
  payload: {
    version: 1,
    categories: [
      { name: 'Rhum', type: 'SPIRIT', desiredStock: 1, minimumPercent: 30, nameTranslations: null },
    ],
    bottles: [
      {
        name: 'Havana 7',
        categoryName: 'Rhum',
        capacityMl: 700,
        remainingPercent: 100,
        alcoholPercentage: 40,
        purchasePrice: 25,
        location: null,
        openedAt: null,
        isApero: false,
        isDigestif: false,
        quantity: 2,
      },
    ],
  },
  categories: [
    {
      ref: { name: 'Rhum', type: 'SPIRIT', desiredStock: 1, minimumPercent: 30, nameTranslations: null },
      existingMatch: null,
      status: 'missing',
    },
  ],
  bottles: [
    {
      ref: {
        name: 'Havana 7',
        categoryName: 'Rhum',
        capacityMl: 700,
        remainingPercent: 100,
        alcoholPercentage: 40,
        purchasePrice: 25,
        location: null,
        openedAt: null,
        isApero: false,
        isDigestif: false,
        quantity: 2,
      },
      needsCategory: false,
      potentialDuplicates: [],
    },
  ],
  errors: [],
};

const importDone: BottleImportConfirmResponse = { created: { bottles: 2 }, duplicatesCreated: 0, skippedNoCategory: 0 };

function mockPreview(preview: BottleImportPreviewResponse) {
  mockApiResponse('post', '/api/bottles/import/preview', preview);
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('No file input');
  return input;
}

beforeEach(() => {
  mockApiResponse('get', '/api/categories', []);
  mockApiResponse('get', '/api/category-types', []);
  mockApiResponse('post', '/api/bottles/import/confirm', importDone);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function previewWith(preview: BottleImportPreviewResponse) {
  const user = userEvent.setup();
  mockPreview(preview);
  await user.upload(fileInput(), new File(['x'], 'bottles.json'));
  await user.click(screen.getByText('Next'));
  await screen.findByText('Bottles');
  return user;
}

describe('ImportBottlesWizard', () => {
  it('renders the upload step initially', async () => {
    const categoriesRead = captureRequest('get', '/api/categories');
    render(<ImportBottlesWizard onClose={() => undefined} />);
    expect(screen.getByText('Import bottles')).toBeInTheDocument();
    expect(screen.getByText('Drop a CSV, JSON, or ZIP file here, or click to browse')).toBeInTheDocument();
    // The lists of the resolve step load in the background
    await waitFor(() => expect(categoriesRead.count()).toBe(1));
  });

  it('rejects an unsupported file extension', async () => {
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const input = fileInput();
    const file = new File(['hello'], 'bottles.txt', { type: 'text/plain' });
    // fireEvent.change bypasses the input's `accept` attribute filter that
    // userEvent.upload honors, letting us assert the wizard's own validation.
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('Unsupported file format. Use .csv, .json, or .zip')).toBeInTheDocument();
  });

  describe('file size', () => {
    // MAX_BOTTLE_IMPORT_BYTES of backend/src/utils/bottlesImport.ts, the largest import file it accepts
    const BACKEND_LIMIT = 10 * 1024 * 1024;

    /** A file of `size` bytes: only its size is read, so no 10 MB buffer is allocated. */
    const fileOfSize = (size: number) => {
      const file = new File(['x'], 'bottles.json', { type: 'application/json' });
      Object.defineProperty(file, 'size', { value: size });
      return file;
    };

    it.each([
      ['one byte under the backend limit', BACKEND_LIMIT - 1],
      ['exactly the backend limit', BACKEND_LIMIT],
    ])('accepts a file of %s', async (_case, size) => {
      const user = userEvent.setup();
      render(<ImportBottlesWizard onClose={() => undefined} />);

      await user.upload(fileInput(), fileOfSize(size));

      expect(screen.getByText('Next')).toBeInTheDocument();
      expect(screen.queryByText('The file or request is too large')).not.toBeInTheDocument();
    });

    it('refuses a file one byte over the backend limit, without sending it', async () => {
      const user = userEvent.setup();
      const preview = captureRequest('post', '/api/bottles/import/preview');
      render(<ImportBottlesWizard onClose={() => undefined} />);

      await user.upload(fileInput(), fileOfSize(BACKEND_LIMIT + 1));

      expect(await screen.findByRole('alert')).toHaveTextContent('The file or request is too large');
      expect(screen.queryByText('Next')).not.toBeInTheDocument();
      expect(preview.count()).toBe(0);
    });

    it('drops the file chosen before when a too large one replaces it', async () => {
      const user = userEvent.setup();
      render(<ImportBottlesWizard onClose={() => undefined} />);
      await user.upload(fileInput(), new File(['x'], 'first.json'));

      await user.upload(fileInput(), fileOfSize(BACKEND_LIMIT + 1));

      expect(await screen.findByText('The file or request is too large')).toBeInTheDocument();
      expect(screen.queryByText('first.json')).not.toBeInTheDocument();
      expect(screen.queryByText('Next')).not.toBeInTheDocument();
    });
  });

  it('accepts a CSV file and shows the Next button', async () => {
    const user = userEvent.setup();
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const file = new File(['name,capacityMl\nHavana,700'], 'bottles.csv', { type: 'text/csv' });
    await user.upload(fileInput(), file);
    expect(screen.getByText('bottles.csv')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('sends a CSV export, byte order mark included, unchanged to the preview', async () => {
    const user = userEvent.setup();
    mockPreview(samplePreview);
    const preview = captureRequest('post', '/api/bottles/import/preview');
    // Node's fetch drops the bytes of a jsdom File: the file is checked where the client adds it to the form
    const append = vi.spyOn(FormData.prototype, 'append');
    render(<ImportBottlesWizard onClose={() => undefined} />);

    const file = new File(['\uFEFFname;capacityMl\nHavana;700'], 'bottles-2026-10-12.csv', { type: 'text/csv' });
    await user.upload(fileInput(), file);
    await user.click(screen.getByText('Next'));

    expect(await preview.body).toContain('name="file"');
    // The very File picked, byte order mark included: not a re-encoded copy
    expect(append).toHaveBeenCalledWith('file', file);
  });

  it('transitions to the resolve step after successful preview', async () => {
    const user = userEvent.setup();
    mockPreview(samplePreview);
    render(<ImportBottlesWizard onClose={() => undefined} />);

    const file = new File(['x'], 'bottles.json', { type: 'application/json' });
    await user.upload(fileInput(), file);
    await user.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeInTheDocument();
    });
    expect(screen.getByText('Rhum')).toBeInTheDocument();
    expect(screen.getByText('Havana 7')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();
  });

  it('flags bottles missing a category with categoryRequired warning', async () => {
    const user = userEvent.setup();
    mockPreview({
      payload: { version: 1, categories: [], bottles: [{ ...samplePreview.payload.bottles[0], categoryName: '' }] },
      categories: [],
      bottles: [{ ref: { ...samplePreview.bottles[0].ref, categoryName: '' }, needsCategory: true, potentialDuplicates: [] }],
      errors: [],
    });
    render(<ImportBottlesWizard onClose={() => undefined} />);
    await user.upload(fileInput(), new File(['x'], 'bottles.json'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Category required for this bottle')).toBeInTheDocument();
    });
  });

  it('shows the duplicate flag when a row has potential duplicates', async () => {
    const user = userEvent.setup();
    mockPreview({
      ...samplePreview,
      bottles: [{
        ...samplePreview.bottles[0],
        potentialDuplicates: [
          { id: 99, name: 'Havana 7', capacityMl: 700, categoryName: 'Rhum', remainingPercent: 50 },
        ],
      }],
    });
    render(<ImportBottlesWizard onClose={() => undefined} />);
    await user.upload(fileInput(), new File(['x'], 'bottles.json'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('1 existing duplicate')).toBeInTheDocument();
    });
  });

  it('shows preview error when API call fails', async () => {
    const user = userEvent.setup();
    mockApiError('post', '/api/bottles/import/preview', 400, 'Boom');
    render(<ImportBottlesWizard onClose={() => undefined} />);

    await user.upload(fileInput(), new File(['x'], 'bottles.json'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Boom')).toBeInTheDocument();
    });
  });

  it('completes a full import flow and shows success counts', async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    mockPreview(samplePreview);

    render(<ImportBottlesWizard onClose={() => undefined} onImported={onImported} />);

    await user.upload(fileInput(), new File(['x'], 'bottles.json'));
    await user.click(screen.getByText('Next'));

    // resolve step
    await waitFor(() => expect(screen.getByText('Rhum')).toBeInTheDocument());
    // The two Next buttons in the wizard share the same label; click the visible one in the footer
    const nextButtons = screen.getAllByText('Next');
    await user.click(nextButtons[nextButtons.length - 1]);

    // confirm step
    await waitFor(() => expect(screen.getByText('Import summary')).toBeInTheDocument());
    await user.click(screen.getByText('Confirm import'));

    await waitFor(() => {
      expect(screen.getByText('2 bottles imported')).toBeInTheDocument();
    });
    expect(onImported).toHaveBeenCalled();
  });

  it('toggles a bottle to skip and back', async () => {
    const user = userEvent.setup();
    mockPreview(samplePreview);
    render(<ImportBottlesWizard onClose={() => undefined} />);

    await user.upload(fileInput(), new File(['x'], 'bottles.json'));
    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Havana 7')).toBeInTheDocument());

    const skipButton = screen.getByRole('button', { name: /^Skip .+$/ });
    expect(skipButton).toHaveAttribute('aria-pressed', 'false');
    await user.click(skipButton);
    const restoreButton = screen.getByRole('button', { name: /^Restore .+$/ });
    expect(restoreButton).toHaveAttribute('aria-pressed', 'true');
    expect(restoreButton).toHaveTextContent('Restore');

    await user.click(restoreButton);
    expect(screen.getByText('Skip')).toBeInTheDocument();
  });

  it('lists the rows the backend left out, with their line and reason', async () => {
    render(<ImportBottlesWizard onClose={() => undefined} />);
    await previewWith({
      ...samplePreview,
      errors: [
        { source: 'bottles', line: 3, field: 'capacityMl', code: 'required' },
        { source: 'categories', line: 2, field: 'minimumPercent', code: 'outOfRange' },
      ],
    });

    expect(screen.getByText('2 rows left out of the import')).toBeInTheDocument();
    expect(screen.getAllByText(/^.+, line .+:$/)).toHaveLength(2);
    expect(screen.getByText(/^.+ is missing$/)).toBeInTheDocument();
    expect(screen.getByText(/^.+ is out of range$/)).toBeInTheDocument();
  });

  it('shows no error list when every row is valid', async () => {
    render(<ImportBottlesWizard onClose={() => undefined} />);
    await previewWith(samplePreview);

    expect(screen.queryByText('2 rows left out of the import')).not.toBeInTheDocument();
    expect(screen.queryByText('2 values to check, imported as they are')).not.toBeInTheDocument();
  });

  it('lists the values on several lines without blocking the import, and sends the payload unchanged', async () => {
    const confirmed = captureRequest('post', '/api/bottles/import/confirm');
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith({
      ...samplePreview,
      warnings: [
        { source: 'bottles', line: 2, field: 'name', code: 'lineBreak' },
        { source: 'bottles', line: 2, field: 'location', code: 'lineBreak' },
      ],
    });

    const warnings = screen.getByRole('status');
    expect(within(warnings).getByText('2 values to check, imported as they are')).toBeInTheDocument();
    expect(within(warnings).getAllByText(/^.+ spans several lines$/)).toHaveLength(2);
    await user.click(screen.getAllByText('Next').at(-1)!);
    await user.click(screen.getByText('Confirm import'));

    await screen.findByText('2 bottles imported');
    expect(await confirmed.body).toMatchObject({ payload: samplePreview.payload });
  });

  it('edits a category to create, with the types in the interface language', async () => {
    mockApiResponse('get', '/api/category-types', [
      buildCategoryType({ name: 'SPIRIT', nameTranslations: { fr: 'Spiritueux', en: 'Spirits' } }),
      buildCategoryType({ name: 'LIQUEUR', nameTranslations: { fr: 'Liqueur', en: 'Liqueur' } }),
    ]);
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith(samplePreview);

    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Rum');
    expect(name).toHaveValue('Rum');

    expect(await screen.findByRole('option', { name: 'Spirits' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Type'), 'Liqueur');
    expect(screen.getByLabelText('Type')).toHaveValue('LIQUEUR');
  });

  it('blocks the import while a category to create has the type with an empty name', async () => {
    mockApiResponse('get', '/api/category-types', [
      buildCategoryType({ name: 'SPIRIT' }),
      buildCategoryType({ name: '' }),
      buildCategoryType({ name: '   ' }),
    ]);
    const confirmed = captureRequest('post', '/api/bottles/import/confirm');
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith(samplePreview);
    const next = screen.getAllByText('Next').at(-1)!.closest('button')!;
    const typeSelect = screen.getByLabelText('Type');
    await screen.findByRole('option', { name: '(no name)' });

    await user.selectOptions(typeSelect, '');
    expect(typeSelect).toHaveAttribute('aria-invalid', 'true');
    expect(typeSelect).toHaveAccessibleDescription('Choose or enter a type with a name.');
    expect(next).toBeDisabled();
    expect(screen.getByText('1 category to create has no type with a name: choose another type.')).toBeInTheDocument();

    // An existing type made only of spaces is kept as picked, as the backend does
    await user.selectOptions(typeSelect, '   ');
    expect(typeSelect).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Choose or enter a type with a name.')).not.toBeInTheDocument();
    expect(screen.queryByText('1 category to create has no type with a name: choose another type.')).not.toBeInTheDocument();
    await user.click(next);
    await user.click(screen.getByText('Confirm import'));

    await screen.findByText('2 bottles imported');
    expect(await confirmed.body).toMatchObject({
      resolutions: { categories: { rhum: { action: 'create', data: { type: '   ' } } } },
    });
  });

  it('flags a file type made only of invisible characters as soon as the step opens', async () => {
    // The file reader trims each cell, and trimming keeps a zero-width space
    const invisibleType = '​';
    mockApiResponse('get', '/api/category-types', [buildCategoryType({ name: 'SPIRIT' })]);
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith({
      ...samplePreview,
      categories: [{ ...samplePreview.categories[0], ref: { ...samplePreview.categories[0].ref, type: invisibleType } }],
    });
    const next = screen.getAllByText('Next').at(-1)!.closest('button')!;
    const typeSelect = screen.getByLabelText('Type');
    await screen.findByRole('option', { name: 'SPIRIT' });

    expect(typeSelect).toHaveValue(invisibleType);
    expect(typeSelect).toHaveAccessibleDescription('Choose or enter a type with a name.');
    expect(screen.getByText('1 category to create has no type with a name: choose another type.')).toBeInTheDocument();
    expect(next).toBeDisabled();

    await user.selectOptions(typeSelect, 'SPIRIT');
    expect(screen.queryByText('1 category to create has no type with a name: choose another type.')).not.toBeInTheDocument();
    expect(next).toBeEnabled();
  });

  it('disables the import when the type picked disappears from the list before confirming', async () => {
    const invisibleType = '​';
    // An existing type is kept as picked, even one made only of invisible characters
    mockApiResponse('get', '/api/category-types', [buildCategoryType({ name: invisibleType })]);
    const queryClient = createTestQueryClient();
    render(<ImportBottlesWizard onClose={() => undefined} />, { queryClient });
    const user = await previewWith({
      ...samplePreview,
      categories: [{ ...samplePreview.categories[0], ref: { ...samplePreview.categories[0].ref, type: invisibleType } }],
    });
    await waitFor(() => expect(screen.getByLabelText('Type')).not.toHaveAttribute('aria-invalid'));
    await user.click(screen.getAllByText('Next').at(-1)!);
    const importButton = screen.getByText('Confirm import').closest('button')!;
    expect(importButton).toBeEnabled();

    // The type is deleted elsewhere: the import would now create a blank type, which the backend refuses
    mockApiResponse('get', '/api/category-types', [buildCategoryType({ name: 'SPIRIT' })]);
    await queryClient.invalidateQueries({ queryKey: qk.categoryTypes });

    await waitFor(() => expect(importButton).toBeDisabled());
    expect(screen.getByText('1 category to create has no type with a name: choose another type.')).toBeInTheDocument();
  });

  it('maps a category to the existing match and offers the existing categories for each row', async () => {
    mockApiResponse('get', '/api/categories', [buildCategory({ id: 5, name: 'Rhum ambré' })]);
    mockApiResponse('post', '/api/bottles/import/confirm', { created: { bottles: 2 }, duplicatesCreated: 1, skippedNoCategory: 1 });
    const confirmed = captureRequest('post', '/api/bottles/import/confirm');
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith({
      ...samplePreview,
      categories: [{ ...samplePreview.categories[0], existingMatch: { id: 4, name: 'Rhum', type: 'SPIRIT', desiredStock: 1 }, status: 'matched' }],
    });

    await user.click(screen.getByText('Create'));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    await user.click(screen.getByText('Use existing'));
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Category'), await screen.findByRole('option', { name: 'Rhum ambré' }));
    await user.click(screen.getAllByText('Next').at(-1)!);
    await user.click(screen.getByText('Confirm import'));

    await screen.findByText('2 bottles imported');
    expect(await confirmed.body).toEqual({
      payload: samplePreview.payload,
      resolutions: { categories: { rhum: { action: 'use_existing', existingId: 4 } }, bottles: { 0: { action: 'import', categoryId: 5 } } },
    });
    expect(screen.getByText('1 duplicate added in addition to existing bottles')).toBeInTheDocument();
    expect(screen.getByText('1 row skipped due to missing category')).toBeInTheDocument();
  });

  it('blocks the next step while a row has no category, and warns about duplicates', async () => {
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith({
      ...samplePreview,
      bottles: [
        { ref: { ...samplePreview.bottles[0].ref, categoryName: '' }, needsCategory: true, potentialDuplicates: [] },
        {
          ...samplePreview.bottles[0],
          potentialDuplicates: [{ id: 99, name: 'Havana 7', capacityMl: 700, categoryName: 'Rhum', remainingPercent: 50 }],
        },
      ],
    });

    const next = screen.getAllByText('Next').at(-1)!.closest('button')!;
    expect(next).toBeDisabled();

    // Skipping the row without a category unblocks the import
    await user.click(screen.getAllByText('Skip')[0]);
    await user.click(next);

    expect(screen.getByText('Import summary')).toBeInTheDocument();
    expect(screen.getByText('Potential duplicates detected')).toBeInTheDocument();
    expect(screen.queryByText('1 bottle has no category. Go back and assign one, or skip it.')).not.toBeInTheDocument();

    await user.click(screen.getByText('Back'));
    await user.click(screen.getByText('Back'));
    expect(screen.getByText('Drop a CSV, JSON, or ZIP file here, or click to browse')).toBeInTheDocument();
  });

  it('shows the error screen when the confirmation fails, then closes', async () => {
    const onClose = vi.fn();
    mockApiError('post', '/api/bottles/import/confirm', 400, 'Too many bottles');
    render(<ImportBottlesWizard onClose={onClose} />);
    const user = await previewWith(samplePreview);

    await user.click(screen.getAllByText('Next').at(-1)!);
    await user.click(screen.getByText('Confirm import'));

    expect(await screen.findByText('Too many bottles')).toBeInTheDocument();
    expect(screen.getByText('Import error')).toBeInTheDocument();
    await user.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('names the row and the field when the confirmation is refused by the validation', async () => {
    mockValidationError('post', '/api/bottles/import/confirm', [
      { path: 'body.payload.bottles.1.capacityMl', code: 'too_small' },
    ]);
    render(<ImportBottlesWizard onClose={vi.fn()} />);
    const user = await previewWith(samplePreview);

    await user.click(screen.getAllByText('Next').at(-1)!);
    await user.click(screen.getByText('Confirm import'));

    expect(await screen.findByText('Row 2, Capacity (ml): value too small')).toBeInTheDocument();
    expect(screen.queryByText('Validation error')).not.toBeInTheDocument();
  });
});

// Data older than C-07 can hold two categories that differ only by case: the backend refuses to
// create a third one, or to guess which one a row means (C-19)
describe('ImportBottlesWizard - categories equal ignoring case', () => {
  const rhum = buildCategory({ id: 1, name: 'Rhum' });
  const upperRhum = buildCategory({ id: 2, name: 'RHUM' });
  const fileCategory = { ...samplePreview.categories[0].ref, name: 'rhum' };
  const ambiguousPreview: BottleImportPreviewResponse = {
    ...samplePreview,
    payload: { ...samplePreview.payload, categories: [fileCategory] },
    categories: [{
      ref: fileCategory,
      existingMatch: null,
      status: 'ambiguous',
      ambiguousMatches: [{ id: 1, name: 'Rhum', type: 'SPIRIT', desiredStock: 1 }, { id: 2, name: 'RHUM', type: 'SPIRIT', desiredStock: 1 }],
    }],
    bottles: [{ ...samplePreview.bottles[0], ref: { ...samplePreview.bottles[0].ref, categoryName: 'rhum' } }],
  };

  beforeEach(() => {
    mockApiResponse('get', '/api/categories', [rhum, upperRhum]);
  });

  function nextButton() {
    return screen.getAllByText('Next').at(-1)!.closest('button')!;
  }

  it('blocks the import until one of the matches is picked, then sends it', async () => {
    const confirmed = captureRequest('post', '/api/bottles/import/confirm');
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith(ambiguousPreview);

    expect(screen.getByText('Several matches')).toBeInTheDocument();
    expect(screen.getByText(/^Several existing ones differ only by case: .+\. Use one of them, or create it under another name\.$/)).toBeInTheDocument();
    expect(screen.getByText('1 category matches several existing ones that differ only by case: use one of them, or create it under another name.')).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
    const matchSelect = screen.getByLabelText('Existing entry to use');
    expect(matchSelect).toHaveValue('');

    // The row's `rhum` holds no category yet
    expect(screen.getByLabelText('Category')).toHaveValue('');

    await user.selectOptions(matchSelect, 'RHUM');
    expect(screen.queryByText('1 category matches several existing ones that differ only by case: use one of them, or create it under another name.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toHaveDisplayValue('RHUM');
    await user.click(nextButton());
    await user.click(screen.getByText('Confirm import'));

    await screen.findByText('2 bottles imported');
    expect(await confirmed.body).toMatchObject({ resolutions: { categories: { rhum: { action: 'use_existing', existingId: 2 } } } });
  });

  // A row naming `Rhum` would go in `RHUM`, resolved for the file's `rhum`: the row sends the id (C-68)
  it('puts a row in the match the file category is not resolved to, by its id', async () => {
    const confirmed = captureRequest('post', '/api/bottles/import/confirm');
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith(ambiguousPreview);
    await user.selectOptions(screen.getByLabelText('Existing entry to use'), 'RHUM');

    const rowCategory = screen.getByLabelText('Category');
    expect(within(rowCategory).getAllByRole('option').map((option) => option.textContent)).toEqual([
      '— Pick a category —',
      'Rhum',
      'RHUM',
    ]);
    await user.selectOptions(rowCategory, 'Rhum');
    expect(rowCategory).toHaveDisplayValue('Rhum');
    await user.click(nextButton());
    await user.click(screen.getByText('Confirm import'));

    await screen.findByText('2 bottles imported');
    expect(await confirmed.body).toMatchObject({ resolutions: { bottles: { 0: { action: 'import', categoryId: 1 } } } });
  });

  it('creates it only under a name the matches do not hold', async () => {
    const confirmed = captureRequest('post', '/api/bottles/import/confirm');
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith(ambiguousPreview);

    await user.click(screen.getByText('Create'));
    const name = screen.getByLabelText('Name');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(/^Matches .+, which differ only by case: use one of them, or change this value\.$/);
    expect(screen.getByText('1 category matches several existing ones that differ only by case: use one of them, or create it under another name.')).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();

    // Back to "use existing": still no match picked
    await user.click(screen.getByText('Use existing'));
    expect(screen.getByLabelText('Existing entry to use')).toHaveValue('');
    expect(nextButton()).toBeDisabled();

    await user.click(screen.getByText('Create'));
    await user.type(screen.getByLabelText('Name'), ' blanc');
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid');
    await user.click(nextButton());
    expect(screen.getByText('Categories to create').nextSibling).toHaveTextContent('1');
    await user.click(screen.getByText('Confirm import'));

    await screen.findByText('2 bottles imported');
    expect(await confirmed.body).toMatchObject({
      resolutions: { categories: { rhum: { action: 'create', data: { name: 'rhum blanc' } } } },
    });
  });

  it('says that a category to create that exists ignoring case is used as it is, and not created', async () => {
    mockApiResponse('get', '/api/categories', [rhum]);
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith({
      ...ambiguousPreview,
      categories: [{ ref: fileCategory, existingMatch: { id: 1, name: 'Rhum', type: 'SPIRIT', desiredStock: 1 }, status: 'matched' }],
    });

    await user.click(screen.getByText('Create'));
    const name = screen.getByLabelText('Name');
    expect(await screen.findByText(/^Already exists as ".+": it will be used as it is, and the other fields are ignored\.$/)).toBeInTheDocument();
    expect(name).toHaveAccessibleDescription(/^Already exists as ".+": it will be used as it is, and the other fields are ignored\.$/);
    expect(name).not.toHaveAttribute('aria-invalid');

    await user.click(nextButton());
    expect(screen.getByText('Categories to create').nextSibling).toHaveTextContent('0');
  });

  it('shows each row in the category the confirmation puts it in', async () => {
    mockApiResponse('get', '/api/categories', [rhum]);
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith({
      ...ambiguousPreview,
      categories: [{ ref: fileCategory, existingMatch: { id: 1, name: 'Rhum', type: 'SPIRIT', desiredStock: 1 }, status: 'matched' }],
    });
    const rowCategory = screen.getByLabelText('Category');
    // The row sends the file's `rhum`, which the confirmation puts in `Rhum`
    expect(rowCategory).toHaveDisplayValue('Rhum');

    // Created under the name of the file, the category is the existing one: nothing to create
    await user.click(screen.getByText('Create'));
    expect(rowCategory).toHaveDisplayValue('Rhum');
    expect(within(rowCategory).queryByRole('option', { name: /will be created/ })).not.toBeInTheDocument();

    // Renamed, it is created, and the row goes in it
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Rhum agricole');
    expect(rowCategory).toHaveDisplayValue('Rhum agricole (will be created)');
    expect(within(rowCategory).getAllByRole('option').map((option) => option.textContent)).toEqual([
      '— Pick a category —',
      'Rhum',
      'Rhum agricole (will be created)',
    ]);
  });

  it('puts a row in the existing category of the name the file category is created away from', async () => {
    mockApiResponse('get', '/api/categories', [rhum]);
    const confirmed = captureRequest('post', '/api/bottles/import/confirm');
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith({
      ...ambiguousPreview,
      categories: [{ ref: fileCategory, existingMatch: { id: 1, name: 'Rhum', type: 'SPIRIT', desiredStock: 1 }, status: 'matched' }],
      bottles: [ambiguousPreview.bottles[0], ambiguousPreview.bottles[0]],
    });
    await user.click(screen.getByText('Create'));
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Rhum agricole');

    const [movedRow, keptRow] = screen.getAllByLabelText('Category');
    await user.selectOptions(movedRow, 'Rhum');
    expect(movedRow).toHaveDisplayValue('Rhum');
    expect(keptRow).toHaveDisplayValue('Rhum agricole (will be created)');
    await user.click(nextButton());
    await user.click(screen.getByText('Confirm import'));

    await screen.findByText('2 bottles imported');
    expect(await confirmed.body).toMatchObject({
      resolutions: { bottles: { 0: { action: 'import', categoryId: 1 }, 1: { action: 'import', categoryName: 'rhum' } } },
    });
  });

  it('shows a row in the existing category its file category is created as, whose name another file category holds', async () => {
    const gin = buildCategory({ id: 3, name: 'Gin' });
    mockApiResponse('get', '/api/categories', [rhum, gin]);
    const ginCategory = { ...fileCategory, name: 'gin' };
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith({
      ...ambiguousPreview,
      payload: { ...ambiguousPreview.payload, categories: [fileCategory, ginCategory] },
      categories: [
        { ref: fileCategory, existingMatch: { id: 1, name: 'Rhum', type: 'SPIRIT', desiredStock: 1 }, status: 'matched' },
        { ref: ginCategory, existingMatch: { id: 3, name: 'Gin', type: 'SPIRIT', desiredStock: 1 }, status: 'matched' },
      ],
      bottles: [{ ...ambiguousPreview.bottles[0], ref: { ...ambiguousPreview.bottles[0].ref, categoryName: 'gin' } }],
    });

    const [createRhum, createGin] = screen.getAllByText('Create');
    await user.click(createRhum);
    await user.click(createGin);
    const [rhumName, ginName] = screen.getAllByLabelText('Name');
    await user.clear(rhumName);
    await user.type(rhumName, 'Rhum agricole');
    await user.clear(ginName);
    await user.type(ginName, 'Rhum');

    // The confirmation finds `Rhum` for the `gin` category to create, and puts the row there
    expect(screen.getByLabelText('Category')).toHaveDisplayValue('Rhum');
  });
});
