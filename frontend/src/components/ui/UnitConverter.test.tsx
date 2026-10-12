import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/test-utils';
import type { Unit } from '../../types';
import UnitConverter from './UnitConverter';

vi.mock('../../services/api', () => ({
  publicApi: { listUnits: vi.fn() },
}));

import { publicApi } from '../../services/api';

function unit(id: number, abbreviation: string, conversionFactorToMl: number | null): Unit {
  return { id, name: abbreviation, abbreviation, conversionFactorToMl };
}

beforeEach(() => {
  vi.mocked(publicApi.listUnits).mockResolvedValue([unit(1, 'cl', 10), unit(2, 'ml', 1), unit(3, 'oz', 29.57)]);
});

describe('UnitConverter', () => {
  it('shows a plain quantity for a unit it cannot convert', async () => {
    render(<UnitConverter quantity={2} unit="pinch" />);
    expect(await screen.findByText('2 pinch')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens the conversions from a button that reports its state', async () => {
    const user = userEvent.setup();
    render(<UnitConverter quantity={3} unit="cl" />);
    const button = await screen.findByRole('button', { name: '3 cl' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(button.getAttribute('aria-controls')!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3 cl/, pressed: true })).toBeInTheDocument();
  });

  it('converts to the chosen unit and marks it as selected', async () => {
    const user = userEvent.setup();
    render(<UnitConverter quantity={3} unit="cl" />);
    await user.click(await screen.findByRole('button', { name: '3 cl' }));

    await user.click(screen.getByRole('button', { name: /30 ml/ }));

    const button = screen.getByRole('button', { name: '30 ml' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(screen.getByRole('button', { name: /30 ml/, pressed: true })).toBeInTheDocument();
  });

  it('closes on Escape and gives the focus back to its button', async () => {
    const user = userEvent.setup();
    render(<UnitConverter quantity={3} unit="cl" />);
    const button = await screen.findByRole('button', { name: '3 cl' });
    await user.click(button);

    await user.keyboard('{Escape}');

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });
});
