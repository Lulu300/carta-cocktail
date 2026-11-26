import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import IconPicker from './IconPicker';

describe('IconPicker', () => {
  it('names each emoji of the grid, inside a named group', () => {
    render(<IconPicker value="" onChange={vi.fn()} />);

    const group = screen.getByRole('group', { name: 'Suggested emojis' });
    expect(group.querySelectorAll('button').length).toBeGreaterThan(10);
    expect(screen.getByRole('button', { name: 'Emoji 🍋' })).toBeInTheDocument();
  });

  it('should call onChange when clicking an emoji', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<IconPicker value="" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Emoji 🍋' }));
    expect(onChange).toHaveBeenCalledWith('🍋');
  });

  it('marks the selected emoji as pressed', () => {
    render(<IconPicker value="🍋" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Emoji 🍋' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Emoji 🍒' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('should show selected indicator when value is set', () => {
    render(<IconPicker value="🍒" onChange={vi.fn()} />);
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('should not show selected indicator when no value', () => {
    render(<IconPicker value="" onChange={vi.fn()} />);
    expect(screen.queryByText('Selected')).not.toBeInTheDocument();
  });

  it('clears the value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<IconPicker value="🍒" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('should submit custom emoji via OK button', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<IconPicker value="" onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Custom emoji' }), '🌮');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(onChange).toHaveBeenCalledWith('🌮');
  });

  it('submits the custom emoji with Enter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<IconPicker value="" onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Custom emoji' }), '🌮{Enter}');
    expect(onChange).toHaveBeenCalledWith('🌮');
  });

  it('should disable OK button when custom input is empty', () => {
    render(<IconPicker value="" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled();
  });
});
