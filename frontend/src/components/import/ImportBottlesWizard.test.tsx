import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import ImportBottlesWizard from './ImportBottlesWizard';
import type { BottleImportPreviewResponse } from '../../types';

vi.mock('../../services/api', () => ({
  bottles: { importPreview: vi.fn(), importConfirm: vi.fn() },
  categories: { list: vi.fn() },
  categoryTypes: { list: vi.fn() },
}));

import { bottles as bottlesApi, categories as categoriesApi, categoryTypes as categoryTypesApi } from '../../services/api';

const samplePreview = {
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
      status: 'missing' as const,
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(categoriesApi.list).mockResolvedValue([]);
  vi.mocked(categoryTypesApi.list).mockResolvedValue([]);
});

async function previewWith(preview: BottleImportPreviewResponse) {
  const user = userEvent.setup();
  vi.mocked(bottlesApi.importPreview).mockResolvedValue(preview);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, new File(['x'], 'bottles.json'));
  await user.click(screen.getByText('bottles.importWizard.next'));
  await screen.findByText('bottles.importWizard.bottlesTitle');
  return user;
}

describe('ImportBottlesWizard', () => {
  it('renders the upload step initially', () => {
    render(<ImportBottlesWizard onClose={() => undefined} />);
    expect(screen.getByText('bottles.importWizard.title')).toBeInTheDocument();
    expect(screen.getByText('bottles.importWizard.dropzone')).toBeInTheDocument();
  });

  it('rejects an unsupported file extension', async () => {
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'bottles.txt', { type: 'text/plain' });
    // fireEvent.change bypasses the input's `accept` attribute filter that
    // userEvent.upload honors, letting us assert the wizard's own validation.
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('bottles.importWizard.invalidFile')).toBeInTheDocument();
  });

  it('accepts a CSV file and shows the Next button', async () => {
    const user = userEvent.setup();
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['name,capacityMl\nHavana,700'], 'bottles.csv', { type: 'text/csv' });
    await user.upload(input, file);
    expect(screen.getByText('bottles.csv')).toBeInTheDocument();
    expect(screen.getByText('bottles.importWizard.next')).toBeInTheDocument();
  });

  it('sends a CSV export, byte order mark included, unchanged to the preview', async () => {
    const user = userEvent.setup();
    vi.mocked(bottlesApi.importPreview).mockResolvedValue(samplePreview);
    render(<ImportBottlesWizard onClose={() => undefined} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['\uFEFFname;capacityMl\nHavana;700'], 'bottles-2026-10-12.csv', { type: 'text/csv' });
    await user.upload(input, file);
    await user.click(screen.getByText('bottles.importWizard.next'));

    await waitFor(() => expect(bottlesApi.importPreview).toHaveBeenCalledWith(file));
    const sent = vi.mocked(bottlesApi.importPreview).mock.calls[0][0];
    expect([...new Uint8Array(await sent.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('transitions to the resolve step after successful preview', async () => {
    const user = userEvent.setup();
    vi.mocked(bottlesApi.importPreview).mockResolvedValue(samplePreview);
    render(<ImportBottlesWizard onClose={() => undefined} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'bottles.json', { type: 'application/json' });
    await user.upload(input, file);
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
    vi.mocked(bottlesApi.importPreview).mockResolvedValue({
      payload: { version: 1, categories: [], bottles: [{ ...samplePreview.payload.bottles[0], categoryName: '' }] },
      categories: [],
      bottles: [{ ref: { ...samplePreview.bottles[0].ref, categoryName: '' }, needsCategory: true, potentialDuplicates: [] }],
      errors: [],
    });
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'bottles.json'));
    await user.click(screen.getByText('bottles.importWizard.next'));

    await waitFor(() => {
      expect(screen.getByText('bottles.importWizard.categoryRequired')).toBeInTheDocument();
    });
  });

  it('shows the duplicate flag when a row has potential duplicates', async () => {
    const user = userEvent.setup();
    vi.mocked(bottlesApi.importPreview).mockResolvedValue({
      ...samplePreview,
      bottles: [{
        ...samplePreview.bottles[0],
        potentialDuplicates: [
          { id: 99, name: 'Havana 7', capacityMl: 700, categoryName: 'Rhum', remainingPercent: 50 },
        ],
      }],
    });
    render(<ImportBottlesWizard onClose={() => undefined} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'bottles.json'));
    await user.click(screen.getByText('bottles.importWizard.next'));

    await waitFor(() => {
      expect(screen.getByText('bottles.importWizard.duplicateFlag')).toBeInTheDocument();
    });
  });

  it('shows preview error when API call fails', async () => {
    const user = userEvent.setup();
    vi.mocked(bottlesApi.importPreview).mockRejectedValue(new Error('Boom'));
    render(<ImportBottlesWizard onClose={() => undefined} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'bottles.json'));
    await user.click(screen.getByText('bottles.importWizard.next'));

    await waitFor(() => {
      expect(screen.getByText('Boom')).toBeInTheDocument();
    });
  });

  it('completes a full import flow and shows success counts', async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    vi.mocked(bottlesApi.importPreview).mockResolvedValue(samplePreview);
    vi.mocked(bottlesApi.importConfirm).mockResolvedValue({
      created: { bottles: 2 },
      duplicatesCreated: 0,
      skippedNoCategory: 0,
    });

    render(<ImportBottlesWizard onClose={() => undefined} onImported={onImported} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'bottles.json'));
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
    vi.mocked(bottlesApi.importPreview).mockResolvedValue(samplePreview);
    render(<ImportBottlesWizard onClose={() => undefined} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'bottles.json'));
    await user.click(screen.getByText('bottles.importWizard.next'));

    await waitFor(() => expect(screen.getByText('Havana 7')).toBeInTheDocument());

    const skipButton = screen.getByText('bottles.importWizard.skip');
    await user.click(skipButton);
    expect(screen.getByText('bottles.importWizard.unskip')).toBeInTheDocument();

    await user.click(screen.getByText('bottles.importWizard.unskip'));
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
    vi.mocked(categoryTypesApi.list).mockResolvedValue([
      { name: 'SPIRIT', color: 'amber', nameTranslations: { fr: 'Spiritueux', en: 'Spirits' } },
      { name: 'LIQUEUR', color: 'purple', nameTranslations: { fr: 'Liqueur', en: 'Liqueur' } },
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
    vi.mocked(categoriesApi.list).mockResolvedValue([{ id: 5, name: 'Rhum ambré' }] as never);
    vi.mocked(bottlesApi.importConfirm).mockResolvedValue({ created: { bottles: 2 }, duplicatesCreated: 1, skippedNoCategory: 1 });
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
    expect(bottlesApi.importConfirm).toHaveBeenCalledWith({
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
    vi.mocked(bottlesApi.importConfirm).mockRejectedValue(new Error('Too many bottles'));
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
