import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, fireEvent } from '../../test/test-utils';
import LocationAutocomplete from './LocationAutocomplete';

const locations = ['Bar', 'Cellar', 'Kitchen'];

/** Keeps the value in state, like the bottles page does. */
function Harness({ onChange = vi.fn() }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('');
  const handleChange = (next: string) => {
    setValue(next);
    onChange(next);
  };
  return (
    <LocationAutocomplete
      value={value}
      onChange={handleChange}
      locations={locations}
      label="Location"
      placeholder="Filter by location"
    />
  );
}

function getCombobox() {
  return screen.getByRole('combobox', { name: 'Location' });
}

describe('LocationAutocomplete', () => {
  it('is a combobox that lists every location on focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const combobox = getCombobox();
    expect(combobox).toHaveAttribute('aria-expanded', 'false');

    await user.click(combobox);

    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox');
    expect(combobox).toHaveAttribute('aria-controls', listbox.id);
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('filters the locations while typing', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(getCombobox(), 'ell');

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Cellar']);
  });

  it('moves the highlight with the arrow keys and picks it with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const combobox = getCombobox();
    await user.click(combobox);
    expect(combobox).not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{ArrowDown}{ArrowDown}');
    const cellar = screen.getByRole('option', { name: 'Cellar' });
    expect(combobox).toHaveAttribute('aria-activedescendant', cellar.id);
    expect(cellar).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(combobox).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Kitchen' }).id);

    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('Kitchen');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combobox).toHaveValue('Kitchen');
  });

  it('opens on ArrowDown when closed and starts from the first location', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const combobox = getCombobox();
    await user.click(combobox);
    await user.keyboard('{Escape}');

    await user.keyboard('{ArrowDown}');

    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(combobox).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Bar' }).id);
  });

  it('opens on ArrowUp when closed and starts from the last location', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(getCombobox());
    await user.keyboard('{Escape}{ArrowUp}');

    expect(getCombobox()).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Kitchen' }).id);
  });

  it('closes on Escape and keeps the focus in the field', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const combobox = getCombobox();
    await user.click(combobox);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    expect(combobox).toHaveFocus();
  });

  it('forgets the highlight when the text changes', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const combobox = getCombobox();
    await user.click(combobox);
    await user.keyboard('{ArrowDown}');

    await user.keyboard('a');

    expect(combobox).not.toHaveAttribute('aria-activedescendant');
  });

  it('picks a location with the mouse', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(getCombobox());

    await user.click(screen.getByRole('option', { name: 'Cellar' }));

    expect(onChange).toHaveBeenLastCalledWith('Cellar');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes when the field loses the focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(getCombobox());

    fireEvent.blur(getCombobox());

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('clears the value with a named button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(getCombobox(), 'Bar');

    await user.click(screen.getByRole('button', { name: 'common.clear' }));

    expect(onChange).toHaveBeenLastCalledWith('');
    expect(getCombobox()).toHaveValue('');
  });
});
