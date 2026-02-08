import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import { publicApi } from '../../services/api';
import type { Cocktail } from '../../types';
import UnitConverter from '../../components/ui/UnitConverter';
import ExportCocktailButton from '../../components/ui/ExportCocktailButton';

export default function CocktailPublicPage() {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const { id, slug } = useParams();
  const navigate = useNavigate();
  const [cocktail, setCocktail] = useState<Cocktail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    publicApi.getCocktail(parseInt(id)).then(setCocktail).catch(() => setError(true));
  }, [id]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <span className="text-6xl mb-4 block">🍸</span>
          <h1 className="text-2xl font-bold text-gray-400">{t('public.cocktailNotFound')}</h1>
        </div>
      </div>
    );
  }

  if (!cocktail) {
    return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;
  }

  const ingredientName = (ing: any) => {
    if (ing.bottle) return ing.bottle.name;
    if (ing.category) return localize(ing.category);
    if (ing.ingredient) return localize(ing.ingredient);
    return '?';
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back button */}
      {slug && (
        <button
          onClick={() => navigate(`/menu/${slug}`)}
          className="text-amber-400 hover:text-amber-300 mb-6 inline-flex items-center gap-2 text-sm"
        >
          ← {t('public.back')}
        </button>
      )}

      {/* Recipe card - printable */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl print:border-gray-300 print:bg-white print:text-black print:rounded-none" id="recipe-card">
        {/* Image */}
        {cocktail.imagePath && (
          <div className="aspect-video overflow-hidden rounded-t-xl">
            <img
              src={`/uploads/${cocktail.imagePath}`}
              alt={cocktail.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-8">
          {/* Title */}
          <h1 className="text-3xl font-bold font-serif text-amber-400 print:text-black mb-2">
            {cocktail.name}
          </h1>
          {cocktail.description && (
            <p className="text-gray-400 print:text-gray-600 text-lg mb-6 italic">{cocktail.description}</p>
          )}

          {/* Ingredients */}
          {cocktail.ingredients && cocktail.ingredients.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-serif font-bold text-amber-400/80 print:text-gray-800 mb-3 uppercase tracking-wider text-sm">
                {t('public.ingredients')}
              </h2>
              <ul className="space-y-2">
                {cocktail.ingredients.map((ing) => (
                  <li key={ing.id} className="flex items-center gap-3">
                    <span className="w-1.5 h-1.5 bg-amber-400 print:bg-gray-800 rounded-full flex-shrink-0" />
                    <span className="text-gray-300 print:text-black">
                      <UnitConverter quantity={ing.quantity} unit={ing.unit?.abbreviation || ''} />
                      {' '}
                      <span>{ingredientName(ing)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Separator */}
          <div className="border-t border-gray-800 print:border-gray-300 my-6" />

          {/* Instructions */}
          {cocktail.instructions && cocktail.instructions.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-serif font-bold text-amber-400/80 print:text-gray-800 mb-3 uppercase tracking-wider text-sm">
                {t('public.instructions')}
              </h2>
              <ol className="space-y-3">
                {cocktail.instructions.map((inst) => (
                  <li key={inst.id} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-amber-400/10 print:bg-gray-100 text-amber-400 print:text-gray-800 rounded-full flex items-center justify-center text-xs font-bold">
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

      {/* Action buttons */}
      <div className="flex justify-center gap-3 mt-6 print:hidden">
        <ExportCocktailButton
          cocktailId={cocktail.id}
          cocktailName={cocktail.name}
          isPublic
          className="border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 font-semibold px-6 py-2.5 rounded-lg transition-colors"
        />
        <button
          onClick={() => window.print()}
          className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-6 py-2.5 rounded-lg transition-colors"
        >
          🖨️ {t('public.print')}
        </button>
      </div>
    </div>
  );
}
