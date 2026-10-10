import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import IconButton from './IconButton';

describe('IconButton', () => {
  it('exposes the label as accessible name and tooltip', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton icon="edit" label="Edit Mojito" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Edit Mojito' });
    expect(button).toHaveAttribute('title', 'Edit Mojito');
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('min-w-10 min-h-10');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the variant classes', () => {
    render(<IconButton icon="delete" label="Delete" variant="danger" />);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('text-danger');
  });
});
