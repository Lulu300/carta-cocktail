import { describe, it, expect, vi, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/test-utils';
import CopyButton from './CopyButton';
import { toast } from './ToastStore';

function renderButton() {
  return render(
    <CopyButton text="carta_secret" copiedMessage="Copied" failedMessage="Not copied">
      Copy
    </CopyButton>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CopyButton', () => {
  it('copies the text and says so', async () => {
    // Attaches user-event's clipboard to navigator: jsdom has none
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const success = vi.spyOn(toast, 'success').mockReturnValue('toast-1');
    renderButton();

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('carta_secret');
    expect(success).toHaveBeenCalledWith('Copied');
  });

  it('says when the browser refuses the copy', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'));
    const error = vi.spyOn(toast, 'error').mockReturnValue('toast-1');
    renderButton();

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(error).toHaveBeenCalledWith(new Error('Not copied'));
  });

  it('renders nothing outside a secure context, where the browser has no clipboard API', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    try {
      const { container } = renderButton();

      expect(container).toBeEmptyDOMElement();
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });
});
