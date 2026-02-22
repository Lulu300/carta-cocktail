import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import { categories as api, categoryTypes as ctApi } from '../../services/api';
import type { Category, CategoryType } from '../../types';
import { getBadgeClasses, CATEGORY_TYPE_COLORS, COLOR_DOT_CLASSES } from '../../utils/colors';

export default function CategoriesPage() {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const [items, setItems] = useState<Category[]>([]);
  const [catTypes, setCatTypes] = useState<CategoryType[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', type: 'SPIRIT', customType: '', desiredStock: 1, nameFr: '', nameEn: '' });
  const [showTranslations, setShowTranslations] = useState(false);
  const [showManageTypes, setShowManageTypes] = useState(false);
  const [editingType, setEditingType] = useState<CategoryType | null>(null);
  const [typeForm, setTypeForm] = useState({ name: '', color: 'gray', nameFr: '', nameEn: '' });
  const [showTypeTranslations, setShowTypeTranslations] = useState(false);

  const typeLabel = (type: string) => {
    const ct = catTypes.find(ct => ct.name === type);
    if (ct) return localize(ct);
    return type;
  };

  const load = () => api.list().then(setItems);
  const loadTypes = () => ctApi.list().then(setCatTypes);
  useEffect(() => { load(); loadTypes(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', type: catTypes[0]?.name || 'SPIRIT', customType: '', desiredStock: 1, nameFr: '', nameEn: '' });
    setShowTranslations(false);
    setShowModal(true);
  };

  const openEdit = (item: Category) => {
    setEditing(item);
    const isKnown = catTypes.some(ct => ct.name === item.type);
    setForm({
      name: item.name,
      type: isKnown ? item.type : '__OTHER__',
      customType: isKnown ? '' : item.type,
      desiredStock: item.desiredStock,
      nameFr: item.nameTranslations?.fr || '',
      nameEn: item.nameTranslations?.en || '',
    });
    setShowModal(true);
  };

  const getEffectiveType = () => {
    if (form.type === '__OTHER__') return form.customType.trim().toUpperCase();
    return form.type;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveType = getEffectiveType();
    if (!effectiveType) return;
    const nameTranslations: Record<string, string> = {};
    if (form.nameFr.trim()) nameTranslations.fr = form.nameFr.trim();
    if (form.nameEn.trim()) nameTranslations.en = form.nameEn.trim();
    const data = {
      name: form.name,
      type: effectiveType,
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
    loadTypes();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('categories.confirmDelete'))) return;
    await api.delete(id);
    load();
  };

  // Type management
  const openCreateType = () => {
    setEditingType(null);
    setTypeForm({ name: '', color: 'gray', nameFr: '', nameEn: '' });
    setShowTypeTranslations(false);
    setShowManageTypes(true);
  };

  const openEditType = (ct: CategoryType) => {
    setEditingType(ct);
    setTypeForm({
      name: ct.name,
      color: ct.color || 'gray',
      nameFr: ct.nameTranslations?.fr || '',
      nameEn: ct.nameTranslations?.en || '',
    });
    setShowTypeTranslations(true);
    setShowManageTypes(true);
  };

  const handleTypeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTranslations: Record<string, string> = {};
    if (typeForm.nameFr.trim()) nameTranslations.fr = typeForm.nameFr.trim();
    if (typeForm.nameEn.trim()) nameTranslations.en = typeForm.nameEn.trim();
    const ntData = Object.keys(nameTranslations).length > 0 ? nameTranslations : null;
    if (editingType) {
      await ctApi.update(editingType.name, { nameTranslations: ntData, color: typeForm.color });
    } else {
      const name = typeForm.name.trim().toUpperCase();
      if (!name) return;
      await ctApi.create({ name, nameTranslations: ntData, color: typeForm.color });
    }
    loadTypes();
    load();
    setEditingType(null);
    setTypeForm({ name: '', color: 'gray', nameFr: '', nameEn: '' });
  };

  const handleTypeDelete = async (name: string) => {
    if (!confirm(t('categoryTypes.confirmDelete'))) return;
    try {
      await ctApi.delete(name);
      loadTypes();
    } catch {
      alert(t('categoryTypes.cannotDelete'));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold font-serif text-amber-400">{t('categories.title')}</h1>
          <button onClick={openCreateType}
            className="text-sm text-gray-400 hover:text-amber-400 transition-colors border border-gray-700 hover:border-amber-400/50 rounded-lg px-3 py-1.5">
            {t('categoryTypes.manage')}
          </button>
        </div>
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
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getBadgeClasses(item.categoryType?.color)}`}>
                    {typeLabel(item.type)}
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

      {/* Category create/edit modal */}
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
                    <label className="block text-xs text-gray-500 mb-1">Fran&#231;ais</label>
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
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, customType: '' })} className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400">
                {catTypes.map((ct) => (
                  <option key={ct.name} value={ct.name}>{localize(ct)}</option>
                ))}
                <option value="__OTHER__">{t('categories.otherType')}</option>
              </select>
              {form.type === '__OTHER__' && (
                <input
                  value={form.customType}
                  onChange={(e) => setForm({ ...form, customType: e.target.value })}
                  placeholder={t('categories.customType')}
                  required
                  className="w-full mt-2 bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              )}
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

      {/* Type management modal */}
      {showManageTypes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('categoryTypes.title')}</h2>
              <button onClick={() => setShowManageTypes(false)} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Existing types list */}
            <div className="space-y-2">
              {catTypes.map((ct) => (
                <div key={ct.name} className="flex items-center justify-between bg-[#0f0f1a] rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full ${COLOR_DOT_CLASSES[ct.color || 'gray'] || COLOR_DOT_CLASSES.gray}`} />
                    <span className="font-medium">{localize(ct)}</span>
                    <span className="text-xs text-gray-500">{ct.name}</span>
                    <span className="text-xs text-gray-500">({ct._count?.categories ?? 0})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditType(ct)} className="text-amber-400 hover:text-amber-300 transition-colors" title={t('common.edit')}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleTypeDelete(ct.name)}
                      disabled={(ct._count?.categories ?? 0) > 0}
                      className={`transition-colors ${(ct._count?.categories ?? 0) > 0 ? 'text-gray-600 cursor-not-allowed' : 'text-red-400 hover:text-red-300'}`}
                      title={(ct._count?.categories ?? 0) > 0 ? t('categoryTypes.cannotDelete') : t('common.delete')}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add/Edit type form */}
            <form onSubmit={handleTypeSubmit} className="border-t border-gray-700 pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-400">{editingType ? t('categoryTypes.edit') : t('categoryTypes.add')}</h3>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('categoryTypes.name')}</label>
                <input
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  disabled={!!editingType}
                  required={!editingType}
                  placeholder="GARNISH, MIXER..."
                  className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400 disabled:opacity-50 uppercase"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('categoryTypes.color')}</label>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORY_TYPE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setTypeForm({ ...typeForm, color })}
                      className={`w-8 h-8 rounded-full ${COLOR_DOT_CLASSES[color]} transition-all ${
                        typeForm.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1a1a2e] scale-110' : 'opacity-60 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="border border-gray-700 rounded-lg p-3 space-y-2">
                <button type="button" onClick={() => setShowTypeTranslations(!showTypeTranslations)}
                  className="text-sm text-gray-400 flex items-center gap-2 w-full text-left">
                  <svg className={`w-3 h-3 transition-transform ${showTypeTranslations ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20"><path d="M6 6L14 10L6 14V6Z"/></svg>
                  {t('common.translations')}
                </button>
                {showTypeTranslations && (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Fran&#231;ais</label>
                      <input value={typeForm.nameFr} onChange={(e) => setTypeForm({ ...typeForm, nameFr: e.target.value })}
                        placeholder={typeForm.name || '...'} className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">English</label>
                      <input value={typeForm.nameEn} onChange={(e) => setTypeForm({ ...typeForm, nameEn: e.target.value })}
                        placeholder={typeForm.name || '...'} className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400" />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3">
                {editingType && (
                  <button type="button" onClick={() => { setEditingType(null); setTypeForm({ name: '', color: 'gray', nameFr: '', nameEn: '' }); }}
                    className="px-4 py-2 text-gray-400 hover:text-white">{t('common.cancel')}</button>
                )}
                <button type="submit" className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg">
                  {editingType ? t('common.save') : t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
