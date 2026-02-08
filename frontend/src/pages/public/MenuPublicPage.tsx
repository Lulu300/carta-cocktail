import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { publicApi, availability } from '../../services/api';
import type { Menu, CocktailAvailability } from '../../types';

export default function MenuPublicPage() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const { user } = useAuth();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [availabilities, setAvailabilities] = useState<CocktailAvailability[]>([]);

  useEffect(() => {
    if (!slug) return;
    publicApi.getMenu(slug).then(setMenu).catch(() => setError(true));
  }, [slug]);

  // Load availabilities for admin users (only for cocktail menus)
  useEffect(() => {
    if (!user || !menu || menu.type === 'APEROS' || menu.type === 'DIGESTIFS') return;
    availability.getAllCocktails()
      .then((data) => {
        // Convert Record to Array if needed
        const availArray = Array.isArray(data) ? data : Object.values(data);
        setAvailabilities(availArray);
      })
      .catch((err) => console.error('Failed to load availabilities:', err));
  }, [user, menu]);

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
  const hasSections = (menu.sections && menu.sections.length > 0) || false;

  // Filter function for search
  const matchesSearch = (item: any) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();

    if (isBottleMenu) {
      const bottle = item.bottle;
      return (
        bottle?.name?.toLowerCase().includes(query) ||
        bottle?.category?.name?.toLowerCase().includes(query)
      );
    } else {
      const cocktail = item.cocktail;
      const tags = cocktail?.tags ? cocktail.tags.split(',').map((t: string) => t.trim().toLowerCase()) : [];
      return (
        cocktail?.name?.toLowerCase().includes(query) ||
        cocktail?.description?.toLowerCase().includes(query) ||
        tags.some((tag: string) => tag.includes(query))
      );
    }
  };

  // Helper to get availability for a cocktail
  const getAvailability = (cocktailId: number): CocktailAvailability | undefined => {
    return availabilities.find(a => a.cocktailId === cocktailId);
  };

  // Group bottles/cocktails by section OR by default grouping
  const itemsBySection: Record<string, any[]> = {};

  if (isBottleMenu) {
    const visibleBottles = (menu.bottles || []).filter((mb) => !mb.isHidden && matchesSearch(mb));

    if (hasSections) {
      // Group by custom sections
      const noSectionBottles = visibleBottles.filter(mb => !mb.menuSectionId);
      if (noSectionBottles.length > 0) {
        itemsBySection['__no_section__'] = noSectionBottles;
      }
      menu.sections?.forEach(section => {
        const sectionBottles = visibleBottles.filter(mb => mb.menuSectionId === section.id);
        if (sectionBottles.length > 0) {
          itemsBySection[`section_${section.id}`] = sectionBottles;
        }
      });
    } else {
      // Default: Group by category
      visibleBottles.forEach(mb => {
        const categoryName = mb.bottle?.category?.name || 'Autres';
        if (!itemsBySection[categoryName]) {
          itemsBySection[categoryName] = [];
        }
        itemsBySection[categoryName].push(mb);
      });
    }
  } else {
    // Cocktail menus
    const visibleCocktails = (menu.cocktails || []).filter((mc) => !mc.isHidden && matchesSearch(mc));

    if (hasSections) {
      // Group by custom sections
      const noSectionCocktails = visibleCocktails.filter(mc => !mc.menuSectionId);
      if (noSectionCocktails.length > 0) {
        itemsBySection['__no_section__'] = noSectionCocktails;
      }
      menu.sections?.forEach(section => {
        const sectionCocktails = visibleCocktails.filter(mc => mc.menuSectionId === section.id);
        if (sectionCocktails.length > 0) {
          itemsBySection[`section_${section.id}`] = sectionCocktails;
        }
      });
    } else {
      // Default: No grouping, all in one list
      itemsBySection['__all__'] = visibleCocktails;
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold font-serif text-amber-400 mb-3">{menu.name}</h1>
        {menu.description && <p className="text-gray-400 text-lg">{menu.description}</p>}
      </div>

      {/* Search bar */}
      <div className="mb-8">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isBottleMenu ? "Rechercher une bouteille..." : "Rechercher par nom ou tag..."}
            className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-amber-400 transition-colors"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Render sections/groups */}
      <div className={isBottleMenu ? "space-y-8" : hasSections ? "space-y-10" : ""}>
        {hasSections ? (
          // Custom sections
          <>
            {/* No section items */}
            {itemsBySection['__no_section__'] && (
              <div>
                <h2 className="text-2xl font-serif font-bold text-gray-400 mb-4">Sans section</h2>
                {isBottleMenu ? (
                  <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl overflow-hidden">
                    <div className="divide-y divide-gray-800">
                      {itemsBySection['__no_section__'].map((mb: any) => {
                        const bottle = mb.bottle!;
                        const isAvailable = bottle.remainingPercent > 0;
                        return (
                          <div key={mb.id} className={`px-6 py-4 flex items-center justify-between ${!isAvailable ? 'opacity-50' : ''}`}>
                            <div className="flex-1">
                              <h3 className="text-lg font-medium text-white">{bottle.name}</h3>
                              <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                                {bottle.alcoholPercentage && <span>{bottle.alcoholPercentage}% vol.</span>}
                                {user && (
                                  <>
                                    <span>•</span>
                                    <span>{bottle.capacityMl} ml</span>
                                    <span>•</span>
                                    <span className={bottle.remainingPercent > 50 ? 'text-green-400' : bottle.remainingPercent > 20 ? 'text-yellow-400' : 'text-red-400'}>
                                      {bottle.remainingPercent}% restant
                                    </span>
                                    {bottle.openedAt && (<><span>•</span><span className="text-orange-400">Ouvert</span></>)}
                                  </>
                                )}
                              </div>
                            </div>
                            {!user && (
                              <span className={`px-3 py-1.5 rounded text-sm font-medium ${isAvailable ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {isAvailable ? 'Disponible' : 'Indisponible'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {itemsBySection['__no_section__'].map((mc: any) => {
                      const cocktail = mc.cocktail!;
                      const isUnavailable = !cocktail.isAvailable;
                      const avail = user ? getAvailability(cocktail.id) : undefined;
                      return (
                        <Link key={mc.id} to={`/menu/${slug}/cocktail/${cocktail.id}`}
                          className={`group bg-[#1a1a2e] border rounded-xl overflow-hidden transition-all duration-300 ${isUnavailable ? 'border-gray-800 opacity-50 grayscale cursor-default' : 'border-gray-800 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-400/5'}`}
                          onClick={(e) => isUnavailable && e.preventDefault()}>
                          <div className="aspect-video bg-[#0f0f1a] flex items-center justify-center overflow-hidden">
                            {cocktail.imagePath ? (
                              <img src={`/uploads/${cocktail.imagePath}`} alt={cocktail.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            ) : (
                              <span className="text-5xl">🍸</span>
                            )}
                          </div>
                          <div className="p-5">
                            <div className="flex items-center justify-between mb-2">
                              <h2 className="text-xl font-serif font-bold text-white group-hover:text-amber-400 transition-colors">{cocktail.name}</h2>
                              <div className="flex items-center gap-2">
                                {user && avail && (
                                  <span className={`text-xs px-2 py-1 rounded font-medium ${
                                    avail.maxServings === 0 ? 'bg-red-500/20 text-red-400' :
                                    avail.maxServings < 3 ? 'bg-yellow-500/20 text-yellow-400' :
                                    'bg-green-500/20 text-green-400'
                                  }`}>
                                    {avail.maxServings} dose{avail.maxServings > 1 ? 's' : ''}
                                  </span>
                                )}
                                {isUnavailable && <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">{t('public.unavailable')}</span>}
                              </div>
                            </div>
                            {cocktail.description && <p className="text-gray-400 text-sm line-clamp-2">{cocktail.description}</p>}
                            {cocktail.tags && cocktail.tags.trim() && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {cocktail.tags.split(',').map((tag, idx) => (
                                  <span key={idx} className="text-xs bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded border border-amber-400/20">
                                    #{tag.trim()}
                                  </span>
                                ))}
                              </div>
                            )}
                            {cocktail.ingredients && cocktail.ingredients.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
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
            )}

            {/* Actual sections */}
            {menu.sections?.map(section => {
              const sectionItems = itemsBySection[`section_${section.id}`];
              if (!sectionItems || sectionItems.length === 0) return null;

              return (
                <div key={section.id}>
                  <h2 className="text-2xl font-serif font-bold text-amber-400 mb-4">{section.name}</h2>
                  {isBottleMenu ? (
                    <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl overflow-hidden">
                      <div className="divide-y divide-gray-800">
                        {sectionItems.map((mb: any) => {
                          const bottle = mb.bottle!;
                          const isAvailable = bottle.remainingPercent > 0;
                          return (
                            <div key={mb.id} className={`px-6 py-4 flex items-center justify-between ${!isAvailable ? 'opacity-50' : ''}`}>
                              <div className="flex-1">
                                <h3 className="text-lg font-medium text-white">{bottle.name}</h3>
                                <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                                  {bottle.alcoholPercentage && <span>{bottle.alcoholPercentage}% vol.</span>}
                                  {user && (
                                    <>
                                      <span>•</span>
                                      <span>{bottle.capacityMl} ml</span>
                                      <span>•</span>
                                      <span className={bottle.remainingPercent > 50 ? 'text-green-400' : bottle.remainingPercent > 20 ? 'text-yellow-400' : 'text-red-400'}>
                                        {bottle.remainingPercent}% restant
                                      </span>
                                      {bottle.openedAt && (<><span>•</span><span className="text-orange-400">Ouvert</span></>)}
                                    </>
                                  )}
                                </div>
                              </div>
                              {!user && (
                                <span className={`px-3 py-1.5 rounded text-sm font-medium ${isAvailable ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                  {isAvailable ? 'Disponible' : 'Indisponible'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {sectionItems.map((mc: any) => {
                        const cocktail = mc.cocktail!;
                        const isUnavailable = !cocktail.isAvailable;
                        const avail = user ? getAvailability(cocktail.id) : undefined;
                        return (
                          <Link key={mc.id} to={`/menu/${slug}/cocktail/${cocktail.id}`}
                            className={`group bg-[#1a1a2e] border rounded-xl overflow-hidden transition-all duration-300 ${isUnavailable ? 'border-gray-800 opacity-50 grayscale cursor-default' : 'border-gray-800 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-400/5'}`}
                            onClick={(e) => isUnavailable && e.preventDefault()}>
                            <div className="aspect-video bg-[#0f0f1a] flex items-center justify-center overflow-hidden">
                              {cocktail.imagePath ? (
                                <img src={`/uploads/${cocktail.imagePath}`} alt={cocktail.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                              ) : (
                                <span className="text-5xl">🍸</span>
                              )}
                            </div>
                            <div className="p-5">
                              <div className="flex items-center justify-between mb-2">
                                <h2 className="text-xl font-serif font-bold text-white group-hover:text-amber-400 transition-colors">{cocktail.name}</h2>
                                <div className="flex items-center gap-2">
                                  {user && avail && (
                                    <span className={`text-xs px-2 py-1 rounded font-medium ${
                                      avail.maxServings === 0 ? 'bg-red-500/20 text-red-400' :
                                      avail.maxServings < 3 ? 'bg-yellow-500/20 text-yellow-400' :
                                      'bg-green-500/20 text-green-400'
                                    }`}>
                                      {avail.maxServings} dose{avail.maxServings > 1 ? 's' : ''}
                                    </span>
                                  )}
                                  {isUnavailable && <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">{t('public.unavailable')}</span>}
                                </div>
                              </div>
                              {cocktail.description && <p className="text-gray-400 text-sm line-clamp-2">{cocktail.description}</p>}
                              {cocktail.tags && cocktail.tags.trim() && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {cocktail.tags.split(',').map((tag, idx) => (
                                    <span key={idx} className="text-xs bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded border border-amber-400/20">
                                      #{tag.trim()}
                                    </span>
                                  ))}
                                </div>
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
            })}
          </>
        ) : (
          // Default grouping
          <>
            {isBottleMenu ? (
              // Bottles grouped by category
              Object.entries(itemsBySection)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([categoryName, bottles]) => (
                  <div key={categoryName} className="bg-[#1a1a2e] border border-gray-800 rounded-xl overflow-hidden">
                    <div className="bg-[#0f0f1a] px-6 py-3 border-b border-gray-800">
                      <h2 className="text-lg font-serif font-bold text-amber-400">{categoryName}</h2>
                    </div>
                    <div className="divide-y divide-gray-800">
                      {bottles
                        .sort((a: any, b: any) => (a.bottle?.name || '').localeCompare(b.bottle?.name || ''))
                        .map((mb: any) => {
                          const bottle = mb.bottle!;
                          const isAvailable = bottle.remainingPercent > 0;
                          return (
                            <div key={mb.id} className={`px-6 py-4 flex items-center justify-between ${!isAvailable ? 'opacity-50' : ''}`}>
                              <div className="flex-1">
                                <h3 className="text-lg font-medium text-white">{bottle.name}</h3>
                                <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                                  {bottle.alcoholPercentage && <span>{bottle.alcoholPercentage}% vol.</span>}
                                  {user && (
                                    <>
                                      <span>•</span>
                                      <span>{bottle.capacityMl} ml</span>
                                      <span>•</span>
                                      <span className={bottle.remainingPercent > 50 ? 'text-green-400' : bottle.remainingPercent > 20 ? 'text-yellow-400' : 'text-red-400'}>
                                        {bottle.remainingPercent}% restant
                                      </span>
                                      {bottle.openedAt && (<><span>•</span><span className="text-orange-400">Ouvert</span></>)}
                                    </>
                                  )}
                                </div>
                              </div>
                              {!user && (
                                <span className={`px-3 py-1.5 rounded text-sm font-medium ${isAvailable ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                  {isAvailable ? 'Disponible' : 'Indisponible'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))
            ) : (
              // Cocktails without grouping
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {itemsBySection['__all__']?.map((mc: any) => {
                  const cocktail = mc.cocktail!;
                  const isUnavailable = !cocktail.isAvailable;
                  const avail = user ? getAvailability(cocktail.id) : undefined;
                  return (
                    <Link key={mc.id} to={`/menu/${slug}/cocktail/${cocktail.id}`}
                      className={`group bg-[#1a1a2e] border rounded-xl overflow-hidden transition-all duration-300 ${isUnavailable ? 'border-gray-800 opacity-50 grayscale cursor-default' : 'border-gray-800 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-400/5'}`}
                      onClick={(e) => isUnavailable && e.preventDefault()}>
                      <div className="aspect-video bg-[#0f0f1a] flex items-center justify-center overflow-hidden">
                        {cocktail.imagePath ? (
                          <img src={`/uploads/${cocktail.imagePath}`} alt={cocktail.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <span className="text-5xl">🍸</span>
                        )}
                      </div>
                      <div className="p-5">
                        <div className="flex items-center justify-between mb-2">
                          <h2 className="text-xl font-serif font-bold text-white group-hover:text-amber-400 transition-colors">{cocktail.name}</h2>
                          <div className="flex items-center gap-2">
                            {user && avail && (
                              <span className={`text-xs px-2 py-1 rounded font-medium ${
                                avail.maxServings === 0 ? 'bg-red-500/20 text-red-400' :
                                avail.maxServings < 3 ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-green-500/20 text-green-400'
                              }`}>
                                {avail.maxServings} dose{avail.maxServings > 1 ? 's' : ''}
                              </span>
                            )}
                            {isUnavailable && <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">{t('public.unavailable')}</span>}
                          </div>
                        </div>
                        {cocktail.description && <p className="text-gray-400 text-sm line-clamp-2">{cocktail.description}</p>}
                        {cocktail.tags && cocktail.tags.trim() && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {cocktail.tags.split(',').map((tag, idx) => (
                              <span key={idx} className="text-xs bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded border border-amber-400/20">
                                #{tag.trim()}
                              </span>
                            ))}
                          </div>
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
          </>
        )}
      </div>
    </div>
  );
}
