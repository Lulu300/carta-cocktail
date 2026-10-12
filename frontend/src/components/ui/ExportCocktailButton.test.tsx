import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import ExportCocktailButton from './ExportCocktailButton';

vi.mock('../../services/api', () => ({
  cocktails: { exportRecipe: vi.fn() },
  publicApi: { exportCocktail: vi.fn() },
}));

import { cocktails as cocktailsApi, publicApi } from '../../services/api';

const piñaColada = {
  filename: 'cocktail-pina-colada.json',
  data: {
    version: 1,
    exportedAt: '2024-01-01',
    cocktail: { name: 'Piña Colada', description: null, notes: null, tags: [], ingredients: [], instructions: [] },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cocktailsApi.exportRecipe).mockResolvedValue(piñaColada);
  vi.mocked(publicApi.exportCocktail).mockResolvedValue(piñaColada);

  // Mock URL.createObjectURL and revokeObjectURL
  global.URL.createObjectURL = vi.fn(() => 'blob:test');
  global.URL.revokeObjectURL = vi.fn();
});

describe('ExportCocktailButton', () => {
  it('should render export button with title', () => {
    render(<ExportCocktailButton cocktailId={1} />);
    expect(screen.getByTitle('cocktails.export')).toBeInTheDocument();
  });

  it('should call exportRecipe on click (admin mode)', async () => {
    const user = userEvent.setup();
    render(<ExportCocktailButton cocktailId={1} />);

    await user.click(screen.getByTitle('cocktails.export'));
    expect(cocktailsApi.exportRecipe).toHaveBeenCalledWith(1);
  });

  it('should download the file under the name given by the server', async () => {
    const user = userEvent.setup();
    render(<ExportCocktailButton cocktailId={1} />);
    const anchor = document.createElement('a');
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    // Spied after the render, so the only element created is the download link
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    await user.click(screen.getByTitle('cocktails.export'));
    createElement.mockRestore();

    expect(anchor.download).toBe('cocktail-pina-colada.json');
    expect(click).toHaveBeenCalled();
  });

  it('should call publicApi.exportCocktail when isPublic', async () => {
    const user = userEvent.setup();
    render(<ExportCocktailButton cocktailId={1} isPublic />);

    await user.click(screen.getByTitle('cocktails.export'));
    expect(publicApi.exportCocktail).toHaveBeenCalledWith(1);
  });

  it('should use custom className when provided', () => {
    render(<ExportCocktailButton cocktailId={1} className="custom-class" />);
    const button = screen.getByTitle('cocktails.export');
    expect(button.className).toContain('custom-class');
  });

  it('should handle export error gracefully', async () => {
    vi.mocked(cocktailsApi.exportRecipe).mockRejectedValue(new Error('fail'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    render(<ExportCocktailButton cocktailId={1} />);
    await user.click(screen.getByTitle('cocktails.export'));

    expect(consoleSpy).toHaveBeenCalledWith('Export failed:', expect.any(Error));
    consoleSpy.mockRestore();
  });
});
