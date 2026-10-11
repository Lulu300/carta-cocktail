import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/test-utils';
import TranslationFields from './TranslationFields';

describe('TranslationFields', () => {
  it('is collapsed by default and expands on click', async () => {
    const user = userEvent.setup();
    render(<TranslationFields value={{ fr: '', en: '' }} onChange={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: 'common.translations' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Français')).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Français')).toBeInTheDocument();
    expect(screen.getByLabelText('English')).toBeInTheDocument();
  });

  it('starts expanded when asked, with the base name as placeholder', () => {
    render(<TranslationFields value={{ fr: 'Citron', en: '' }} onChange={vi.fn()} placeholder="Lemon" defaultOpen />);

    expect(screen.getByLabelText('Français')).toHaveValue('Citron');
    expect(screen.getByLabelText('English')).toHaveAttribute('placeholder', 'Lemon');
  });

  it('reports the edited language and keeps the other one', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TranslationFields value={{ fr: 'Citron', en: '' }} onChange={onChange} defaultOpen />);

    await user.type(screen.getByLabelText('English'), 'L');

    expect(onChange).toHaveBeenLastCalledWith({ fr: 'Citron', en: 'L' });
  });
});
