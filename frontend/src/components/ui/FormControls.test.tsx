import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/test-utils';
import Field from './Field';
import Input from './Input';
import Select from './Select';
import Textarea from './Textarea';

describe('Input, Select and Textarea', () => {
  it('work on their own with the shared control style', () => {
    render(
      <>
        <Input aria-label="Name" className="uppercase" />
        <Select aria-label="Type"><option>Spirit</option></Select>
        <Textarea aria-label="Notes" />
      </>,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input.className).toContain('bg-canvas');
    expect(input.className).toContain('uppercase');
    expect(input).not.toHaveAttribute('id');
    expect(screen.getByRole('combobox', { name: 'Type' }).className).toContain('border-line-strong');
    expect(screen.getByRole('textbox', { name: 'Notes' }).tagName).toBe('TEXTAREA');
  });

  it('never remove the focus outline without a replacement', () => {
    render(<Input aria-label="Name" />);
    const className = screen.getByRole('textbox', { name: 'Name' }).className;
    expect(className).not.toContain('focus:outline-none');
    expect(className).toContain('focus-visible:outline-accent');
  });

  it('read the label, error and required state of an enclosing Field', () => {
    render(
      <>
        <Field label="Type" error="Pick a type" required>
          <Select><option>Spirit</option></Select>
        </Field>
        <Field label="Notes" hint="Optional">
          <Textarea />
        </Field>
      </>,
    );
    const select = screen.getByLabelText(/Type/);
    expect(select).toBeRequired();
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Pick a type');
    expect(screen.getByLabelText('Notes')).toHaveAccessibleDescription('Optional');
  });
});
