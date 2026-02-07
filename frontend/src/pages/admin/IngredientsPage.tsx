import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ingredients as api } from '../../services/api';
import type { Ingredient } from '../../types';
import IconPicker from '../../components/ui/IconPicker';

export default function IngredientsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Ingredient[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');

  const load = () => api.list().then(setItems);
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setIcon('');
    setShowModal(true);
  };

  const openEdit = (item: Ingredient) => {
    setEditing(item);
    setName(item.name);
    setIcon(item.icon || '');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { name, icon: icon || null };
    if (editing) {
      await api.update(editing.id, data);
    } else {
      await api.create(data);
    }
    setShowModal(false);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('ingredients.confirmDelete'))) return;
    await api.delete(id);
    load();
  };

  const toggleAvailability = async (item: Ingredient) => {
    await api.update(item.id, { isAvailable: !item.isAvailable });
    load();
  };

  const setAllAvailability = async (available: boolean) => {
    await api.bulkAvailability({ available });
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif text-amber-400">{t('ingredients.title')}</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setAllAvailability(true)}
            className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-lg text-sm"
          >
            Tous disponibles
          </button>
          <button
            onClick={() => setAllAvailability(false)}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-sm"
          >
            Tous indisponibles
          </button>
          <button
            onClick={openCreate}
            className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg"
          >
            {t('ingredients.add')}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {t('common.noResults')}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className={`
                relative bg-[#1a1a2e] border rounded-xl p-4 transition-all cursor-pointer
                ${item.isAvailable
                  ? 'border-gray-800 hover:border-amber-400/50'
                  : 'border-red-400/30 opacity-60 hover:border-red-400/70'
                }
              `}
              onClick={() => toggleAvailability(item)}
            >
              {/* Availability indicator */}
              <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${item.isAvailable ? 'bg-green-400' : 'bg-red-400'}`} />

              {/* Icon */}
              <div className="text-4xl mb-3 text-center h-12 flex items-center justify-center">
                {item.icon || '📦'}
              </div>

              {/* Name */}
              <div className="text-center mb-3">
                <p className="font-medium text-white truncate">{item.name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {item.isAvailable ? 'Disponible' : 'Indisponible'}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2 border-t border-gray-800">
                <button
                  onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                  className="flex-1 text-amber-400 hover:text-amber-300 text-sm py-1"
                >
                  {t('common.edit')}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                  className="flex-1 text-red-400 hover:text-red-300 text-sm py-1"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-lg font-semibold">
              {editing ? t('ingredients.edit') : t('ingredients.add')}
            </h2>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                {t('ingredients.name')}
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Icône (optionnel)
              </label>
              <IconPicker value={icon} onChange={setIcon} />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg"
              >
                {t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
