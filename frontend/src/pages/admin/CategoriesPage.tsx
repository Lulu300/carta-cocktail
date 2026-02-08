import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import { categories as api } from '../../services/api';
import type { Category } from '../../types';

export default function CategoriesPage() {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const [items, setItems] = useState<Category[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', type: 'SPIRIT' as 'SPIRIT' | 'SYRUP', desiredStock: 1, nameFr: '', nameEn: '' });
  const [showTranslations, setShowTranslations] = useState(false);

  const load = () => api.list().then(setItems);
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', type: 'SPIRIT', desiredStock: 1, nameFr: '', nameEn: '' });
    setShowTranslations(false);
    setShowModal(true);
  };

  const openEdit = (item: Category) => {
    setEditing(item);
    setForm({
      name: item.name,
      type: item.type,
      desiredStock: item.desiredStock,
      nameFr: item.nameTranslations?.fr || '',
      nameEn: item.nameTranslations?.en || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTranslations: Record<string, string> = {};
    if (form.nameFr.trim()) nameTranslations.fr = form.nameFr.trim();
    if (form.nameEn.trim()) nameTranslations.en = form.nameEn.trim();
    const data = {
      name: form.name,
      type: form.type,
      desiredStock: form.desiredStock,
      nameTranslations: Object.keys(nameTranslations).length > 0 ? nameTranslations : null,
    };
    if (editing) {
      await api.update(editing.id, data);
    } else {
      await api.create(data);
    }
    setShowModal(false);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('categories.confirmDelete'))) return;
    await api.delete(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif text-amber-400">{t('categories.title')}</h1>
        <button onClick={openCreate} className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg transition-colors">
          {t('categories.add')}
        </button>
      </div>

      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#0f0f1a]">
            <tr>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('categories.name')}</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('categories.type')}</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('categories.desiredStock')}</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('categories.bottleCount')}</th>
              <th className="text-right px-6 py-3 text-sm text-gray-400 font-medium">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-800/50">
                <td className="px-6 py-4 font-medium">{localize(item)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${item.type === 'SPIRIT' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                    {t(`categories.${item.type.toLowerCase()}`)}
                  </span>
                </td>
                <td className="px-6 py-4">{item.desiredStock}</td>
                <td className="px-6 py-4">{item._count?.bottles ?? 0}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => openEdit(item)} className="text-amber-400 hover:text-amber-300 transition-colors" title={t('common.edit')}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300 transition-colors" title={t('common.delete')}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="text-center py-8 text-gray-500">{t('common.noResults')}</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <form onSubmit={handleSubmit} className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">{editing ? t('categories.edit') : t('categories.add')}</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('categories.name')}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
            </div>
            <div className="border border-gray-700 rounded-lg p-3 space-y-2">
              <button type="button" onClick={() => setShowTranslations(!showTranslations)}
                className="text-sm text-gray-400 flex items-center gap-2 w-full text-left">
                <svg className={`w-3 h-3 transition-transform ${showTranslations ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20"><path d="M6 6L14 10L6 14V6Z"/></svg>
                {t('common.translations')}
              </button>
              {showTranslations && (
                <div className="space-y-2 pt-1">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Français</label>
                    <input value={form.nameFr} onChange={(e) => setForm({ ...form, nameFr: e.target.value })}
                      placeholder={form.name || '...'} className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">English</label>
                    <input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                      placeholder={form.name || '...'} className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400" />
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('categories.type')}</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'SPIRIT' | 'SYRUP' })} className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400">
                <option value="SPIRIT">{t('categories.spirit')}</option>
                <option value="SYRUP">{t('categories.syrup')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('categories.desiredStock')}</label>
              <input type="number" min="0" value={form.desiredStock} onChange={(e) => setForm({ ...form, desiredStock: parseInt(e.target.value) || 0 })} className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">{t('common.cancel')}</button>
              <button type="submit" className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg">{t('common.save')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
