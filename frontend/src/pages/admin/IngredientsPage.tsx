import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ingredients as api } from '../../services/api';
import type { Ingredient } from '../../types';

export default function IngredientsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Ingredient[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [name, setName] = useState('');

  const load = () => api.list().then(setItems);
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setName(''); setShowModal(true); };
  const openEdit = (item: Ingredient) => { setEditing(item); setName(item.name); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) { await api.update(editing.id, { name }); }
    else { await api.create({ name }); }
    setShowModal(false);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('ingredients.confirmDelete'))) return;
    await api.delete(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif text-amber-400">{t('ingredients.title')}</h1>
        <button onClick={openCreate} className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg">{t('ingredients.add')}</button>
      </div>
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#0f0f1a]">
            <tr>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('ingredients.name')}</th>
              <th className="text-right px-6 py-3 text-sm text-gray-400 font-medium">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-800/50">
                <td className="px-6 py-4 font-medium">{item.name}</td>
                <td className="px-6 py-4 text-right space-x-2">
                  <button onClick={() => openEdit(item)} className="text-amber-400 hover:text-amber-300 text-sm">{t('common.edit')}</button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300 text-sm">{t('common.delete')}</button>
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
            <h2 className="text-lg font-semibold">{editing ? t('ingredients.edit') : t('ingredients.add')}</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('ingredients.name')}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
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
