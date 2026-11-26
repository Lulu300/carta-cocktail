import { describe, it, expect, beforeEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/test-utils';
import { buildUnit } from '../../test/factories';
import { mockApiResponse, mockNetworkError } from '../../test/msw/utils';
import UnitConverter from './UnitConverter';

const i18nState = vi.hoisted(() => ({ language: 'en' }));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key, i18n: i18nState }),
}));

function unit(id: number, abbreviation: string, conversionFactorToMl: number | null) {
  return buildUnit({ id, name: abbreviation, abbreviation, conversionFactorToMl });
}

beforeEach(() => {
  i18nState.language = 'en';
  mockApiResponse('get', '/api/public/units', [unit(1, 'cl', 10), unit(2, 'ml', 1), unit(3, 'oz', 29.57)]);
});

describe('UnitConverter', () => {
  it('shows a plain quantity for a unit it cannot convert', async () => {
    mockApiResponse('get', '/api/public/units', [unit(1, 'cl', 10), unit(4, 'pinch', null)]);
    render(<UnitConverter quantity={2} unit="pinch" />);
    expect(await screen.findByText('2 pinch')).toBeInTheDocument();
    // Still plain once the units have loaded
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a plain quantity when the units cannot be loaded', async () => {
    mockNetworkError('get', '/api/public/units');
    render(<UnitConverter quantity={3} unit="cl" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText('3 cl')).toBeInTheDocument();
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
    expect(button).toHaveFocus();
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

  it.each([
    ['en', '1.5 cl', '3.33 cs', '0.51 oz'],
    ['fr', '1,5 cl', '3,33 cs', '0,51 oz'],
  ])('writes the quantities in %s and converts back to the original', async (language, original, spoons, ounces) => {
    i18nState.language = language;
    mockApiResponse('get', '/api/public/units', [unit(1, 'cl', 10), unit(2, 'cs', 4.5), unit(3, 'oz', 29.5735)]);
    const user = userEvent.setup();
    render(<UnitConverter quantity={1.5} unit="cl" />);
    await user.click(await screen.findByRole('button', { name: original }));
    expect(screen.getByRole('button', { name: ounces })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: spoons }));
    const trigger = screen.getByRole('button', { name: spoons });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: original }));

    expect(screen.getByRole('button', { name: original, expanded: false })).toBeInTheDocument();
  });
});
