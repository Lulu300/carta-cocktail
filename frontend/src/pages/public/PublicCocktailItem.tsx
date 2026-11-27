import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import type { CocktailAvailability, CocktailIngredient, PublicMenuCocktail } from '../../types';
import UploadedPhoto from './UploadedPhoto';
import { cx } from '../../components/ui/classNames';
import { parseTags } from '../../utils/parseTags';

// Beyond four ingredients a card becomes a wall of pills: the rest is summed up as "+N".
const MAX_VISIBLE_INGREDIENTS = 4;

// Displayed photo widths: the menu is max-w-4xl (56rem) with px-4, the grid has two
// columns from md (48rem) with gap-6, the list thumbnail is w-28, then sm:w-36.
const GRID_PHOTO_SIZES =
  '(min-width: 56rem) 26.25rem, (min-width: 48rem) calc(50vw - 1.75rem), calc(100vw - 2rem)';
const LIST_PHOTO_SIZES = '(min-width: 40rem) 9rem, 7rem';

/** Lets the cocktail page go back in history instead of loading the menu again. */
export interface CocktailLinkState {
  fromMenu: true;
}

interface PublicCocktailItemProps {
  menuCocktail: PublicMenuCocktail;
  menuSlug: string;
  viewMode: 'grid' | 'list';
  availability?: CocktailAvailability;
  showAvailability: boolean;
}

function PublicCocktailItem({
  menuCocktail,
  menuSlug,
  viewMode,
  availability,
  showAvailability,
}: PublicCocktailItemProps) {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const cocktail = menuCocktail.cocktail;
  // `available` combines the admin's manual switch and the stock (computed by the server)
  const isUnavailable = cocktail.available === false;
  const isList = viewMode === 'list';
  const ingredients = cocktail.ingredients ?? [];
  const tags = parseTags(cocktail.tags);
  const hiddenIngredientCount = ingredients.length - MAX_VISIBLE_INGREDIENTS;
  const linkState: CocktailLinkState = { fromMenu: true };

  const ingredientName = (ingredient: CocktailIngredient) =>
    ingredient.bottle?.name ||
    (ingredient.category ? localize(ingredient.category) : null) ||
    (ingredient.ingredient ? localize(ingredient.ingredient) : null);

  return (
    <Link
      to={`/menu/${menuSlug}/cocktail/${cocktail.id}`}
      state={linkState}
      className={cx(
        'group bg-surface border border-line rounded-xl overflow-hidden transition-all duration-300 motion-reduce:transition-none',
        isList && 'flex min-h-28',
        isUnavailable
          ? 'opacity-50 grayscale cursor-default'
          : 'hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5',
      )}
      onClick={(event) => isUnavailable && event.preventDefault()}
      // An unavailable cocktail does not open: out of the tab order, announced as disabled.
      aria-disabled={isUnavailable || undefined}
      tabIndex={isUnavailable ? -1 : undefined}
    >
      <div
        className={cx(
          isList ? 'w-28 sm:w-36 shrink-0' : 'aspect-video',
          'bg-canvas flex items-center justify-center overflow-hidden',
        )}
      >
        {/* Decorative: the cocktail's name in the heading already names the link. */}
        {cocktail.imagePath ? (
          <UploadedPhoto
            imagePath={cocktail.imagePath}
            sizes={isList ? LIST_PHOTO_SIZES : GRID_PHOTO_SIZES}
            loading="lazy"
            alt=""
            className="w-full h-full object-cover motion-safe:group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none"
          />
        ) : (
          <span aria-hidden="true" className={isList ? 'text-3xl' : 'text-5xl'}>
            🍸
          </span>
        )}
      </div>

      <div className={isList ? 'p-4 flex-1 min-w-0' : 'p-5'}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2
            className={`${isList ? 'text-lg' : 'text-xl'} font-serif font-bold text-fg group-hover:text-accent transition-colors`}
          >
            {cocktail.name}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            {showAvailability && availability && (
              <span
                className={`text-xs px-2 py-1 rounded font-medium ${
                  availability.maxServings === 0
                    ? 'bg-danger-bg/20 text-danger'
                    : availability.maxServings < 3
                      ? 'bg-warning-bg/20 text-warning'
                      : 'bg-success-bg/20 text-success'
                }`}
              >
                {t('public.servings', { count: availability.maxServings })}
              </span>
            )}
            {isUnavailable && (
              <span className="text-xs text-danger bg-danger-bg/10 px-2 py-1 rounded">
                {t('public.unavailable')}
              </span>
            )}
          </div>
        </div>

        {cocktail.description && (
          <p className={`text-fg-muted text-sm ${isList ? 'line-clamp-1' : 'line-clamp-2'}`}>
            {cocktail.description}
          </p>
        )}

        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag, index) => (
              <span
                key={index}
                className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded border border-accent/20"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {ingredients.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ingredients.slice(0, MAX_VISIBLE_INGREDIENTS).map((ingredient) => (
              <span
                key={ingredient.id}
                className="text-xs bg-canvas text-fg-muted px-2 py-1 rounded"
              >
                {ingredientName(ingredient)}
              </span>
            ))}
            {hiddenIngredientCount > 0 && (
              <span className="text-xs text-fg-muted px-2 py-1">
                <span aria-hidden="true">+{hiddenIngredientCount}</span>
                <span className="sr-only">
                  {t('public.moreIngredients', { count: hiddenIngredientCount })}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

// The menu re-renders on every keystroke of the search: unchanged cards are skipped.
export default memo(PublicCocktailItem);
