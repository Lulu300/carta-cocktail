import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { units as api } from '../../services/api';
import type { Unit } from '../../types';

export default function UnitsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Unit[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [form, setForm] = useState({ name: '', abbreviation: '', conversionFactorToMl: '' });

  const load = () => api.list().then(setItems);
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', abbreviation: '', conversionFactorToMl: '' }); setShowModal(true); };
  const openEdit = (item: Unit) => {
    setEditing(item);
    setForm({
      name: item.name,
      abbreviation: item.abbreviation,
      conversionFactorToMl: item.conversionFactorToMl !== null ? String(item.conversionFactorToMl) : '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: form.name,
      abbreviation: form.abbreviation,
      conversionFactorToMl: form.conversionFactorToMl === '' ? null : parseFloat(form.conversionFactorToMl),
    };
    if (editing) { await api.update(editing.id, data); }
    else { await api.create(data); }
    setShowModal(false);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('units.confirmDelete'))) return;
    await api.delete(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif text-amber-400">{t('units.title')}</h1>
        <button onClick={openCreate} className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg">{t('units.add')}</button>
      </div>
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#0f0f1a]">
            <tr>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('units.name')}</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('units.abbreviation')}</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">Facteur de conversion (ml)</th>
              <th className="text-right px-6 py-3 text-sm text-gray-400 font-medium">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-800/50">
                <td className="px-6 py-4 font-medium">{item.name}</td>
                <td className="px-6 py-4 text-gray-400">{item.abbreviation}</td>
                <td className="px-6 py-4 text-gray-400">
                  {item.conversionFactorToMl !== null ? (
                    <span>1 {item.abbreviation} = {item.conversionFactorToMl} ml</span>
                  ) : (
                    <span className="text-gray-600 italic">Non convertible</span>
                  )}
                </td>
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
            <h2 className="text-lg font-semibold">{editing ? t('units.edit') : t('units.add')}</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('units.name')}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('units.abbreviation')}</label>
              <input value={form.abbreviation} onChange={(e) => setForm({ ...form, abbreviation: e.target.value })} required className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Facteur de conversion vers ml</label>
              <input
                type="number"
                step="any"
                value={form.conversionFactorToMl}
                onChange={(e) => setForm({ ...form, conversionFactorToMl: e.target.value })}
                placeholder="Laisser vide si non convertible"
                className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400"
              />
              <p className="text-xs text-gray-500 mt-1">Ex: 1 cl = 10 ml, donc facteur = 10. Laisser vide pour les unités de pièce.</p>
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
