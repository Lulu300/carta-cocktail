import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cocktails as api, availability as availabilityApi } from '../../services/api';
import type { Cocktail, CocktailAvailability } from '../../types';

export default function CocktailsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Cocktail[]>([]);
  const [availabilities, setAvailabilities] = useState<Record<number, CocktailAvailability>>({});
  const [loadingAvailability, setLoadingAvailability] = useState(true);

  const load = () => api.list().then(setItems);

  const loadAvailability = async () => {
    try {
      setLoadingAvailability(true);
      const data = await availabilityApi.getAllCocktails();
      setAvailabilities(data);
    } catch (error) {
      console.error('Failed to load availability:', error);
    } finally {
      setLoadingAvailability(false);
    }
  };

  useEffect(() => {
    load();
    loadAvailability();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm(t('cocktails.confirmDelete'))) return;
    await api.delete(id);
    load();
  };

  const getAvailabilityBadge = (cocktailId: number) => {
    const avail = availabilities[cocktailId];
    if (!avail || loadingAvailability) {
      return <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400">...</span>;
    }

    if (!avail.isAvailable) {
      return (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">
          Indisponible
        </span>
      );
    }

    const servingsText = avail.maxServings >= 999 ? '∞' : avail.maxServings;
    const colorClass = avail.maxServings <= 3 ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400';

    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
        {servingsText} {avail.maxServings === 1 ? 'dose' : 'doses'}
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif text-amber-400">{t('cocktails.title')}</h1>
        <Link to="/admin/cocktails/new" className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg transition-colors">
          {t('cocktails.add')}
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((item) => {
          const avail = availabilities[item.id];
          return (
            <div key={item.id} className="bg-[#1a1a2e] border border-gray-800 rounded-xl overflow-hidden hover:border-amber-400/30 transition-colors">
              <div className="aspect-video bg-[#0f0f1a] flex items-center justify-center relative">
                {item.imagePath ? (
                  <img src={`/uploads/${item.imagePath}`} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl">🍸</span>
                )}
                {/* Availability badge overlay */}
                {avail && !loadingAvailability && (
                  <div className="absolute top-2 right-2">
                    {getAvailabilityBadge(item.id)}
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold flex-1">{item.name}</h3>
                </div>

                {item.description && <p className="text-sm text-gray-400 line-clamp-2 mb-2">{item.description}</p>}

                {item.tags && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {item.tags.split(',').map((tag, i) => (
                      <span key={i} className="bg-amber-400/10 text-amber-400 text-xs px-2 py-0.5 rounded-full">{tag.trim()}</span>
                    ))}
                  </div>
                )}

                {/* Stock warnings */}
                {avail && !loadingAvailability && (
                  <>
                    {avail.lowStockWarnings.length > 0 && (
                      <div className="mb-2 p-2 bg-orange-500/10 border border-orange-500/20 rounded text-xs text-orange-400">
                        <div className="font-medium mb-1">⚠️ Stock faible</div>
                        {avail.lowStockWarnings.slice(0, 2).map((warn, i) => (
                          <div key={i} className="text-orange-300/80">{warn}</div>
                        ))}
                      </div>
                    )}
                    {avail.missingIngredients.length > 0 && (
                      <div className="mb-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                        <div className="font-medium mb-1">❌ Manquant</div>
                        {avail.missingIngredients.slice(0, 2).map((miss, i) => (
                          <div key={i} className="text-red-300/80 truncate">{miss}</div>
                        ))}
                        {avail.missingIngredients.length > 2 && (
                          <div className="text-red-300/60">+{avail.missingIngredients.length - 2} autre(s)</div>
                        )}
                      </div>
                    )}
                  </>
                )}

                <div className="flex gap-2 pt-2 border-t border-gray-800">
                  <Link to={`/admin/cocktails/${item.id}`} className="text-amber-400 hover:text-amber-300 text-sm">{t('common.edit')}</Link>
                  <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300 text-sm">{t('common.delete')}</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {items.length === 0 && <div className="text-center py-12 text-gray-500">{t('common.noResults')}</div>}
    </div>
  );
}
