import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { menus as menusApi, cocktails as cocktailsApi } from '../../services/api';
import type { Menu, Cocktail, MenuCocktail } from '../../types';

export default function MenuEditPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();

  const [menu, setMenu] = useState<Menu | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [menuCocktails, setMenuCocktails] = useState<{ cocktailId: number; cocktail?: Cocktail; isHidden: boolean }[]>([]);
  const [allCocktails, setAllCocktails] = useState<Cocktail[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      menusApi.get(parseInt(id)),
      cocktailsApi.list(),
    ]).then(([m, cs]) => {
      setMenu(m);
      setName(m.name);
      setSlug(m.slug);
      setDescription(m.description || '');
      setIsPublic(m.isPublic);
      setMenuCocktails((m.cocktails || []).map((mc: MenuCocktail) => ({
        cocktailId: mc.cocktailId,
        cocktail: mc.cocktail,
        isHidden: mc.isHidden,
      })));
      setAllCocktails(cs);
    });
  }, [id]);

  const availableCocktails = allCocktails.filter(
    (c) => !menuCocktails.some((mc) => mc.cocktailId === c.id)
  );

  const addCocktail = (cocktail: Cocktail) => {
    setMenuCocktails([...menuCocktails, { cocktailId: cocktail.id, cocktail, isHidden: false }]);
    setShowAddModal(false);
  };

  const removeCocktail = (cocktailId: number) => {
    setMenuCocktails(menuCocktails.filter((mc) => mc.cocktailId !== cocktailId));
  };

  const toggleHidden = (cocktailId: number) => {
    setMenuCocktails(menuCocktails.map((mc) =>
      mc.cocktailId === cocktailId ? { ...mc, isHidden: !mc.isHidden } : mc
    ));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const items = [...menuCocktails];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    setMenuCocktails(items);
  };

  const moveDown = (index: number) => {
    if (index === menuCocktails.length - 1) return;
    const items = [...menuCocktails];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    setMenuCocktails(items);
  };

  const handleSave = async () => {
    if (!id) return;
    await menusApi.update(parseInt(id), {
      name,
      slug,
      description,
      isPublic,
      cocktails: menuCocktails.map((mc, idx) => ({
        cocktailId: mc.cocktailId,
        position: idx,
        isHidden: mc.isHidden,
      })),
    });
    navigate('/admin/menus');
  };

  if (!menu) return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold font-serif text-amber-400 mb-6">{t('menus.edit')}</h1>

      {/* Menu info */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 space-y-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('menus.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('menus.slug')}</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('menus.description')}</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400 resize-none" />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-400">{t('menus.isPublic')}</label>
          <button type="button" onClick={() => setIsPublic(!isPublic)}
            className={`w-12 h-6 rounded-full transition-colors ${isPublic ? 'bg-green-500' : 'bg-gray-600'}`}>
            <div className={`w-5 h-5 bg-white rounded-full transition-transform ${isPublic ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
          {isPublic && (
            <a href={`/menu/${slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">
              /menu/{slug} 🔗
            </a>
          )}
        </div>
      </div>

      {/* Cocktails in menu */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('cocktails.title')}</h2>
          <button onClick={() => setShowAddModal(true)}
            className="text-sm text-amber-400 hover:text-amber-300 px-3 py-1.5 border border-amber-400/30 rounded-lg">
            {t('menus.addCocktail')}
          </button>
        </div>

        {menuCocktails.length === 0 ? (
          <div className="text-center py-8 text-gray-500">{t('menus.noCocktails')}</div>
        ) : (
          <div className="space-y-2">
            {menuCocktails.map((mc, idx) => (
              <div key={mc.cocktailId}
                className={`flex items-center gap-3 p-3 rounded-lg border ${mc.isHidden ? 'border-gray-700 bg-[#0f0f1a] opacity-50' : 'border-gray-700 bg-[#0f0f1a]'}`}>
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveUp(idx)} className="text-gray-500 hover:text-white text-xs">▲</button>
                  <button onClick={() => moveDown(idx)} className="text-gray-500 hover:text-white text-xs">▼</button>
                </div>
                <span className="text-gray-500 text-sm w-6">{idx + 1}.</span>
                <span className="flex-1 font-medium">{mc.cocktail?.name || `Cocktail #${mc.cocktailId}`}</span>
                {mc.cocktail && !mc.cocktail.isAvailable && (
                  <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs">{t('cocktails.unavailable')}</span>
                )}
                <button onClick={() => toggleHidden(mc.cocktailId)}
                  className={`text-xs px-2 py-1 rounded ${mc.isHidden ? 'bg-gray-600 text-gray-300' : 'bg-green-500/20 text-green-400'}`}>
                  {mc.isHidden ? t('menus.hidden') : t('menus.visible')}
                </button>
                <button onClick={() => removeCocktail(mc.cocktailId)} className="text-red-400 hover:text-red-300 text-sm">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={() => navigate('/admin/menus')} className="px-6 py-2.5 text-gray-400 hover:text-white">{t('common.cancel')}</button>
        <button onClick={handleSave} className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-6 py-2.5 rounded-lg">{t('common.save')}</button>
      </div>

      {/* Add cocktail modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{t('menus.addCocktail')}</h3>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {availableCocktails.map((c) => (
                <button key={c.id} onClick={() => addCocktail(c)}
                  className="w-full text-left px-4 py-3 rounded-lg bg-[#0f0f1a] hover:bg-gray-800 flex items-center justify-between">
                  <span>{c.name}</span>
                  {!c.isAvailable && <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs">{t('cocktails.unavailable')}</span>}
                </button>
              ))}
              {availableCocktails.length === 0 && <div className="text-center py-4 text-gray-500">{t('common.noResults')}</div>}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
