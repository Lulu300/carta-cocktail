import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import ImportBottlesWizard from './ImportBottlesWizard';
import { buildCategory, buildCategoryType } from '../../test/factories';
import { captureRequest, mockApiError, mockApiResponse } from '../../test/msw/utils';
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
  await user.click(screen.getByText('bottles.importWizard.next'));
  await screen.findByText('bottles.importWizard.bottlesTitle');
  return user;
}

describe('ImportBottlesWizard', () => {
  it('renders the upload step initially', async () => {
    const categoriesRead = captureRequest('get', '/api/categories');
    render(<ImportBottlesWizard onClose={() => undefined} />);
    expect(screen.getByText('bottles.importWizard.title')).toBeInTheDocument();
    expect(screen.getByText('bottles.importWizard.dropzone')).toBeInTheDocument();
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
    expect(await screen.findByText('bottles.importWizard.invalidFile')).toBeInTheDocument();
  });

  it('accepts a CSV file and shows the Next button', async () => {
    const user = userEvent.setup();
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const file = new File(['name,capacityMl\nHavana,700'], 'bottles.csv', { type: 'text/csv' });
    await user.upload(fileInput(), file);
    expect(screen.getByText('bottles.csv')).toBeInTheDocument();
    expect(screen.getByText('bottles.importWizard.next')).toBeInTheDocument();
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
    await user.click(screen.getByText('bottles.importWizard.next'));

    expect(await preview.body).toContain('name="file"');
    expect(append).toHaveBeenCalledWith('file', file);
    expect([...new Uint8Array(await file.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('transitions to the resolve step after successful preview', async () => {
    const user = userEvent.setup();
    mockPreview(samplePreview);
    render(<ImportBottlesWizard onClose={() => undefined} />);

    const file = new File(['x'], 'bottles.json', { type: 'application/json' });
    await user.upload(fileInput(), file);
    await user.click(screen.getByText('bottles.importWizard.next'));

    await waitFor(() => {
      expect(screen.getByText('bottles.importWizard.categoriesTitle')).toBeInTheDocument();
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
    await user.click(screen.getByText('bottles.importWizard.next'));

    await waitFor(() => {
      expect(screen.getByText('bottles.importWizard.categoryRequired')).toBeInTheDocument();
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
    await user.click(screen.getByText('bottles.importWizard.next'));

    await waitFor(() => {
      expect(screen.getByText('bottles.importWizard.duplicateFlag')).toBeInTheDocument();
    });
  });

  it('shows preview error when API call fails', async () => {
    const user = userEvent.setup();
    mockApiError('post', '/api/bottles/import/preview', 400, 'Boom');
    render(<ImportBottlesWizard onClose={() => undefined} />);

    await user.upload(fileInput(), new File(['x'], 'bottles.json'));
    await user.click(screen.getByText('bottles.importWizard.next'));

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
    await user.click(screen.getByText('bottles.importWizard.next'));

    // resolve step
    await waitFor(() => expect(screen.getByText('Rhum')).toBeInTheDocument());
    // The two Next buttons in the wizard share the same label; click the visible one in the footer
    const nextButtons = screen.getAllByText('bottles.importWizard.next');
    await user.click(nextButtons[nextButtons.length - 1]);

    // confirm step
    await waitFor(() => expect(screen.getByText('bottles.importWizard.confirmTitle')).toBeInTheDocument());
    await user.click(screen.getByText('bottles.importWizard.confirmImport'));

    await waitFor(() => {
      expect(screen.getByText('bottles.importWizard.successCount')).toBeInTheDocument();
    });
    expect(onImported).toHaveBeenCalled();
  });

  it('toggles a bottle to skip and back', async () => {
    const user = userEvent.setup();
    mockPreview(samplePreview);
    render(<ImportBottlesWizard onClose={() => undefined} />);

    await user.upload(fileInput(), new File(['x'], 'bottles.json'));
    await user.click(screen.getByText('bottles.importWizard.next'));

    await waitFor(() => expect(screen.getByText('Havana 7')).toBeInTheDocument());

    const skipButton = screen.getByRole('button', { name: 'bottles.importWizard.skipRow' });
    expect(skipButton).toHaveAttribute('aria-pressed', 'false');
    await user.click(skipButton);
    const restoreButton = screen.getByRole('button', { name: 'bottles.importWizard.unskipRow' });
    expect(restoreButton).toHaveAttribute('aria-pressed', 'true');
    expect(restoreButton).toHaveTextContent('bottles.importWizard.unskip');

    await user.click(restoreButton);
    expect(screen.getByText('bottles.importWizard.skip')).toBeInTheDocument();
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

    expect(screen.getByText('bottles.importWizard.rowErrors.title')).toBeInTheDocument();
    expect(screen.getAllByText('bottles.importWizard.rowErrors.position')).toHaveLength(2);
    expect(screen.getByText('bottles.importWizard.rowErrors.code.required')).toBeInTheDocument();
    expect(screen.getByText('bottles.importWizard.rowErrors.code.outOfRange')).toBeInTheDocument();
  });

  it('shows no error list when every row is valid', async () => {
    render(<ImportBottlesWizard onClose={() => undefined} />);
    await previewWith(samplePreview);

    expect(screen.queryByText('bottles.importWizard.rowErrors.title')).not.toBeInTheDocument();
  });

  it('edits a category to create, with the types in the interface language', async () => {
    mockApiResponse('get', '/api/category-types', [
      buildCategoryType({ name: 'SPIRIT', nameTranslations: { fr: 'Spiritueux', en: 'Spirits' } }),
      buildCategoryType({ name: 'LIQUEUR', nameTranslations: { fr: 'Liqueur', en: 'Liqueur' } }),
    ]);
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const user = await previewWith(samplePreview);

    const name = screen.getByLabelText('categories.name');
    await user.clear(name);
    await user.type(name, 'Rum');
    expect(name).toHaveValue('Rum');

    expect(await screen.findByRole('option', { name: 'Spirits' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('categories.type'), 'Liqueur');
    expect(screen.getByLabelText('categories.type')).toHaveValue('LIQUEUR');
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

    await user.click(screen.getByText('bottles.importWizard.createNew'));
    expect(screen.getByLabelText('categories.name')).toBeInTheDocument();
    await user.click(screen.getByText('bottles.importWizard.useExisting'));
    expect(screen.queryByLabelText('categories.name')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('bottles.category'), await screen.findByRole('option', { name: 'Rhum ambré' }));
    await user.click(screen.getAllByText('bottles.importWizard.next').at(-1)!);
    await user.click(screen.getByText('bottles.importWizard.confirmImport'));

    await screen.findByText('bottles.importWizard.successCount');
    expect(await confirmed.body).toEqual({
      payload: samplePreview.payload,
      resolutions: { categories: { rhum: { action: 'use_existing', existingId: 4 } }, bottles: { 0: { action: 'import', categoryName: 'Rhum ambré' } } },
    });
    expect(screen.getByText('bottles.importWizard.duplicatesCreatedRecap')).toBeInTheDocument();
    expect(screen.getByText('bottles.importWizard.skippedRecap')).toBeInTheDocument();
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

    const next = screen.getAllByText('bottles.importWizard.next').at(-1)!.closest('button')!;
    expect(next).toBeDisabled();

    // Skipping the row without a category unblocks the import
    await user.click(screen.getAllByText('bottles.importWizard.skip')[0]);
    await user.click(next);

    expect(screen.getByText('bottles.importWizard.confirmTitle')).toBeInTheDocument();
    expect(screen.getByText('bottles.importWizard.duplicatesWarningTitle')).toBeInTheDocument();
    expect(screen.queryByText('bottles.importWizard.unresolvedWarning')).not.toBeInTheDocument();

    await user.click(screen.getByText('bottles.importWizard.back'));
    await user.click(screen.getByText('bottles.importWizard.back'));
    expect(screen.getByText('bottles.importWizard.dropzone')).toBeInTheDocument();
  });

  it('shows the error screen when the confirmation fails, then closes', async () => {
    const onClose = vi.fn();
    mockApiError('post', '/api/bottles/import/confirm', 400, 'Too many bottles');
    render(<ImportBottlesWizard onClose={onClose} />);
    const user = await previewWith(samplePreview);

    await user.click(screen.getAllByText('bottles.importWizard.next').at(-1)!);
    await user.click(screen.getByText('bottles.importWizard.confirmImport'));

    expect(await screen.findByText('Too many bottles')).toBeInTheDocument();
    expect(screen.getByText('bottles.importWizard.error')).toBeInTheDocument();
    await user.click(screen.getByText('bottles.importWizard.close'));
    expect(onClose).toHaveBeenCalled();
  });
});
