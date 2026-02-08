import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import { bottles as api, categories as categoriesApi } from '../../services/api';
import type { Bottle, Category } from '../../types';

export default function BottlesPage() {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const [items, setItems] = useState<Bottle[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Bottle | null>(null);
  const [form, setForm] = useState({
    name: '', categoryId: 0, purchasePrice: '', capacityMl: 700,
    remainingPercent: 100, openedAt: '', alcoholPercentage: '',
    isApero: false, isDigestif: false,
  });

  const load = () => {
    const params = filter ? { type: filter } : undefined;
    api.list(params).then(setItems);
  };
  useEffect(() => { categoriesApi.list().then(setCats); }, []);
  useEffect(() => { load(); }, [filter]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', categoryId: cats[0]?.id || 0, purchasePrice: '', capacityMl: 700, remainingPercent: 100, openedAt: '', alcoholPercentage: '', isApero: false, isDigestif: false });
    setShowModal(true);
  };

  const openEdit = (item: Bottle) => {
    setEditing(item);
    setForm({
      name: item.name,
      categoryId: item.categoryId,
      purchasePrice: item.purchasePrice?.toString() || '',
      capacityMl: item.capacityMl,
      remainingPercent: item.remainingPercent,
      openedAt: item.openedAt ? item.openedAt.split('T')[0] : '',
      alcoholPercentage: item.alcoholPercentage?.toString() || '',
      isApero: item.isApero,
      isDigestif: item.isDigestif,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: form.name,
      categoryId: form.categoryId,
      purchasePrice: form.purchasePrice ? parseFloat(form.purchasePrice) : null,
      capacityMl: form.capacityMl,
      remainingPercent: form.remainingPercent,
      openedAt: form.openedAt || null,
      alcoholPercentage: form.alcoholPercentage ? parseFloat(form.alcoholPercentage) : null,
      isApero: form.isApero,
      isDigestif: form.isDigestif,
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
    if (!confirm(t('bottles.confirmDelete'))) return;
    await api.delete(id);
    load();
  };

  const remainingColor = (pct: number) => {
    if (pct > 50) return 'bg-green-500';
    if (pct > 20) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif text-amber-400">{t('bottles.title')}</h1>
        <button onClick={openCreate} className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg transition-colors">
          {t('bottles.add')}
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {['', 'SPIRIT', 'SYRUP'].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === f ? 'bg-amber-400 text-[#0f0f1a] font-semibold' : 'bg-[#1a1a2e] text-gray-400 hover:text-white border border-gray-800'}`}>
            {f ? t(`categories.${f.toLowerCase()}`) : t('bottles.all')}
          </button>
        ))}
      </div>

      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#0f0f1a]">
            <tr>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('bottles.name')}</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('bottles.category')}</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('bottles.capacityMl')}</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('bottles.remainingPercent')}</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('bottles.openedAt')}</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('bottles.purchasePrice')}</th>
              <th className="text-right px-6 py-3 text-sm text-gray-400 font-medium">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-800/50">
                <td className="px-6 py-4 font-medium">{item.name}</td>
                <td className="px-6 py-4 text-gray-400">{item.category ? localize(item.category) : ''}</td>
                <td className="px-6 py-4">{item.capacityMl} ml</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full ${remainingColor(item.remainingPercent)} rounded-full`} style={{ width: `${item.remainingPercent}%` }} />
                    </div>
                    <span className="text-sm">{item.remainingPercent}%</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${item.openedAt ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>
                    {item.openedAt ? t('bottles.opened') : t('bottles.unopened')}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-400">{item.purchasePrice ? `${item.purchasePrice} €` : '-'}</td>
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
            <h2 className="text-lg font-semibold">{editing ? t('bottles.edit') : t('bottles.add')}</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('bottles.name')}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('bottles.category')}</label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: parseInt(e.target.value) })} className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400">
                {cats.map((c) => <option key={c.id} value={c.id}>{localize(c)} ({t(`categories.${c.type.toLowerCase()}`)})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('bottles.capacityMl')}</label>
                <input type="number" min="1" value={form.capacityMl} onChange={(e) => setForm({ ...form, capacityMl: parseInt(e.target.value) || 0 })} className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('bottles.purchasePrice')}</label>
                <input type="number" step="0.01" min="0" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('bottles.remainingPercent')}: {form.remainingPercent}%</label>
              <input type="range" min="0" max="100" value={form.remainingPercent} onChange={(e) => setForm({ ...form, remainingPercent: parseInt(e.target.value) })} className="w-full accent-amber-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('bottles.openedAt')}</label>
              <input type="date" value={form.openedAt} onChange={(e) => setForm({ ...form, openedAt: e.target.value })} className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Alcool % (vol.)</label>
              <input type="number" step="0.1" min="0" max="100" value={form.alcoholPercentage} onChange={(e) => setForm({ ...form, alcoholPercentage: e.target.value })} className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" placeholder="Ex: 40" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-gray-400 mb-2">Utilisation</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isApero} onChange={(e) => setForm({ ...form, isApero: e.target.checked })} className="w-4 h-4 rounded bg-[#0f0f1a] border-gray-700 text-amber-400 focus:ring-amber-400 focus:ring-offset-0" />
                <span className="text-sm">Utilisable comme apéritif</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isDigestif} onChange={(e) => setForm({ ...form, isDigestif: e.target.checked })} className="w-4 h-4 rounded bg-[#0f0f1a] border-gray-700 text-amber-400 focus:ring-amber-400 focus:ring-offset-0" />
                <span className="text-sm">Utilisable comme digestif</span>
              </label>
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
