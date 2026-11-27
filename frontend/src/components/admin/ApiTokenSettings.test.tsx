import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '../../test/test-utils';
import { axe } from '../../test/axe';
import { server } from '../../test/msw/server';
import { captureRequest, mockApiError, readJsonObject } from '../../test/msw/utils';
import { buildApiToken } from '../../test/factories';
import { ConfirmProvider } from '../../contexts/ConfirmContext';
import { toast } from '../ui/ToastStore';
import type { ApiToken, CreatedApiToken } from '../../types';
import ApiTokenSettings from './ApiTokenSettings';

const NEW_TOKEN = `carta_${'n'.repeat(39)}New1`;

/** The backend with its tokens: creations and revocations change what the list sends next. */
function mockTokenStore(initial: ApiToken[]) {
  let tokens = [...initial];
  server.use(
    http.get('/api/api-tokens', () => HttpResponse.json(tokens)),
    http.post('/api/api-tokens', async ({ request }) => {
      const body = await readJsonObject(request);
      const listed = buildApiToken({
        name: String(body.name),
        scope: body.scope === 'READ_WRITE' ? 'READ_WRITE' : 'READ_ONLY',
        lastFour: 'New1',
      });
      tokens = [listed, ...tokens];
      const created: CreatedApiToken = { ...listed, token: NEW_TOKEN };
      return HttpResponse.json(created, { status: 201 });
    }),
    http.delete('/api/api-tokens/:id', ({ params }) => {
      tokens = tokens.filter((token) => token.id !== Number(params.id));
      return HttpResponse.json({ message: 'API token revoked' });
    }),
  );
}

function renderSection() {
  return render(
    <ConfirmProvider>
      <ApiTokenSettings />
    </ConfirmProvider>,
  );
}

function tokenList(): HTMLElement {
  return screen.getByRole('list');
}

