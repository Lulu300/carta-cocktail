import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test/axe';
import i18n from '../../i18n';
import DateInput from './DateInput';

// The field letters and messages are the real ones, in French unless a test picks another language.
beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

async function changeLanguage(language: string) {
  await act(() => i18n.changeLanguage(language));
}

/** A form holding the ISO value, as BottleFormModal does, with a submit button. */
function DateForm({
  initialValue = '',
  onSubmit,
}: {
  initialValue?: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <DateInput label="Opened on" value={value} onChange={setValue} />
      <button type="submit">Save</button>
    </form>
  );
}

function dateField() {
  return screen.getByLabelText('Opened on');
}

describe('DateInput', () => {
  it('shows the ISO value in the format of the app language', () => {
    render(<DateForm initialValue="2024-12-03" onSubmit={vi.fn()} />);

    expect(dateField()).toHaveValue('03/12/2024');
    expect(dateField()).toHaveAttribute('placeholder', 'jj/mm/aaaa');
  });

  it('announces the expected format with the field', () => {
    render(<DateForm onSubmit={vi.fn()} />);

    expect(dateField()).toHaveAccessibleDescription('Format : jj/mm/aaaa');
  });

  it('submits a date typed in French as an ISO date', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DateForm onSubmit={onSubmit} />);

    await user.type(dateField(), '03/12/2024');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith('2024-12-03');
  });

  it('reads a date typed in English month first', async () => {
    await changeLanguage('en');
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DateForm onSubmit={onSubmit} />);

    await user.type(dateField(), '12/03/2024');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith('2024-12-03');
  });

  it('keeps a valid date as typed', async () => {
    const user = userEvent.setup();
    render(<DateForm onSubmit={vi.fn()} />);

    await user.type(dateField(), '3/1/2024');

    expect(dateField()).toHaveValue('3/1/2024');
  });

  it('submits an empty value once the date is cleared', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DateForm initialValue="2024-12-03" onSubmit={onSubmit} />);

    await user.clear(dateField());
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith('');
  });

  it.each(['31/02/2024', 'abc'])(
    'shows a translated error for %s and does not submit it',
    async (text) => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const { container } = render(<DateForm initialValue="2024-12-03" onSubmit={onSubmit} />);

      await user.clear(dateField());
      await user.type(dateField(), text);
      await user.click(screen.getByRole('button', { name: 'Save' }));

      const error = 'Saisissez une date valide au format jj/mm/aaaa';
      expect(onSubmit).not.toHaveBeenCalled();
      expect(dateField()).toBeInvalid();
      expect(dateField()).toHaveAttribute('aria-invalid', 'true');
      expect(dateField()).toHaveAccessibleDescription(`${'Format : jj/mm/aaaa'} ${error}`);
      expect((dateField() as HTMLInputElement).validationMessage).toBe(error);
      expect(await axe(container)).toHaveNoViolations();
    },
  );

  it('shows the error when Enter submits an invalid date, without leaving the field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DateForm onSubmit={onSubmit} />);

    await user.type(dateField(), '31/02/2024{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(dateField()).toHaveFocus();
    expect(screen.getByText('Saisissez une date valide au format jj/mm/aaaa')).toBeInTheDocument();
  });

  it('waits for the field to lose the focus before showing the error', async () => {
    const user = userEvent.setup();
    render(<DateForm onSubmit={vi.fn()} />);

    await user.type(dateField(), '03/1');
    expect(
      screen.queryByText('Saisissez une date valide au format jj/mm/aaaa'),
    ).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByText('Saisissez une date valide au format jj/mm/aaaa')).toBeInTheDocument();

    await user.click(dateField());
    await user.type(dateField(), '2/2024');
    expect(
      screen.queryByText('Saisissez une date valide au format jj/mm/aaaa'),
    ).not.toBeInTheDocument();
  });

  it('shows and reads a date day first in English (UK)', async () => {
    await changeLanguage('en-GB');
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DateForm initialValue="2024-12-03" onSubmit={onSubmit} />);
    expect(dateField()).toHaveValue('03/12/2024');
    expect(dateField()).toHaveAttribute('placeholder', 'dd/mm/yyyy');

    await user.clear(dateField());
    await user.type(dateField(), '12/03/2024');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith('2024-03-12');
  });

  it('shows the same date in the new format when the language changes', async () => {
    const { rerender } = render(<DateForm initialValue="2024-12-03" onSubmit={vi.fn()} />);
    expect(dateField()).toHaveValue('03/12/2024');

    await changeLanguage('en');
    rerender(<DateForm initialValue="2024-12-03" onSubmit={vi.fn()} />);

    expect(dateField()).toHaveValue('12/03/2024');
    expect(dateField()).toHaveAttribute('placeholder', 'mm/dd/yyyy');
  });

  it('keeps the value when the language changes after typing', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(<DateForm onSubmit={onSubmit} />);
    await user.type(dateField(), '03/12/2024');

    await changeLanguage('en');
    rerender(<DateForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(dateField()).toHaveValue('12/03/2024');
    expect(onSubmit).toHaveBeenCalledWith('2024-12-03');
  });

  it('shows a value replaced by the form', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DateInput label="Opened on" value="2024-12-03" onChange={onChange} />,
    );
    fireEvent.change(dateField(), { target: { value: '3/12/2024' } });
    expect(dateField()).toHaveValue('3/12/2024');

    rerender(<DateInput label="Opened on" value="2025-01-15" onChange={onChange} />);

    expect(dateField()).toHaveValue('15/01/2025');
  });
});
