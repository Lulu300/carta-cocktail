import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import ExportCocktailButton from './ExportCocktailButton';

vi.mock('../../services/api', () => ({
  cocktails: { exportRecipe: vi.fn() },
  publicApi: { exportCocktail: vi.fn() },
}));

import { cocktails as cocktailsApi, publicApi } from '../../services/api';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cocktailsApi.exportRecipe).mockResolvedValue({
    version: 1,
    exportedAt: '2024-01-01',
    cocktail: { name: 'Mojito', description: null, notes: null, tags: [], ingredients: [], instructions: [] },
  } as never);
  vi.mocked(publicApi.exportCocktail).mockResolvedValue({
    version: 1,
    exportedAt: '2024-01-01',
    cocktail: { name: 'Mojito', description: null, notes: null, tags: [], ingredients: [], instructions: [] },
  } as never);

  // Mock URL.createObjectURL and revokeObjectURL
  global.URL.createObjectURL = vi.fn(() => 'blob:test');
  global.URL.revokeObjectURL = vi.fn();
});

describe('ExportCocktailButton', () => {
  it('should render export button with title', () => {
    render(<ExportCocktailButton cocktailId={1} cocktailName="Mojito" />);
    expect(screen.getByTitle('cocktails.export')).toBeInTheDocument();
  });

  it('should call exportRecipe on click (admin mode)', async () => {
    const user = userEvent.setup();
    render(<ExportCocktailButton cocktailId={1} cocktailName="Mojito" />);

    await user.click(screen.getByTitle('cocktails.export'));
    expect(cocktailsApi.exportRecipe).toHaveBeenCalledWith(1);
  });

  it('should call publicApi.exportCocktail when isPublic', async () => {
    const user = userEvent.setup();
    render(<ExportCocktailButton cocktailId={1} cocktailName="Mojito" isPublic />);

    await user.click(screen.getByTitle('cocktails.export'));
    expect(publicApi.exportCocktail).toHaveBeenCalledWith(1);
  });

  it('should use custom className when provided', () => {
    render(<ExportCocktailButton cocktailId={1} cocktailName="Mojito" className="custom-class" />);
    const button = screen.getByTitle('cocktails.export');
    expect(button.className).toContain('custom-class');
  });

  it('should handle export error gracefully', async () => {
    vi.mocked(cocktailsApi.exportRecipe).mockRejectedValue(new Error('fail'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    render(<ExportCocktailButton cocktailId={1} cocktailName="Mojito" />);
    await user.click(screen.getByTitle('cocktails.export'));

    expect(consoleSpy).toHaveBeenCalledWith('Export failed:', expect.any(Error));
    consoleSpy.mockRestore();
  });
});
