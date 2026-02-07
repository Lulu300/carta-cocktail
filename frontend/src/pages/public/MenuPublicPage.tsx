import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { publicApi } from '../../services/api';
import type { Menu } from '../../types';

export default function MenuPublicPage() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const { user } = useAuth();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    publicApi.getMenu(slug).then(setMenu).catch(() => setError(true));
  }, [slug]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <span className="text-6xl mb-4 block">🍸</span>
          <h1 className="text-2xl font-bold text-gray-400">{t('public.menuNotFound')}</h1>
        </div>
      </div>
    );
  }

  if (!menu) {
    return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;
  }

  const isBottleMenu = menu.type === 'APEROS' || menu.type === 'DIGESTIFS';

  // Group bottles by category for bottle menus
  const bottlesByCategory = isBottleMenu
    ? (menu.bottles || [])
        .filter((mb) => !mb.isHidden)
        .reduce((acc, mb) => {
          const categoryName = mb.bottle?.category?.name || 'Autres';
          if (!acc[categoryName]) acc[categoryName] = [];
          acc[categoryName].push(mb);
          return acc;
        }, {} as Record<string, typeof menu.bottles>)
    : {};

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold font-serif text-amber-400 mb-3">{menu.name}</h1>
        {menu.description && <p className="text-gray-400 text-lg">{menu.description}</p>}
      </div>

      {isBottleMenu ? (
        // Bottle menu display (list format)
        <div className="space-y-8">
          {Object.entries(bottlesByCategory)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([categoryName, bottles]) => (
              <div key={categoryName} className="bg-[#1a1a2e] border border-gray-800 rounded-xl overflow-hidden">
                <div className="bg-[#0f0f1a] px-6 py-3 border-b border-gray-800">
                  <h2 className="text-lg font-serif font-bold text-amber-400">{categoryName}</h2>
                </div>
                <div className="divide-y divide-gray-800">
                  {bottles
                    .sort((a, b) => (a.bottle?.name || '').localeCompare(b.bottle?.name || ''))
                    .map((mb) => {
                      const bottle = mb.bottle!;
                      const isAvailable = bottle.remainingPercent > 0;

                      return (
                        <div
                          key={mb.id}
                          className={`px-6 py-4 flex items-center justify-between ${
                            !isAvailable ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex-1">
                            <h3 className="text-lg font-medium text-white">{bottle.name}</h3>
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                              {bottle.alcoholPercentage && (
                                <span>{bottle.alcoholPercentage}% vol.</span>
                              )}
                              {user && (
                                <>
                                  <span>•</span>
                                  <span>{bottle.capacityMl} ml</span>
                                  <span>•</span>
                                  <span className={bottle.remainingPercent > 50 ? 'text-green-400' : bottle.remainingPercent > 20 ? 'text-yellow-400' : 'text-red-400'}>
                                    {bottle.remainingPercent}% restant
                                  </span>
                                  {bottle.openedAt && (
                                    <>
                                      <span>•</span>
                                      <span className="text-orange-400">Ouvert</span>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <div>
                            {!user && (
                              <span className={`px-3 py-1.5 rounded text-sm font-medium ${
                                isAvailable
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}>
                                {isAvailable ? 'Disponible' : 'Indisponible'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
        </div>
      ) : (
        // Cocktail menu display (grid format)
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {menu.cocktails
            ?.filter((mc) => !mc.isHidden)
            .map((mc) => {
              const cocktail = mc.cocktail!;
              const isUnavailable = !cocktail.isAvailable;

              return (
                <Link
                  key={mc.id}
                  to={`/menu/${slug}/cocktail/${cocktail.id}`}
                  className={`group bg-[#1a1a2e] border rounded-xl overflow-hidden transition-all duration-300 ${
                    isUnavailable
                      ? 'border-gray-800 opacity-50 grayscale cursor-default'
                      : 'border-gray-800 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-400/5'
                  }`}
                  onClick={(e) => isUnavailable && e.preventDefault()}
                >
                  <div className="aspect-video bg-[#0f0f1a] flex items-center justify-center overflow-hidden">
                    {cocktail.imagePath ? (
                      <img
                        src={`/uploads/${cocktail.imagePath}`}
                        alt={cocktail.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <span className="text-5xl">🍸</span>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-xl font-serif font-bold text-white group-hover:text-amber-400 transition-colors">
                        {cocktail.name}
                      </h2>
                      {isUnavailable && (
                        <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
                          {t('public.unavailable')}
                        </span>
                      )}
                    </div>
                    {cocktail.description && (
                      <p className="text-gray-400 text-sm line-clamp-2">{cocktail.description}</p>
                    )}
                    {cocktail.ingredients && cocktail.ingredients.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {cocktail.ingredients.map((ing) => (
                          <span key={ing.id} className="text-xs bg-[#0f0f1a] text-gray-400 px-2 py-1 rounded">
                            {ing.bottle?.name || ing.category?.name || ing.ingredient?.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
        </div>
      )}
    </div>
  );
}
