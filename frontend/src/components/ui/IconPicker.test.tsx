import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import IconPicker from './IconPicker';

vi.mock('react-i18next', async () => {
  const { translateWithValues } = await import('../../test/translateWithValues');
  return { useTranslation: () => ({ t: translateWithValues, i18n: { language: 'en' } }) };
});

describe('IconPicker', () => {
  it('names each emoji of the grid, inside a named group', () => {
    render(<IconPicker value="" onChange={vi.fn()} />);

    const group = screen.getByRole('group', { name: 'iconPicker.suggestions' });
    expect(group.querySelectorAll('button').length).toBeGreaterThan(10);
    expect(screen.getByRole('button', { name: 'iconPicker.emoji(🍋)' })).toBeInTheDocument();
  });

  it('should call onChange when clicking an emoji', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<IconPicker value="" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'iconPicker.emoji(🍋)' }));
    expect(onChange).toHaveBeenCalledWith('🍋');
  });

  it('marks the selected emoji as pressed', () => {
    render(<IconPicker value="🍋" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'iconPicker.emoji(🍋)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'iconPicker.emoji(🍒)' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('should show selected indicator when value is set', () => {
    render(<IconPicker value="🍒" onChange={vi.fn()} />);
    expect(screen.getByText('iconPicker.selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.clear' })).toBeInTheDocument();
  });

  it('should not show selected indicator when no value', () => {
    render(<IconPicker value="" onChange={vi.fn()} />);
    expect(screen.queryByText('iconPicker.selected')).not.toBeInTheDocument();
  });

  it('clears the value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<IconPicker value="🍒" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'common.clear' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('should submit custom emoji via OK button', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<IconPicker value="" onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'iconPicker.customLabel' }), '🌮');
    await user.click(screen.getByRole('button', { name: 'iconPicker.useCustom' }));
    expect(onChange).toHaveBeenCalledWith('🌮');
  });

  it('submits the custom emoji with Enter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<IconPicker value="" onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'iconPicker.customLabel' }), '🌮{Enter}');
    expect(onChange).toHaveBeenCalledWith('🌮');
  });

  it('should disable OK button when custom input is empty', () => {
    render(<IconPicker value="" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'iconPicker.useCustom' })).toBeDisabled();
  });
});
