import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import ToggleSwitch from './ToggleSwitch';

describe('ToggleSwitch', () => {
  it('exposes a switch whose aria-checked follows checked', () => {
    const { rerender } = render(<ToggleSwitch checked={false} onChange={vi.fn()} label="Public" />);
    expect(screen.getByRole('switch', { name: 'Public' })).toHaveAttribute('aria-checked', 'false');
    rerender(<ToggleSwitch checked onChange={vi.fn()} label="Public" />);
    expect(screen.getByRole('switch', { name: 'Public' })).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with the inverted value on click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ToggleSwitch checked onChange={onChange} label="Public" />);
    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('keeps a hidden label accessible', () => {
    render(<ToggleSwitch checked={false} onChange={vi.fn()} label="Available" hideLabel />);
    expect(screen.getByText('Available')).toHaveClass('sr-only');
    expect(screen.getByRole('switch', { name: 'Available' })).toHaveAttribute('type', 'button');
  });
});
