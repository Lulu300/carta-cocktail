import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/test-utils';
import Field from './Field';
import Input from './Input';

describe('Field', () => {
  it('associates the label with the control', () => {
    render(<Field label="Nom"><Input /></Field>);
    const input = screen.getByLabelText('Nom');
    expect(input.tagName).toBe('INPUT');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('links the error to the control and marks it invalid', () => {
    render(<Field label="Nom" error="Name is required"><Input /></Field>);
    const input = screen.getByLabelText('Nom');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Name is required');
  });

  it('describes the control with the hint and the error together', () => {
    render(<Field label="Nom" hint="Shown on the menu" error="Too long"><Input /></Field>);
    expect(screen.getByLabelText('Nom')).toHaveAccessibleDescription('Shown on the menu Too long');
  });

  it('marks the control required and shows a decorative asterisk', () => {
    render(<Field label="Nom" required><Input /></Field>);
    expect(screen.getByRole('textbox', { name: /Nom/ })).toBeRequired();
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the label association and lets explicit aria props win', () => {
    render(
      <>
        <p id="extra">Extra help</p>
        <Field label="Nom" error="Bad value">
          <Input id="custom-id" aria-describedby="extra" aria-invalid={false} />
        </Field>
      </>,
    );
    const input = screen.getByLabelText('Nom');
    expect(input).not.toHaveAttribute('id', 'custom-id');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input.getAttribute('aria-describedby')).toMatch(/-error extra$/);
  });
});
