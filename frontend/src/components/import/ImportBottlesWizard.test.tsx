import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import ImportBottlesWizard from './ImportBottlesWizard';

vi.mock('../../services/api', () => ({
  bottles: { importPreview: vi.fn(), importConfirm: vi.fn() },
  categories: { list: vi.fn().mockResolvedValue([]) },
  categoryTypes: { list: vi.fn().mockResolvedValue([]) },
}));

import { bottles as bottlesApi } from '../../services/api';

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
};

beforeEach(() => {
  vi.clearAllMocks();
});

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
});
