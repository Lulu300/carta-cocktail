import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CocktailThumbnail from './CocktailThumbnail';

describe('CocktailThumbnail', () => {
  it('loads the smallest copy of the photo that fills a list thumbnail, lazily', () => {
    render(
      <CocktailThumbnail
        cocktail={{ name: 'Mojito', imagePath: 'mojito.webp' }}
        variant="square"
      />,
    );

    const photo = screen.getByRole('img', { name: 'Mojito' });
    expect(photo).toHaveAttribute(
      'srcset',
      expect.stringContaining('/uploads/mojito-480.webp 480w'),
    );
    expect(photo).toHaveAttribute('sizes', '5rem');
    expect(photo).toHaveAttribute('loading', 'lazy');
  });

  it('sizes a card cover by the grid column it sits in', () => {
    render(
      <CocktailThumbnail cocktail={{ name: 'Mojito', imagePath: 'mojito.webp' }} variant="cover" />,
    );

    expect(screen.getByRole('img', { name: 'Mojito' })).toHaveAttribute(
      'sizes',
      expect.stringContaining('100vw'),
    );
  });

  it('shows the photo itself when its copies are missing', () => {
    render(
      <CocktailThumbnail cocktail={{ name: 'Mojito', imagePath: 'old.jpg' }} variant="square" />,
    );

    fireEvent.error(screen.getByRole('img', { name: 'Mojito' }));

    const photo = screen.getByRole('img', { name: 'Mojito' });
    expect(photo).not.toHaveAttribute('srcset');
    expect(photo).toHaveAttribute('src', '/uploads/old.jpg');
  });

  it('shows a glass when the cocktail has no photo', () => {
    render(<CocktailThumbnail cocktail={{ name: 'Mojito', imagePath: null }} variant="square" />);

    expect(screen.queryByRole('img')).toBeNull();
  });
});
