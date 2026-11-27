import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { render, screen, within } from '../../test/test-utils';
import { axe } from '../../test/axe';
import { captureRequest, mockApiError } from '../../test/msw/utils';
import { ConfirmProvider } from '../../contexts/ConfirmContext';
import CodeModeSettings from './CodeModeSettings';

function renderSection(initialEnabled = false) {
  return render(
    <ConfirmProvider>
      <CodeModeSettings initialEnabled={initialEnabled} />
    </ConfirmProvider>,
  );
}

function codeModeSwitch(): HTMLElement {
  return screen.getByRole('switch', { name: 'Code Mode' });
}

describe('CodeModeSettings', () => {
  it('shows the stored setting, off, with the warning about code run on the server', async () => {
    const { container } = renderSection();

    expect(screen.getByRole('heading', { name: 'MCP server: Code Mode' })).toBeInTheDocument();
    expect(screen.getByText('Code written by the agent runs on this server')).toBeInTheDocument();
    expect(screen.getByText(/It has the rights of the agent's token/)).toBeInTheDocument();
    expect(codeModeSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('turns Code Mode on after the admin confirms', async () => {
    const user = userEvent.setup();
    const sent = captureRequest('put', '/api/settings/code-mode');
    renderSection();

    await user.click(codeModeSwitch());
    const dialog = await screen.findByRole('alertdialog', { name: 'Turn on Code Mode' });
    expect(within(dialog).getByText(/run code on this server/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Turn on' }));

    expect(await sent.body).toEqual({ enabled: true });
    expect(await screen.findByText(/Code Mode is on/)).toBeInTheDocument();
    expect(codeModeSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('leaves Code Mode off when the admin cancels', async () => {
    const user = userEvent.setup();
    const sent = captureRequest('put', '/api/settings/code-mode');
    renderSection();

    await user.click(codeModeSwitch());
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Turn on Code Mode' })).getByRole(
        'button',
        { name: 'Cancel' },
      ),
    );

    expect(sent.count()).toBe(0);
    expect(codeModeSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('turns Code Mode off without asking', async () => {
    const user = userEvent.setup();
    const sent = captureRequest('put', '/api/settings/code-mode');
    renderSection(true);

    await user.click(codeModeSwitch());

    expect(await sent.body).toEqual({ enabled: false });
    expect(await screen.findByText(/Code Mode is off/)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(codeModeSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps the setting and shows the error when the server refuses', async () => {
    const user = userEvent.setup();
    mockApiError('put', '/api/settings/code-mode', 403, 'API tokens cannot use this route');
    renderSection(true);

    await user.click(codeModeSwitch());

    expect(await screen.findByRole('alert')).toHaveTextContent('API tokens cannot use this route');
    expect(codeModeSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  describe('in French', () => {
    beforeEach(async () => {
      await i18n.changeLanguage('fr');
    });

    it('shows the warning in French', () => {
      renderSection();

      expect(screen.getByRole('heading', { name: 'Serveur MCP : Code Mode' })).toBeInTheDocument();
      expect(
        screen.getByText("Le code écrit par l'agent s'exécute sur ce serveur"),
      ).toBeInTheDocument();
    });
  });
});
