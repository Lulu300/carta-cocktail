import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import { mockDownload } from '../../test/download';
import { server } from '../../test/msw/server';
import { captureRequest, mockApiError } from '../../test/msw/utils';
import type { CocktailExportFormat } from '../../types';
import ExportCocktailButton from './ExportCocktailButton';

const piñaColada: CocktailExportFormat = {
  version: 1,
  exportedAt: '2024-01-01',
  cocktail: { name: 'Piña Colada', description: null, notes: null, tags: [], ingredients: [], instructions: [] },
};

/** The export endpoints name the file in Content-Disposition, accents removed. */
function mockExport(path: string) {
  server.use(
    http.get(path, () =>
      HttpResponse.json(piñaColada, {
        headers: { 'Content-Disposition': 'attachment; filename="cocktail-pina-colada.json"' },
      }),
    ),
  );
}

let downloads: string[];

beforeEach(() => {
  downloads = mockDownload();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExportCocktailButton', () => {
  it('downloads the admin export under the name given by the server', async () => {
    const user = userEvent.setup();
    mockExport('/api/cocktails/:id/export');
    const request = captureRequest('get', '/api/cocktails/:id/export');
    render(<ExportCocktailButton cocktailId={1} />);

    await user.click(screen.getByTitle('cocktails.export'));

    expect((await request.url).pathname).toBe('/api/cocktails/1/export');
    await waitFor(() => expect(downloads).toEqual(['cocktail-pina-colada.json']));
  });

  it('saves the recipe as indented JSON', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.mocked(URL.createObjectURL);
    mockExport('/api/cocktails/:id/export');
    render(<ExportCocktailButton cocktailId={1} />);

    await user.click(screen.getByTitle('cocktails.export'));

    await waitFor(() => expect(downloads).toHaveLength(1));
    const saved = createObjectURL.mock.calls[0][0];
    expect(saved).toBeInstanceOf(Blob);
    if (saved instanceof Blob) {
      expect(saved.type).toBe('application/json');
      expect(await saved.text()).toBe(JSON.stringify(piñaColada, null, 2));
    }
  });

  it('uses the public export when isPublic', async () => {
    const user = userEvent.setup();
    mockExport('/api/public/cocktails/:id/export');
    const request = captureRequest('get', '/api/public/cocktails/:id/export');
    render(<ExportCocktailButton cocktailId={7} isPublic />);

    await user.click(screen.getByTitle('cocktails.export'));

    expect((await request.url).pathname).toBe('/api/public/cocktails/7/export');
    await waitFor(() => expect(downloads).toEqual(['cocktail-pina-colada.json']));
  });

  it('uses the custom className when provided', () => {
    render(<ExportCocktailButton cocktailId={1} className="custom-class" />);
    expect(screen.getByTitle('cocktails.export')).toHaveClass('custom-class');
  });

  it('logs a failed export and downloads nothing', async () => {
    const user = userEvent.setup();
    mockApiError('get', '/api/cocktails/:id/export', 404, 'Cocktail not found');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ExportCocktailButton cocktailId={1} />);

    await user.click(screen.getByTitle('cocktails.export'));

    await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Export failed:', expect.objectContaining({ status: 404 })));
    expect(downloads).toEqual([]);
  });
});
