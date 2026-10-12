import type { MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import { useAuth } from '../../contexts/AuthContext';
import { usePublicCocktail } from '../../queries/public';
import type { Cocktail, CocktailIngredient } from '../../types';
import Button from '../../components/ui/Button';
import UnitConverter from '../../components/ui/UnitConverter';
import ExportCocktailButton from '../../components/ui/ExportCocktailButton';
import { getUploadUrl } from '../../utils/uploads';
import CocktailSkeleton from './CocktailSkeleton';
import PublicErrorState from './PublicErrorState';
import type { CocktailLinkState } from './PublicCocktailItem';
import { useScrollRestoration } from './useScrollRestoration';

const SECTION_TITLE_CLASSES = 'text-sm font-serif font-bold uppercase tracking-wider text-accent/80 print:text-gray-800';

function isModifiedClick(event: MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export default function CocktailPublicPage() {
  const { t } = useTranslation();
  const { id, slug } = useParams();
  const { data: cocktail, error, refetch, isFetching } = usePublicCocktail(Number(id));
  useScrollRestoration(Boolean(cocktail));

  const menuPath = slug ? `/menu/${slug}` : '/';

  if (cocktail) return <CocktailRecipe cocktail={cocktail} menuPath={menuPath} />;
  if (error) {
    return (
      <PublicErrorState
        error={error}
        loadErrorTitle={t('public.cocktailLoadError')}
        notFound={{ title: t('public.cocktailNotFound'), linkTo: menuPath, linkLabel: t('public.back') }}
        onRetry={() => refetch()}
        isRetrying={isFetching}
      />
    );
  }
  return <CocktailSkeleton />;
}

function CocktailRecipe({ cocktail, menuPath }: { cocktail: Cocktail; menuPath: string }) {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const cameFromMenu = (location.state as CocktailLinkState | null)?.fromMenu === true;

  // Coming from the menu, going back in history keeps the menu from the cache and
  // its scroll position. Opened directly (shared link, new tab), the link leads to the menu.
  const handleBack = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!cameFromMenu || isModifiedClick(event)) return;
    event.preventDefault();
    navigate(-1);
  };

  const ingredientName = (ing: CocktailIngredient) => {
    if (ing.bottle) return ing.bottle.name;
    if (ing.category) return localize(ing.category);
    if (ing.ingredient) return localize(ing.ingredient);
    return '?';
  };

  const imageUrl = getUploadUrl(cocktail.imagePath);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        to={menuPath}
        onClick={handleBack}
        className="text-accent hover:text-accent-soft mb-6 inline-flex items-center gap-2 text-sm print:hidden"
      >
        <span aria-hidden="true">←</span> {t('public.back')}
      </Link>

      {/* Recipe card - printable */}
      <div className="bg-surface border border-line rounded-xl print:border-gray-300 print:bg-white print:text-black print:rounded-none" id="recipe-card">
        {imageUrl && (
          <div className="aspect-video overflow-hidden rounded-t-xl">
            <img
              src={imageUrl}
              alt={cocktail.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-5 sm:p-8">
          <h1 className="text-3xl font-bold font-serif text-accent print:text-black mb-2">
            {cocktail.name}
          </h1>
          {cocktail.description && (
            <p className="text-fg-muted print:text-gray-600 text-lg mb-6 italic">{cocktail.description}</p>
          )}

          {user && cocktail.notes && (
            <div className="mb-6 rounded-xl border border-accent/20 bg-accent/5 p-4 print:border-gray-300 print:bg-gray-50">
              <h2 className={`${SECTION_TITLE_CLASSES} mb-2`}>{t('cocktails.notes')}</h2>
              <p className="text-sm leading-6 text-gray-300 print:text-black whitespace-pre-wrap">{cocktail.notes}</p>
            </div>
          )}

          {cocktail.ingredients && cocktail.ingredients.length > 0 && (
            <div className="mb-6">
              <h2 className={`${SECTION_TITLE_CLASSES} mb-3`}>{t('public.ingredients')}</h2>
              <ul className="space-y-2">
                {cocktail.ingredients.map((ing) => (
                  <li key={ing.id} className="rounded-lg border border-transparent print:border-none">
                    <div className="flex items-center gap-3">
                      <span className="w-1.5 h-1.5 bg-accent print:bg-gray-800 rounded-full flex-shrink-0" />
                      <span className="text-gray-300 print:text-black">
                        <UnitConverter quantity={ing.quantity} unit={ing.unit?.abbreviation || ''} />
                        {' '}
                        <span>{ingredientName(ing)}</span>
                      </span>
                    </div>

                    {user && ing.preferredBottles && ing.preferredBottles.length > 0 && (
                      <div className="ml-6 mt-2 flex flex-wrap gap-2">
                        <span className="text-xs font-medium uppercase tracking-wider text-gray-500 print:text-gray-600">
                          {t('cocktails.preferredBottles')}
                        </span>
                        {ing.preferredBottles.map((preferredBottle) => (
                          <span
                            key={preferredBottle.id}
                            className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs text-amber-200 print:border-gray-300 print:bg-gray-100 print:text-gray-800"
                          >
                            {preferredBottle.bottle?.name || ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-line print:border-gray-300 my-6" />

          {cocktail.instructions && cocktail.instructions.length > 0 && (
            <div className="mb-6">
              <h2 className={`${SECTION_TITLE_CLASSES} mb-3`}>{t('public.instructions')}</h2>
              <ol className="space-y-3">
                {cocktail.instructions.map((inst) => (
                  <li key={inst.id} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-accent/10 print:bg-gray-100 text-accent print:text-gray-800 rounded-full flex items-center justify-center text-xs font-bold">
                      {inst.stepNumber}
                    </span>
                    <span className="text-gray-300 print:text-black pt-0.5">{inst.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* Secondary actions: guests come to read the recipe, not to export it */}
      <div className="flex justify-center gap-3 mt-6 print:hidden">
        <ExportCocktailButton
          cocktailId={cocktail.id}
          isPublic
          className="inline-flex items-center justify-center rounded-lg border border-accent/30 px-3 py-1.5 text-sm text-accent hover:bg-accent/10 transition-colors"
        />
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <span aria-hidden="true">🖨️</span> {t('public.print')}
        </Button>
      </div>
    </div>
  );
}
