import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import type { CocktailAvailability, MenuCocktail } from '../../types';
import { getUploadUrl } from '../../utils/uploads';

interface PublicCocktailItemProps {
  menuCocktail: MenuCocktail;
  menuSlug: string;
  viewMode: 'grid' | 'list';
  availability?: CocktailAvailability;
  showAvailability: boolean;
}

export default function PublicCocktailItem({
  menuCocktail,
  menuSlug,
  viewMode,
  availability,
  showAvailability,
}: PublicCocktailItemProps) {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const cocktail = menuCocktail.cocktail!;
  const isUnavailable = !cocktail.isAvailable;
  const isList = viewMode === 'list';

  return (
    <Link
      to={`/menu/${menuSlug}/cocktail/${cocktail.id}`}
      className={`group bg-[#1a1a2e] border rounded-xl overflow-hidden transition-all duration-300 ${
        isList ? 'flex min-h-28' : ''
      } ${
        isUnavailable
          ? 'border-gray-800 opacity-50 grayscale cursor-default'
          : 'border-gray-800 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-400/5'
      }`}
      onClick={(event) => isUnavailable && event.preventDefault()}
    >
      <div className={`${
        isList ? 'w-28 sm:w-36 shrink-0' : 'aspect-video'
      } bg-[#0f0f1a] flex items-center justify-center overflow-hidden`}>
        {cocktail.imagePath ? (
          <img
            src={getUploadUrl(cocktail.imagePath) || undefined}
            alt={cocktail.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <span className={isList ? 'text-3xl' : 'text-5xl'}>🍸</span>
        )}
      </div>

      <div className={isList ? 'p-4 flex-1 min-w-0' : 'p-5'}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className={`${isList ? 'text-lg' : 'text-xl'} font-serif font-bold text-white group-hover:text-amber-400 transition-colors`}>
            {cocktail.name}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            {showAvailability && availability && (
              <span className={`text-xs px-2 py-1 rounded font-medium ${
                availability.maxServings === 0 ? 'bg-red-500/20 text-red-400' :
                availability.maxServings < 3 ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-green-500/20 text-green-400'
              }`}>
                {t('public.servings', { count: availability.maxServings })}
              </span>
            )}
            {isUnavailable && (
              <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
                {t('public.unavailable')}
              </span>
            )}
          </div>
        </div>

        {cocktail.description && (
          <p className={`text-gray-400 text-sm ${isList ? 'line-clamp-1' : 'line-clamp-2'}`}>
            {cocktail.description}
          </p>
        )}

        {cocktail.tags && cocktail.tags.trim() && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cocktail.tags.split(',').map((tag, index) => (
              <span key={index} className="text-xs bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded border border-amber-400/20">
                #{tag.trim()}
              </span>
            ))}
          </div>
        )}

        {cocktail.ingredients && cocktail.ingredients.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cocktail.ingredients.map((ingredient) => (
              <span key={ingredient.id} className="text-xs bg-[#0f0f1a] text-gray-400 px-2 py-1 rounded">
                {ingredient.bottle?.name ||
                  (ingredient.category ? localize(ingredient.category) : null) ||
                  (ingredient.ingredient ? localize(ingredient.ingredient) : null)}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
