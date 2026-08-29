import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import { useAuth } from '../../contexts/AuthContext';
import { publicApi, availability } from '../../services/api';
import type { Menu, MenuBottle, MenuCocktail, CocktailAvailability } from '../../types';
import { matchesCocktailSearch } from '../../utils/cocktailSearch';
import PublicCocktailItem from './PublicCocktailItem';

interface BottleGroupEntry {
  name: string;
  capacityMl: number;
  categoryId: number;
  alcoholPercentage: number | null;
  count: number;
  locations: { name: string; count: number }[];
  menuBottles: MenuBottle[];
}

function groupMenuBottles(bottles: MenuBottle[]): BottleGroupEntry[] {
  const groups = new Map<string, BottleGroupEntry>();
  for (const mb of bottles) {
    const b = mb.bottle!;
    const key = `${b.name.toLowerCase()}|${b.capacityMl}|${b.categoryId}|${b.alcoholPercentage ?? ''}`;
    if (!groups.has(key)) {
      groups.set(key, {
        name: b.name, capacityMl: b.capacityMl, categoryId: b.categoryId,
        alcoholPercentage: b.alcoholPercentage, count: 0, locations: [], menuBottles: [],
      });
    }
    const g = groups.get(key)!;
    g.count++;
    g.menuBottles.push(mb);
    if (b.location) {
      const loc = g.locations.find(l => l.name.toLowerCase() === b.location!.toLowerCase());
      if (loc) loc.count++; else g.locations.push({ name: b.location, count: 1 });
    }
  }
  // Sort locations by count descending
  for (const g of groups.values()) {
    g.locations.sort((a, b) => b.count - a.count);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function MenuPublicPage() {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const { slug } = useParams();
  const { user } = useAuth();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [availabilities, setAvailabilities] = useState<CocktailAvailability[]>([]);
  const [locationsModal, setLocationsModal] = useState<BottleGroupEntry | null>(null);

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
  const matchesSearch = (item: MenuBottle | MenuCocktail) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();

    if (isBottleMenu) {
      const bottle = (item as MenuBottle).bottle;
      return (
        bottle?.name?.toLowerCase().includes(query) ||
        (bottle?.category ? localize(bottle.category).toLowerCase().includes(query) : false)
      );
    } else {
      const cocktail = (item as MenuCocktail).cocktail;
      return cocktail ? matchesCocktailSearch(cocktail, searchQuery, localize) : false;
    }
  };

  // Helper to get availability for a cocktail
  const getAvailability = (cocktailId: number): CocktailAvailability | undefined => {
    return availabilities.find(a => a.cocktailId === cocktailId);
  };

  const MAX_VISIBLE_LOCATIONS = 3;

  const renderGroupedBottles = (bottles: MenuBottle[]) => {
    const groups = groupMenuBottles(bottles);
    return groups.map((group) => (
      <div key={`${group.name}|${group.capacityMl}|${group.categoryId}`} className="px-6 py-4 flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium text-white">{group.name}</h3>
            {user && group.count > 1 && (
              <span className="bg-amber-400/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full">x{group.count}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
            {group.alcoholPercentage !== null && <span>{group.alcoholPercentage}% vol.</span>}
            {user && (
              <>
                <span>•</span>
                <span>{group.capacityMl} ml</span>
              </>
            )}
          </div>
        </div>
        {group.locations.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap justify-end max-w-xs">
            {group.locations.slice(0, MAX_VISIBLE_LOCATIONS).map((loc) => (
              <span key={loc.name} className="bg-gray-700/50 text-gray-400 text-xs px-2 py-0.5 rounded">
                {loc.name}{group.count > 1 && ` (${loc.count})`}
              </span>
            ))}
            {group.locations.length > MAX_VISIBLE_LOCATIONS && (
              <button
                onClick={() => setLocationsModal(group)}
                className="text-amber-400 hover:text-amber-300 text-xs px-1"
              >
                +{group.locations.length - MAX_VISIBLE_LOCATIONS}
              </button>
            )}
          </div>
        )}
      </div>
    ));
  };

  const renderCocktails = (cocktails: MenuCocktail[]) => (
    <div
      data-testid={`public-cocktails-${viewMode}-view`}
      className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : 'space-y-3'}
    >
      {cocktails.map((menuCocktail) => {
        const cocktail = menuCocktail.cocktail!;
        return (
          <PublicCocktailItem
            key={menuCocktail.id}
            menuCocktail={menuCocktail}
            menuSlug={slug || ''}
            viewMode={viewMode}
            availability={user ? getAvailability(cocktail.id) : undefined}
            showAvailability={Boolean(user)}
          />
        );
      })}
    </div>
  );

  // Group bottles/cocktails by section OR by default grouping
  const itemsBySection: Record<string, (MenuBottle | MenuCocktail)[]> = {};

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
        const categoryName = mb.bottle?.category ? localize(mb.bottle.category) : t('public.other');
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

      <div className="flex flex-col sm:flex-row gap-3 mb-8 sm:items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t(isBottleMenu ? 'public.bottleSearchPlaceholder' : 'public.cocktailSearchPlaceholder')}
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
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label={t('public.clearSearch')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {!isBottleMenu && (
          <div className="inline-flex rounded-lg border border-gray-700 bg-[#1a1a2e] p-1 self-start">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                viewMode === 'grid'
                  ? 'bg-amber-400 text-[#0f0f1a] font-semibold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t('cocktails.viewGrid')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                viewMode === 'list'
                  ? 'bg-amber-400 text-[#0f0f1a] font-semibold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t('cocktails.viewList')}
            </button>
          </div>
        )}
      </div>

      {/* Render sections/groups */}
      <div className={isBottleMenu ? "space-y-8" : hasSections ? "space-y-10" : ""}>
        {hasSections ? (
          // Custom sections
          <>
            {/* No section items */}
            {itemsBySection['__no_section__'] && (
              <div>
                <h2 className="text-2xl font-serif font-bold text-gray-400 mb-4">{t('public.withoutSection')}</h2>
                {isBottleMenu ? (
                  <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl overflow-hidden">
                    <div className="divide-y divide-gray-800">
                      {renderGroupedBottles(itemsBySection['__no_section__'] as MenuBottle[])}
                    </div>
                  </div>
                ) : renderCocktails(itemsBySection['__no_section__'] as MenuCocktail[])}
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
                        {renderGroupedBottles(sectionItems as MenuBottle[])}
                      </div>
                    </div>
                  ) : renderCocktails(sectionItems as MenuCocktail[])}
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
                      {renderGroupedBottles(bottles as MenuBottle[])}
                    </div>
                  </div>
                ))
            ) : renderCocktails((itemsBySection['__all__'] as MenuCocktail[]) || [])}
          </>
        )}
      </div>

      {/* Locations modal */}
      {locationsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setLocationsModal(null)}>
          <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{locationsModal.name}</h3>
              <button onClick={() => setLocationsModal(null)} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              {locationsModal.locations.map((loc) => (
                <div key={loc.name} className="flex items-center justify-between px-3 py-2 bg-[#0f0f1a] rounded-lg">
                  <span className="text-gray-300">{loc.name}</span>
                  <span className="text-amber-400 font-medium">{loc.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
