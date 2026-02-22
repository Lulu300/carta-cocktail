import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import IconPicker from './IconPicker';

describe('IconPicker', () => {
  it('should render emoji grid', () => {
    render(<IconPicker value="" onChange={vi.fn()} />);
    // Should have emoji buttons in the grid
    const buttons = screen.getAllByRole('button');
    // At least the common emojis + OK button
    expect(buttons.length).toBeGreaterThan(10);
  });

  it('should call onChange when clicking an emoji', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<IconPicker value="" onChange={onChange} />);

    const limeButton = screen.getByTitle('🍋');
    await user.click(limeButton);
    expect(onChange).toHaveBeenCalledWith('🍋');
  });

  it('should highlight selected emoji', () => {
    render(<IconPicker value="🍋" onChange={vi.fn()} />);
    const limeButton = screen.getByTitle('🍋');
    expect(limeButton.className).toContain('border-amber-400');
  });

  it('should show selected indicator when value is set', () => {
    render(<IconPicker value="🍒" onChange={vi.fn()} />);
    expect(screen.getByText('Sélectionné')).toBeInTheDocument();
    expect(screen.getByText('Effacer')).toBeInTheDocument();
  });

  it('should not show selected indicator when no value', () => {
    render(<IconPicker value="" onChange={vi.fn()} />);
    expect(screen.queryByText('Sélectionné')).not.toBeInTheDocument();
  });

  it('should clear value on "Effacer" click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<IconPicker value="🍒" onChange={onChange} />);

    await user.click(screen.getByText('Effacer'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('should submit custom emoji via OK button', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<IconPicker value="" onChange={onChange} />);

    const input = screen.getByPlaceholderText('Ou collez un emoji personnalisé...');
    await user.type(input, '🌮');
    await user.click(screen.getByText('OK'));
    expect(onChange).toHaveBeenCalledWith('🌮');
  });

  it('should disable OK button when custom input is empty', () => {
    render(<IconPicker value="" onChange={vi.fn()} />);
    const okButton = screen.getByText('OK');
    expect(okButton).toBeDisabled();
  });
});