beforeEach(() => {
  vi.spyOn(toast, 'success').mockReturnValue('toast-1');
  vi.spyOn(toast, 'error').mockReturnValue('toast-2');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ApiTokenSettings', () => {
  it('lists each token with its access, last characters, dates and use, without its secret', async () => {
    mockTokenStore([
      buildApiToken({
        name: 'Home Assistant',
        lastFour: 'Ab12',
        scope: 'READ_ONLY',
        createdAt: '2026-11-01T10:00:00.000Z',
        expiresAt: '2099-01-30T10:00:00.000Z',
        lastUsedAt: '2026-11-20T08:00:00.000Z',
      }),
      buildApiToken({
        name: 'Old script',
        scope: 'READ_WRITE',
        createdAt: '2025-01-01T10:00:00.000Z',
        expiresAt: '2025-01-31T10:00:00.000Z',
      }),
    ]);
    const { container } = renderSection();

    const [homeAssistant, oldScript] = within(await screen.findByRole('list')).getAllByRole(
      'listitem',
    );
    expect(homeAssistant).toHaveTextContent('Home Assistant');
    expect(homeAssistant).toHaveTextContent('…Ab12');
    expect(homeAssistant).toHaveTextContent('Read only');
    expect(homeAssistant).toHaveTextContent(
      'Created on 11/01/2026, expires on 01/30/2099. Last used on 11/20/2026.',
    );
    expect(homeAssistant).not.toHaveTextContent('Expired');
    expect(oldScript).toHaveTextContent('Read and write');
    expect(oldScript).toHaveTextContent('Expired');
    expect(oldScript).toHaveTextContent('Never used.');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('says when there is no token', async () => {
    renderSection();

    expect(await screen.findByText('No API token yet.')).toBeInTheDocument();
  });

  it('creates a token, shows it once with a copy button, then lists it without its secret', async () => {
    const user = userEvent.setup();
    mockTokenStore([]);
    const created = captureRequest('post', '/api/api-tokens');
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const { container } = renderSection();
    await screen.findByText('No API token yet.');

    await user.type(screen.getByLabelText(/Token name/), 'MCP on my laptop');
    await user.selectOptions(screen.getByLabelText('Access'), 'Read and write');
    await user.selectOptions(screen.getByLabelText('Expires after'), '365 days');
    await user.click(screen.getByRole('button', { name: 'Create token' }));

    expect(await created.body).toEqual({
      name: 'MCP on my laptop',
      scope: 'READ_WRITE',
      expiresInDays: 365,
    });
    expect(await screen.findByText('Token "MCP on my laptop" created')).toBeInTheDocument();
    expect(
      screen.getByText('Copy it now and keep it somewhere safe: it will not be shown again.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('New token')).toHaveValue(NEW_TOKEN);
    expect(screen.getByLabelText(/Token name/)).toHaveValue('');
    expect(await within(tokenList()).findByText('MCP on my laptop')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: 'Copy the token' }));
    expect(writeText).toHaveBeenCalledWith(NEW_TOKEN);
    expect(toast.success).toHaveBeenCalledWith('Token copied');

    await user.click(screen.getByRole('button', { name: 'I have copied it' }));
    expect(screen.queryByLabelText('New token')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(NEW_TOKEN);
    expect(within(tokenList()).getByText('…New1')).toBeInTheDocument();
  });

  it('creates a read-only token for 90 days unless the admin picks otherwise', async () => {
    const user = userEvent.setup();
    const created = captureRequest('post', '/api/api-tokens');
    renderSection();

    await user.type(screen.getByLabelText(/Token name/), 'Backup checker');
    await user.click(screen.getByRole('button', { name: 'Create token' }));

    expect(await created.body).toEqual({
      name: 'Backup checker',
      scope: 'READ_ONLY',
      expiresInDays: 90,
    });
  });

  it('says when the browser refuses the copy, and keeps the token in its field', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'));
    renderSection();

    await user.type(screen.getByLabelText(/Token name/), 'MCP');
    await user.click(screen.getByRole('button', { name: 'Create token' }));
    await user.click(await screen.findByRole('button', { name: 'Copy the token' }));

    expect(toast.error).toHaveBeenCalledWith(
      new Error('The token could not be copied: select it in the field and copy it'),
    );
    expect(screen.getByLabelText('New token')).toHaveValue(`carta_${'x'.repeat(39)}Wxyz`);
  });

  it('shows the server message when the creation is refused', async () => {
    const user = userEvent.setup();
    mockApiError(
      'post',
      '/api/api-tokens',
      409,
      'You already have 20 active API tokens: revoke one before creating another',
    );
    renderSection();

    await user.type(screen.getByLabelText(/Token name/), 'One too many');
    await user.click(screen.getByRole('button', { name: 'Create token' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'You already have 20 active API tokens: revoke one before creating another',
        }),
      ),
    );
    expect(screen.queryByLabelText('New token')).not.toBeInTheDocument();
  });

  it('revokes a token after a confirmation, and hides it if it was just created', async () => {
    const user = userEvent.setup();
    mockTokenStore([buildApiToken({ name: 'Home Assistant' })]);
    renderSection();
    await user.type(screen.getByLabelText(/Token name/), 'MCP');
    await user.click(screen.getByRole('button', { name: 'Create token' }));
    await within(tokenList()).findByText('MCP');
    const revoked = captureRequest('delete', '/api/api-tokens/:id');

    await user.click(screen.getByRole('button', { name: 'Revoke MCP' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Revoke the token' });
    expect(dialog).toHaveAccessibleDescription(
      'Scripts and MCP clients that use "MCP" will be refused from now on. This cannot be undone.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    expect((await revoked.url).pathname).toMatch(/^\/api\/api-tokens\/\d+$/);
    await waitFor(() => expect(within(tokenList()).queryByText('MCP')).not.toBeInTheDocument());
    expect(screen.queryByLabelText('New token')).not.toBeInTheDocument();
    expect(within(tokenList()).getByText('Home Assistant')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Token revoked');
  });

  it('keeps the token when the revocation is cancelled', async () => {
    const user = userEvent.setup();
    mockTokenStore([buildApiToken({ name: 'Home Assistant' })]);
    const revoked = captureRequest('delete', '/api/api-tokens/:id');
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Revoke Home Assistant' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Revoke the token' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(revoked.count()).toBe(0);
    expect(within(tokenList()).getByText('Home Assistant')).toBeInTheDocument();
  });

  it('offers to load the list again when it fails', async () => {
    const user = userEvent.setup();
    mockApiError('get', '/api/api-tokens', 500, 'Internal server error');
    renderSection();

    const retry = await screen.findByRole('button', { name: 'Retry' });
    mockTokenStore([buildApiToken({ name: 'Home Assistant' })]);
    await user.click(retry);

    expect(await screen.findByText('Home Assistant')).toBeInTheDocument();
  });
});
