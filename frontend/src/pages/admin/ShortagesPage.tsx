import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import { shortages as api } from '../../services/api';
import type { Shortage } from '../../types';
import { getBadgeClasses } from '../../utils/colors';

export default function ShortagesPage() {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const [items, setItems] = useState<Shortage[]>([]);

  useEffect(() => { api.list().then(setItems); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold font-serif text-amber-400 mb-6">{t('shortages.title')}</h1>
      {items.length === 0 ? (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-6 py-8 rounded-xl text-center text-lg">
          {t('shortages.noShortages')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const deficit = item.requiredPercent - item.totalPercent;
            return (
              <div key={item.category.id} className="bg-[#1a1a2e] border border-red-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-lg">{localize(item.category)}</h3>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getBadgeClasses(item.category.categoryType?.color)}`}>
                    {item.category.categoryType ? localize(item.category.categoryType) : item.category.type}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('shortages.currentStock')}</span>
                    <span className="text-white">{item.totalPercent}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('shortages.required')}</span>
                    <span className="text-white">{item.requiredPercent}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (item.totalPercent / item.requiredPercent) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('shortages.deficit')}</span>
                    <span className="text-red-400 font-bold">-{deficit}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('shortages.totalUsable')}</span>
                    <span className="text-white">{item.totalUsable}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-800 pt-2 mt-2">
                    <span className="text-gray-400">{t('shortages.desired')}</span>
                    <span className="text-white">{item.category.desiredStock}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t('shortages.threshold')}</span>
                    <span className="text-amber-400">{item.category.minimumPercent}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
