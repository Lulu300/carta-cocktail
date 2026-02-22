import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { menus as menusApi, menuBottles as menuBottlesApi, menuSections } from '../../services/api';
import type { Menu, MenuBottle, MenuSection } from '../../types';

export default function MenuBottleEditPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();

  const [menu, setMenu] = useState<Menu | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [sections, setSections] = useState<MenuSection[]>([]);
  const [menuBottles, setMenuBottles] = useState<MenuBottle[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [editingSectionName, setEditingSectionName] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const m = await menusApi.get(parseInt(id));
    setMenu(m);
    setName(m.name);
    setDescription(m.description || '');
    setIsPublic(m.isPublic);
    setSections(m.sections || []);
    setMenuBottles(m.bottles || []);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = async () => {
    if (!id) return;
    setSyncing(true);
    try {
      await menuBottlesApi.sync(parseInt(id));
      await load();
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const toggleHidden = async (menuBottleId: number) => {
    const mb = menuBottles.find((m) => m.id === menuBottleId);
    if (!mb) return;
    await menuBottlesApi.update(menuBottleId, { isHidden: !mb.isHidden });
    setMenuBottles(menuBottles.map((m) =>
      m.id === menuBottleId ? { ...m, isHidden: !m.isHidden } : m
    ));
  };

  const changeBottleSection = async (menuBottleId: number, sectionId: number | null) => {
    await menuBottlesApi.update(menuBottleId, { menuSectionId: sectionId });
    setMenuBottles(menuBottles.map((m) =>
      m.id === menuBottleId ? { ...m, menuSectionId: sectionId } : m
    ));
  };

  const createSection = async () => {
    if (!id || !newSectionName.trim()) return;
    const newSection = await menuSections.create(parseInt(id), { name: newSectionName });
    setSections([...sections, newSection]);
    setNewSectionName('');
    setShowSectionModal(false);
  };

  const startEditSection = (section: MenuSection) => {
    setEditingSectionId(section.id);
    setEditingSectionName(section.name);
  };

  const saveEditSection = async () => {
    if (!editingSectionId || !editingSectionName.trim()) return;
    await menuSections.update(editingSectionId, { name: editingSectionName });
    setSections(sections.map(s => s.id === editingSectionId ? { ...s, name: editingSectionName } : s));
    setEditingSectionId(null);
    setEditingSectionName('');
  };

  const deleteSection = async (sectionId: number) => {
    if (!confirm('Supprimer cette section ? Les bouteilles seront déplacées dans "Sans section".')) return;
    await menuSections.delete(sectionId);
    setSections(sections.filter(s => s.id !== sectionId));
    // Move bottles from this section to null
    await Promise.all(
      menuBottles
        .filter(mb => mb.menuSectionId === sectionId)
        .map(mb => menuBottlesApi.update(mb.id, { menuSectionId: null }))
    );
    setMenuBottles(menuBottles.map(mb =>
      mb.menuSectionId === sectionId ? { ...mb, menuSectionId: null } : mb
    ));
  };

  const moveUp = async (sectionId: number | null, index: number) => {
    const sectionBottles = menuBottles.filter(mb => mb.menuSectionId === sectionId);
    if (index === 0) return;

    const items = [...sectionBottles];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];

    // Update positions in database
    await Promise.all([
      menuBottlesApi.update(items[index].id, { position: index }),
      menuBottlesApi.update(items[index - 1].id, { position: index - 1 }),
    ]);

    // Reconstruct full list
    const otherBottles = menuBottles.filter(mb => mb.menuSectionId !== sectionId);
    setMenuBottles([...otherBottles, ...items]);
  };

  const moveDown = async (sectionId: number | null, index: number, total: number) => {
    const sectionBottles = menuBottles.filter(mb => mb.menuSectionId === sectionId);
    if (index === total - 1) return;

    const items = [...sectionBottles];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];

    // Update positions in database
    await Promise.all([
      menuBottlesApi.update(items[index].id, { position: index }),
      menuBottlesApi.update(items[index + 1].id, { position: index + 1 }),
    ]);

    // Reconstruct full list
    const otherBottles = menuBottles.filter(mb => mb.menuSectionId !== sectionId);
    setMenuBottles([...otherBottles, ...items]);
  };

  const handleSave = async () => {
    if (!id) return;
    await menusApi.update(parseInt(id), {
      name,
      description,
      isPublic,
    });
    navigate('/admin/menus');
  };

  if (!menu) return <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>;

  // Check if it's a default menu (not deletable)
  const isDefaultMenu = menu.slug === 'aperitifs' || menu.slug === 'digestifs';

  // Group bottles by section
  const bottlesBySection: Record<string, MenuBottle[]> = {};
  const noSectionBottles = menuBottles.filter(mb => mb.menuSectionId === null);
  if (noSectionBottles.length > 0) {
    bottlesBySection['__no_section__'] = noSectionBottles;
  }
  sections.forEach(section => {
    const sectionBottles = menuBottles.filter(mb => mb.menuSectionId === section.id);
    if (sectionBottles.length > 0) {
      bottlesBySection[`section_${section.id}`] = sectionBottles;
    }
  });

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold font-serif text-amber-400 mb-6">
        {menu.type === 'APEROS' ? 'Gérer la carte des apéritifs' : 'Gérer la carte des digestifs'}
      </h1>

      {/* Menu info */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 space-y-4 mb-6">
        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('menus.name')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isDefaultMenu}
            className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('menus.description')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400 resize-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-400">{t('menus.isPublic')}</label>
          <button
            type="button"
            onClick={() => setIsPublic(!isPublic)}
            className={`w-12 h-6 rounded-full transition-colors ${isPublic ? 'bg-green-500' : 'bg-gray-600'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform ${isPublic ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
          {isPublic && (
            <a href={`/menu/${menu.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">
              /menu/{menu.slug} 🔗
            </a>
          )}
        </div>
      </div>

      {/* Sections management */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Sections</h2>
          <button onClick={() => setShowSectionModal(true)}
            className="text-sm text-amber-400 hover:text-amber-300 px-3 py-1.5 border border-amber-400/30 rounded-lg">
            + Ajouter une section
          </button>
        </div>
        {sections.length === 0 ? (
          <div className="text-center py-4 text-gray-500 text-sm">
            Aucune section personnalisée. Par défaut, les bouteilles sont groupées par catégorie.
          </div>
        ) : (
          <div className="space-y-2">
            {sections.map(section => (
              <div key={section.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-700 bg-[#0f0f1a]">
                {editingSectionId === section.id ? (
                  <>
                    <input
                      value={editingSectionName}
                      onChange={(e) => setEditingSectionName(e.target.value)}
                      className="flex-1 bg-[#1a1a2e] border border-amber-400 rounded px-2 py-1 text-white focus:outline-none"
                      autoFocus
                    />
                    <button onClick={saveEditSection} className="text-green-400 hover:text-green-300 text-sm">✓</button>
                    <button onClick={() => setEditingSectionId(null)} className="text-gray-400 hover:text-white text-sm">✕</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 font-medium">{section.name}</span>
                    <button onClick={() => startEditSection(section)} className="text-gray-400 hover:text-white text-sm">✏️</button>
                    <button onClick={() => deleteSection(section.id)} className="text-red-400 hover:text-red-300 text-sm">🗑️</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottles in menu */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Bouteilles</h2>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-sm text-amber-400 hover:text-amber-300 px-3 py-1.5 border border-amber-400/30 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? '⟳ Synchronisation...' : '🔄 Synchroniser'}
          </button>
        </div>

        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-300">
          <p>
            💡 Les bouteilles marquées comme {menu.type === 'APEROS' ? 'apéritif' : 'digestif'} apparaissent automatiquement ici.
            Utilisez le bouton "Synchroniser" pour mettre à jour la liste.
          </p>
        </div>

        {menuBottles.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Aucune bouteille. Ajoutez des bouteilles avec le flag "{menu.type === 'APEROS' ? 'apéritif' : 'digestif'}" puis synchronisez.
          </div>
        ) : (
          <div className="space-y-6">
            {/* No section bottles */}
            {bottlesBySection['__no_section__'] && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Sans section</h3>
                <div className="space-y-2">
                  {bottlesBySection['__no_section__'].map((mb, idx) => (
                    <div
                      key={mb.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${mb.isHidden ? 'border-gray-700 bg-[#0f0f1a] opacity-50' : 'border-gray-700 bg-[#0f0f1a]'}`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveUp(null, idx)} disabled={idx === 0}
                          className="text-gray-500 hover:text-white text-xs disabled:opacity-30">▲</button>
                        <button onClick={() => moveDown(null, idx, bottlesBySection['__no_section__'].length)}
                          disabled={idx === bottlesBySection['__no_section__'].length - 1}
                          className="text-gray-500 hover:text-white text-xs disabled:opacity-30">▼</button>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{mb.bottle?.name || `Bouteille #${mb.bottleId}`}</div>
                        <div className="text-xs text-gray-500">{mb.bottle?.category?.name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {sections.length > 0 && (
                          <select
                            value={mb.menuSectionId ?? ''}
                            onChange={(e) => changeBottleSection(mb.id, e.target.value ? parseInt(e.target.value) : null)}
                            className="text-xs bg-[#1a1a2e] border border-gray-700 rounded px-2 py-1 text-white focus:outline-none focus:border-amber-400">
                            <option value="">Sans section</option>
                            {sections.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        )}
                        {mb.bottle?.alcoholPercentage && (
                          <span className="text-xs text-gray-400">{mb.bottle.alcoholPercentage}% vol.</span>
                        )}
                        <button
                          onClick={() => toggleHidden(mb.id)}
                          className={`text-xs px-2 py-1 rounded ${mb.isHidden ? 'bg-gray-600 text-gray-300' : 'bg-green-500/20 text-green-400'}`}
                        >
                          {mb.isHidden ? t('menus.hidden') : t('menus.visible')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sectioned bottles */}
            {sections.map(section => {
              const sectionBottles = bottlesBySection[`section_${section.id}`];
              if (!sectionBottles) return null;

              return (
                <div key={section.id}>
                  <h3 className="text-sm font-semibold text-amber-400 mb-2">{section.name}</h3>
                  <div className="space-y-2">
                    {sectionBottles.map((mb, idx) => (
                      <div
                        key={mb.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border ${mb.isHidden ? 'border-gray-700 bg-[#0f0f1a] opacity-50' : 'border-gray-700 bg-[#0f0f1a]'}`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => moveUp(section.id, idx)} disabled={idx === 0}
                            className="text-gray-500 hover:text-white text-xs disabled:opacity-30">▲</button>
                          <button onClick={() => moveDown(section.id, idx, sectionBottles.length)}
                            disabled={idx === sectionBottles.length - 1}
                            className="text-gray-500 hover:text-white text-xs disabled:opacity-30">▼</button>
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{mb.bottle?.name || `Bouteille #${mb.bottleId}`}</div>
                          <div className="text-xs text-gray-500">{mb.bottle?.category?.name}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={mb.menuSectionId ?? ''}
                            onChange={(e) => changeBottleSection(mb.id, e.target.value ? parseInt(e.target.value) : null)}
                            className="text-xs bg-[#1a1a2e] border border-gray-700 rounded px-2 py-1 text-white focus:outline-none focus:border-amber-400">
                            <option value="">Sans section</option>
                            {sections.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          {mb.bottle?.alcoholPercentage && (
                            <span className="text-xs text-gray-400">{mb.bottle.alcoholPercentage}% vol.</span>
                          )}
                          <button
                            onClick={() => toggleHidden(mb.id)}
                            className={`text-xs px-2 py-1 rounded ${mb.isHidden ? 'bg-gray-600 text-gray-300' : 'bg-green-500/20 text-green-400'}`}
                          >
                            {mb.isHidden ? t('menus.hidden') : t('menus.visible')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={() => navigate('/admin/menus')} className="px-6 py-2.5 text-gray-400 hover:text-white">
          {t('common.cancel')}
        </button>
        <button onClick={handleSave} className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-6 py-2.5 rounded-lg">
          {t('common.save')}
        </button>
      </div>

      {/* Create section modal */}
      {showSectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Créer une section</h3>
            <input
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              placeholder="Nom de la section"
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowSectionModal(false); setNewSectionName(''); }} className="px-4 py-2 text-gray-400 hover:text-white">{t('common.cancel')}</button>
              <button onClick={createSection} className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-4 py-2 rounded-lg">Créer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
