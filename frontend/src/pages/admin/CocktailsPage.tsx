import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cocktails as api, availability as availabilityApi } from '../../services/api';
import type { Cocktail, CocktailAvailability } from '../../types';
import ExportCocktailButton from '../../components/ui/ExportCocktailButton';
import ImportCocktailWizard from '../../components/import/ImportCocktailWizard';
import { exportCocktailsAsZip } from '../../services/exportZip';

export default function CocktailsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Cocktail[]>([]);
  const [availabilities, setAvailabilities] = useState<Record<number, CocktailAvailability>>({});
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

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

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchExport = async () => {
    if (selectedIds.size === 0) return;
    setIsExporting(true);
    try {
      await exportCocktailsAsZip(
        Array.from(selectedIds),
        items.filter((i) => selectedIds.has(i.id)),
      );
      setSelectionMode(false);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Batch export failed:', error);
    } finally {
      setIsExporting(false);
    }
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
        <div className="flex gap-2 items-center">
          {selectionMode ? (
            <>
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === items.length && items.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(items.map((i) => i.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                  className="w-4 h-4 rounded bg-[#0f0f1a] border-gray-700 text-amber-400 accent-amber-400"
                />
                {t('cocktails.selectAll')}
              </label>
              <button
                onClick={handleBatchExport}
                disabled={selectedIds.size === 0 || isExporting}
                className="bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {isExporting
                  ? t('common.loading')
                  : t('cocktails.exportZip', { count: selectedIds.size })}
              </button>
              <button
                onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                className="border border-gray-600 text-gray-400 hover:text-white px-4 py-2 rounded-lg transition-colors"
              >
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectionMode(true)}
                className="border border-gray-600 text-gray-400 hover:text-white px-4 py-2 rounded-lg transition-colors"
                title={t('cocktails.batchExport')}
              >
                <svg className="w-5 h-5 inline-block mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {t('cocktails.batchExport')}
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {t('cocktails.import')}
              </button>
              <Link to="/admin/cocktails/new" className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg transition-colors">
                {t('cocktails.add')}
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((item) => {
          const avail = availabilities[item.id];
          const isSelected = selectedIds.has(item.id);
          return (
            <div
              key={item.id}
              className={`bg-[#1a1a2e] border rounded-xl overflow-hidden transition-colors ${
                selectionMode
                  ? isSelected
                    ? 'border-amber-400 ring-1 ring-amber-400/30'
                    : 'border-gray-800 hover:border-gray-600 cursor-pointer'
                  : 'border-gray-800 hover:border-amber-400/30'
              }`}
              onClick={selectionMode ? () => toggleSelection(item.id) : undefined}
            >
              <div className="aspect-video bg-[#0f0f1a] flex items-center justify-center relative">
                {item.imagePath ? (
                  <img src={`/uploads/${item.imagePath}`} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl">🍸</span>
                )}
                {/* Selection checkbox */}
                {selectionMode && (
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(item.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 rounded bg-[#0f0f1a] border-gray-700 text-amber-400 accent-amber-400 cursor-pointer"
                    />
                  </div>
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

                {!selectionMode && (
                  <div className="flex justify-center gap-3 pt-2 border-t border-gray-800">
                    <Link to={`/admin/cocktails/${item.id}`} className="text-amber-400 hover:text-amber-300 transition-colors p-1" title={t('common.edit')}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </Link>
                    <ExportCocktailButton cocktailId={item.id} cocktailName={item.name} />
                    <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300 transition-colors p-1" title={t('common.delete')}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {items.length === 0 && <div className="text-center py-12 text-gray-500">{t('common.noResults')}</div>}

      {showImport && (
        <ImportCocktailWizard onClose={() => { setShowImport(false); load(); loadAvailability(); }} />
      )}
    </div>
  );
}
