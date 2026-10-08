import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import CocktailFormPage from './CocktailFormPage';

const mockNavigate = vi.fn();
let mockParams: { id?: string } = {};

vi.mock('../../services/api', () => ({
  cocktails: {
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    uploadImage: vi.fn(),
  },
  categories: {
    list: vi.fn(),
  },
  bottles: {
    list: vi.fn(),
  },
  ingredients: {
    list: vi.fn(),
    create: vi.fn(),
  },
  units: {
    list: vi.fn(),
  },
}));

vi.mock('../../hooks/useLocalizedName', () => ({
  useLocalizedName: () => (entity: { name?: string }) => entity?.name || '',
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => mockParams,
    useNavigate: () => mockNavigate,
  };
});

import { cocktails, categories, bottles, ingredients, units } from '../../services/api';
import type { Cocktail } from '../../types';

const createdCocktail: Cocktail = {
  id: 42,
  name: 'Mojito',
  description: null,
  notes: null,
  imagePath: null,
  tags: '',
  isAvailable: true,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  ingredients: [],
  instructions: [],
};

function getNameInput(container: HTMLElement) {
  return container.querySelector('input[required]') as HTMLInputElement;
}

describe('CocktailFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = {};
    vi.mocked(categories.list).mockResolvedValue([
      {
        id: 1,
        name: 'Bourbon',
        type: 'SPIRIT',
        desiredStock: 1,
        minimumPercent: 0,
        createdAt: '2024-01-01',
      },
    ]);
    vi.mocked(bottles.list).mockResolvedValue([
      {
        id: 1,
        name: 'Buffalo Trace',
        categoryId: 1,
        capacityMl: 700,
        remainingPercent: 100,
        purchasePrice: null,
        openedAt: null,
        alcoholPercentage: null,
        location: null,
        isApero: false,
        isDigestif: false,
        createdAt: '2024-01-01',
      },
    ]);
    vi.mocked(ingredients.list).mockResolvedValue([
      {
        id: 1,
        name: 'Sugar syrup',
        icon: null,
        isAvailable: true,
        createdAt: '2024-01-01',
      },
    ]);
    vi.mocked(units.list).mockResolvedValue([
      {
        id: 1,
        name: 'Millilitre',
        abbreviation: 'ml',
        conversionFactorToMl: 1,
      },
    ]);
  });

  it('uses the responsive grid layout for ingredient rows', async () => {
    const user = userEvent.setup();

    render(<CocktailFormPage />);

    await waitFor(() => {
      expect(screen.getByText('cocktails.addIngredient')).toBeInTheDocument();
    });

    await user.click(screen.getByText('cocktails.addIngredient'));

    const ingredientFields = screen.getByTestId('ingredient-fields-0');
    expect(ingredientFields.className).toContain('md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_5.5rem_5.5rem_auto]');
  });

  it('creates the cocktail only once on a fast double click', async () => {
    const user = userEvent.setup();
    let resolveCreate: (value: Cocktail) => void = () => {};
    vi.mocked(cocktails.create).mockReturnValue(
      new Promise<Cocktail>((resolve) => { resolveCreate = resolve; }),
    );
    const { container } = render(<CocktailFormPage />);

    await user.type(getNameInput(container), 'Mojito');
    const saveButton = screen.getByRole('button', { name: 'common.save' });
    await user.dblClick(saveButton);

    expect(cocktails.create).toHaveBeenCalledTimes(1);
    expect(saveButton).toBeDisabled();

    resolveCreate(createdCocktail);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/cocktails');
    });
  });

  it('shows the server error and keeps the form usable when saving fails', async () => {
    const user = userEvent.setup();
    vi.mocked(cocktails.create).mockRejectedValue(new Error('Name is required'));
    const { container } = render(<CocktailFormPage />);

    await user.type(getNameInput(container), 'Mojito');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.save' })).toBeEnabled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('switches to edit mode when the image upload fails after creation', async () => {
    const user = userEvent.setup();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    vi.mocked(cocktails.create).mockResolvedValue(createdCocktail);
    vi.mocked(cocktails.update).mockResolvedValue(createdCocktail);
    vi.mocked(cocktails.get).mockResolvedValue(createdCocktail);
    vi.mocked(cocktails.uploadImage)
      .mockRejectedValueOnce(new Error('Upload failed'))
      .mockResolvedValueOnce({ ...createdCocktail, imagePath: 'mojito.jpg' });
    mockNavigate.mockImplementation((path: string) => {
      mockParams = { id: path.split('/').pop() };
    });

    const { container, rerender } = render(<CocktailFormPage />);
    await user.type(getNameInput(container), 'Mojito');
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(['img'], 'mojito.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith('/admin/cocktails/42', { replace: true });

    // The router re-renders the same page with the new id
    rerender(<CocktailFormPage />);
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => {
      expect(cocktails.update).toHaveBeenCalledWith(42, expect.objectContaining({ name: 'Mojito' }));
    });
    expect(cocktails.create).toHaveBeenCalledTimes(1);
    expect(cocktails.uploadImage).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenLastCalledWith('/admin/cocktails');
  });
});
