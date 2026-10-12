import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { menuCocktail } from '../../test/publicMenuFixtures';
import type { CocktailIngredient } from '../../types';
import PublicCocktailItem from './PublicCocktailItem';

vi.mock('react-i18next', async (importOriginal) => {
  const { translateWithValues } = await import('../../test/translateWithValues');
  return {
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: translateWithValues, i18n: { language: 'en' } }),
  };
});

function ingredient(id: number, name: string): CocktailIngredient {
  return {
    id,
    cocktailId: 1,
    quantity: 1,
    unitId: 1,
    sourceType: 'INGREDIENT',
    bottleId: null,
    categoryId: null,
    ingredientId: id,
    ingredient: { id, name, icon: null, isAvailable: true, createdAt: '2024-01-01' },
    position: id,
  };
}

function CocktailPageProbe() {
  const location = useLocation();
  return <p>cocktail page, state: {JSON.stringify(location.state)}</p>;
}

function renderItem(item = menuCocktail(1)) {
  return render(
    <MemoryRouter initialEntries={['/menu/summer']}>
      <Routes>
        <Route
          path="/menu/summer"
          element={<PublicCocktailItem menuCocktail={item} menuSlug="summer" viewMode="grid" showAvailability={false} />}
        />
        <Route path="/menu/summer/cocktail/:id" element={<CocktailPageProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PublicCocktailItem', () => {
  it('shows four ingredients and sums up the others', () => {
    const names = ['Rum', 'Lime', 'Mint', 'Sugar', 'Soda', 'Ice'];
    renderItem(menuCocktail(1, { ingredients: names.map((name, index) => ingredient(index + 1, name)) }));

    expect(screen.getByText('Sugar')).toBeInTheDocument();
    expect(screen.queryByText('Soda')).not.toBeInTheDocument();
    expect(screen.getByText('public.moreIngredients(2)')).toHaveClass('sr-only');
    expect(screen.getByText('+2')).toHaveAttribute('aria-hidden', 'true');
  });

  it('tells the cocktail page that the guest comes from the menu', async () => {
    const user = userEvent.setup();
    renderItem();

    await user.click(screen.getByRole('link', { name: /Mojito/ }));

    expect(screen.getByText('cocktail page, state: {"fromMenu":true}')).toBeInTheDocument();
  });

  it('greys out a cocktail switched on but out of stock and does not open it', async () => {
    const user = userEvent.setup();
    renderItem(menuCocktail(1, { isAvailable: true, available: false }));

    const link = screen.getByRole('link', { name: /Mojito/ });
    expect(link).toHaveClass('grayscale');
    expect(screen.getByText('public.unavailable')).toBeInTheDocument();

    await user.click(link);
    expect(screen.queryByText(/cocktail page/)).not.toBeInTheDocument();
  });

  it('keeps an available cocktail in color', () => {
    renderItem(menuCocktail(1, { isAvailable: true, available: true }));

    const link = screen.getByRole('link', { name: /Mojito/ });
    expect(link).not.toHaveClass('grayscale');
    expect(link).not.toHaveAttribute('aria-disabled');
    expect(link).not.toHaveAttribute('tabindex');
    expect(screen.queryByText('public.unavailable')).not.toBeInTheDocument();
  });

  it('takes an unavailable cocktail out of the tab order and announces it as disabled', () => {
    renderItem(menuCocktail(1, { isAvailable: true, available: false }));

    const link = screen.getByRole('link', { name: /Mojito/ });
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).toHaveAttribute('tabindex', '-1');
  });

  it('treats the photo as decoration: the heading already names the link', () => {
    renderItem(menuCocktail(1, { imagePath: 'mojito.jpg' }));
    expect(screen.getByRole('link', { name: /Mojito/ }).querySelector('img')).toHaveAttribute('alt', '');
  });

  it('hides the placeholder emoji from screen readers', () => {
    renderItem(menuCocktail(1, { imagePath: null }));
    expect(screen.getByText('🍸')).toHaveAttribute('aria-hidden', 'true');
  });
});
