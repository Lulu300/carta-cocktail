import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/test-utils';
import type { Category } from '../../types';
import CategoryFilterInput from './CategoryFilterInput';

function category(id: number, name: string): Category {
  return { id, name, type: 'SPIRIT', desiredStock: 1, minimumPercent: 0, createdAt: '2024-01-01' };
}

const categories = [category(1, 'Rum'), category(2, 'Rye whiskey'), category(3, 'Gin')];

/** Keeps the text and the selected category in state, like the bottles page does. */
function Harness({ onChange = vi.fn() }: { onChange?: (text: string, id: number | null) => void }) {
  const [text, setText] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const handleChange = (nextText: string, nextId: number | null) => {
    setText(nextText);
    setSelectedId(nextId);
    onChange(nextText, nextId);
  };
  return (
    <CategoryFilterInput
      categories={categories}
      value={text}
      selectedId={selectedId}
      onChange={handleChange}
      label="Category"
      placeholder="Filter by category"
    />
  );
}

function getCombobox() {
  return screen.getByRole('combobox', { name: 'Category' });
}

describe('CategoryFilterInput', () => {
  it('suggests the matching categories once something is typed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const combobox = getCombobox();

    await user.click(combobox);
    expect(combobox).toHaveAttribute('aria-expanded', 'false');

    await user.type(combobox, 'r');

    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(combobox).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Rum', 'Rye whiskey']);
  });

  it('selects the highlighted category with the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const combobox = getCombobox();
    await user.type(combobox, 'r');

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(combobox).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Rye whiskey' }).id);
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenLastCalledWith('Rye whiskey', 2);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
  });

  it('wraps around the ends of the list', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const combobox = getCombobox();
    await user.type(combobox, 'r');

    await user.keyboard('{ArrowUp}');
    expect(combobox).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Rye whiskey' }).id);
    await user.keyboard('{ArrowDown}');
    expect(combobox).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Rum' }).id);
  });

  it('closes on Escape without selecting anything', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(getCombobox(), 'r');
    await user.keyboard('{ArrowDown}');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('r', null);
  });

  it('lets Enter through when no option is highlighted', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(getCombobox(), 'r');

    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenLastCalledWith('r', null);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('selects a category with the mouse, then clears it with a named button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(getCombobox(), 'gi');

    await user.click(screen.getByRole('option', { name: 'Gin' }));
    expect(onChange).toHaveBeenLastCalledWith('Gin', 3);

    await user.click(screen.getByRole('button', { name: 'common.clear' }));
    expect(onChange).toHaveBeenLastCalledWith('', null);
    expect(getCombobox()).toHaveValue('');
  });
});
