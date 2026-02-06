import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cocktails as api } from '../../services/api';
import type { Cocktail } from '../../types';

export default function CocktailsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Cocktail[]>([]);

  const load = () => api.list().then(setItems);
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm(t('cocktails.confirmDelete'))) return;
    await api.delete(id);
    load();
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
        {items.map((item) => (
          <div key={item.id} className="bg-[#1a1a2e] border border-gray-800 rounded-xl overflow-hidden hover:border-amber-400/30 transition-colors">
            <div className="aspect-video bg-[#0f0f1a] flex items-center justify-center">
              {item.imagePath ? (
                <img src={`/uploads/${item.imagePath}`} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl">🍸</span>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold truncate">{item.name}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.isAvailable ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {item.isAvailable ? t('cocktails.available') : t('cocktails.unavailable')}
                </span>
              </div>
              {item.description && <p className="text-sm text-gray-400 line-clamp-2 mb-3">{item.description}</p>}
              <div className="flex gap-2">
                <Link to={`/admin/cocktails/${item.id}`} className="text-amber-400 hover:text-amber-300 text-sm">{t('common.edit')}</Link>
                <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300 text-sm">{t('common.delete')}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && <div className="text-center py-12 text-gray-500">{t('common.noResults')}</div>}
    </div>
  );
}
