import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { menus as api } from '../../services/api';
import type { Menu } from '../../types';

export default function MenusPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Menu[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', description: '', isPublic: false });

  const load = () => api.list().then(setItems);
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.create(form);
    setShowModal(false);
    setForm({ name: '', slug: '', description: '', isPublic: false });
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('menus.confirmDelete'))) return;
    await api.delete(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif text-amber-400">{t('menus.title')}</h1>
        <button onClick={() => setShowModal(true)} className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg">
          {t('menus.add')}
        </button>
      </div>

      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#0f0f1a]">
            <tr>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('menus.name')}</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">Type</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('menus.slug')}</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">{t('menus.isPublic')}</th>
              <th className="text-left px-6 py-3 text-sm text-gray-400 font-medium">Contenu</th>
              <th className="text-right px-6 py-3 text-sm text-gray-400 font-medium">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {items.map((item) => {
              const isDefaultMenu = item.slug === 'aperitifs' || item.slug === 'digestifs';
              const isBottleMenu = item.type === 'APEROS' || item.type === 'DIGESTIFS';
              const editLink = isBottleMenu ? `/admin/menus/${item.id}/bottles` : `/admin/menus/${item.id}`;

              return (
                <tr key={item.id} className="hover:bg-gray-800/50">
                  <td className="px-6 py-4 font-medium">
                    <a
                      href={`/menu/${item.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white hover:text-amber-400 transition-colors"
                      title={item.isPublic ? t('menus.publicUrl') : t('menus.edit')}
                    >
                      {item.name}
                    </a>
                    {isDefaultMenu && <span className="ml-2 text-xs text-gray-500">(par défaut)</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      item.type === 'COCKTAILS' ? 'bg-purple-500/20 text-purple-400' :
                      item.type === 'APEROS' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-orange-500/20 text-orange-400'
                    }`}>
                      {item.type === 'COCKTAILS' ? 'Cocktails' :
                       item.type === 'APEROS' ? 'Apéritifs' : 'Digestifs'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400">/menu/{item.slug}</td>
                  <td className="px-6 py-4">
                    {item.isPublic ? (
                      <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs font-medium">{t('common.yes')}</span>
                    ) : (
                      <span className="bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded text-xs font-medium">{t('common.no')}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-400">
                    {isBottleMenu
                      ? `${item._count?.bottles ?? 0} bouteille(s)`
                      : `${item._count?.cocktails ?? 0} cocktail(s)`
                    }
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link to={editLink} className="text-amber-400 hover:text-amber-300 transition-colors" title={t('common.edit')}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </Link>
                      {!isDefaultMenu && (
                        <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300 transition-colors" title={t('common.delete')}>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && <div className="text-center py-8 text-gray-500">{t('common.noResults')}</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <form onSubmit={handleCreate} className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">{t('menus.add')}</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('menus.name')}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('menus.slug')}</label>
              <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} required
                className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('menus.description')}</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400 resize-none" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-400">{t('menus.isPublic')}</label>
              <button type="button" onClick={() => setForm({ ...form, isPublic: !form.isPublic })}
                className={`w-12 h-6 rounded-full transition-colors ${form.isPublic ? 'bg-green-500' : 'bg-gray-600'}`}>
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${form.isPublic ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
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
