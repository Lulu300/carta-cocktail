import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  cocktails as cocktailsApi,
  categories as categoriesApi,
  bottles as bottlesApi,
  ingredients as ingredientsApi,
  units as unitsApi,
} from '../../services/api';
import type { Category, Bottle, Ingredient, Unit, CocktailIngredientInput } from '../../types';

interface IngredientRow {
  sourceType: 'BOTTLE' | 'CATEGORY' | 'INGREDIENT';
  bottleId: number | null;
  categoryId: number | null;
  ingredientId: number | null;
  quantity: number;
  unitId: number;
  preferredBottleIds: number[];
}

export default function CocktailFormPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>([]);
  const [instructionTexts, setInstructionTexts] = useState<string[]>(['']);

  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [allBottles, setAllBottles] = useState<Bottle[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [showNewIngredient, setShowNewIngredient] = useState(false);

  useEffect(() => {
    Promise.all([
      categoriesApi.list(),
      bottlesApi.list(),
      ingredientsApi.list(),
      unitsApi.list(),
    ]).then(([cats, bots, ings, uns]) => {
      setAllCategories(cats);
      setAllBottles(bots);
      setAllIngredients(ings);
      setAllUnits(uns);
    });
  }, []);

  useEffect(() => {
    if (isEdit && allUnits.length > 0) {
      cocktailsApi.get(parseInt(id!)).then((c) => {
        setName(c.name);
        setDescription(c.description || '');
        setNotes(c.notes || '');
        setTagsInput(c.tags || '');
        setIsAvailable(c.isAvailable);
        if (c.imagePath) setImagePreview(`/uploads/${c.imagePath}`);
        if (c.ingredients) {
          setIngredientRows(c.ingredients.map((ing) => ({
            sourceType: ing.sourceType,
            bottleId: ing.bottleId,
            categoryId: ing.categoryId,
            ingredientId: ing.ingredientId,
            quantity: ing.quantity,
            unitId: ing.unitId,
            preferredBottleIds: ing.preferredBottles?.map((pb) => pb.bottleId) || [],
          })));
        }
        if (c.instructions && c.instructions.length > 0) {
          setInstructionTexts(c.instructions.map((i) => i.text));
        }
      });
    }
  }, [isEdit, id, allUnits]);

  const addIngredient = () => {
    setIngredientRows([...ingredientRows, {
      sourceType: 'INGREDIENT',
      bottleId: null,
      categoryId: null,
      ingredientId: allIngredients[0]?.id || null,
      quantity: 1,
      unitId: allUnits[0]?.id || 0,
      preferredBottleIds: [],
    }]);
  };

  const updateIngredient = (index: number, updates: Partial<IngredientRow>) => {
    const rows = [...ingredientRows];
    rows[index] = { ...rows[index], ...updates };
    // Reset related fields when sourceType changes
    if (updates.sourceType) {
      rows[index].bottleId = null;
      rows[index].categoryId = null;
      rows[index].ingredientId = null;
      rows[index].preferredBottleIds = [];
    }
    setIngredientRows(rows);
  };

  const removeIngredient = (index: number) => {
    setIngredientRows(ingredientRows.filter((_, i) => i !== index));
  };

  const addInstruction = () => setInstructionTexts([...instructionTexts, '']);
  const updateInstruction = (index: number, text: string) => {
    const texts = [...instructionTexts];
    texts[index] = text;
    setInstructionTexts(texts);
  };
  const removeInstruction = (index: number) => setInstructionTexts(instructionTexts.filter((_, i) => i !== index));

  const handleCreateIngredient = async () => {
    if (!newIngredientName.trim()) return;
    const ing = await ingredientsApi.create({ name: newIngredientName.trim() });
    setAllIngredients([...allIngredients, ing]);
    setNewIngredientName('');
    setShowNewIngredient(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name,
      description: description || undefined,
      notes: notes || undefined,
      tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
      isAvailable,
      ingredients: ingredientRows.map((r): CocktailIngredientInput => ({
        sourceType: r.sourceType,
        bottleId: r.sourceType === 'BOTTLE' ? r.bottleId : null,
        categoryId: r.sourceType === 'CATEGORY' ? r.categoryId : null,
        ingredientId: r.sourceType === 'INGREDIENT' ? r.ingredientId : null,
        quantity: r.quantity,
        unitId: r.unitId,
        preferredBottleIds: r.sourceType === 'CATEGORY' ? r.preferredBottleIds : undefined,
      })),
      instructions: instructionTexts.filter((t) => t.trim()).map((t) => ({ text: t })),
    };

    let cocktail;
    if (isEdit) {
      cocktail = await cocktailsApi.update(parseInt(id!), data);
    } else {
      cocktail = await cocktailsApi.create(data);
    }

    if (imageFile) {
      await cocktailsApi.uploadImage(cocktail.id, imageFile);
    }

    navigate('/admin/cocktails');
  };

  const bottlesForCategory = (catId: number | null) =>
    allBottles.filter((b) => b.categoryId === catId && b.remainingPercent > 0);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold font-serif text-amber-400 mb-6">
        {isEdit ? t('cocktails.edit') : t('cocktails.add')}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('cocktails.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('cocktails.description')}</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400 resize-none" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('cocktails.notes')}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400 resize-none" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('cocktails.tags')}</label>
            <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t('cocktails.tagsPlaceholder')}
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
            {tagsInput && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tagsInput.split(',').map((t) => t.trim()).filter(Boolean).map((tag, i) => (
                  <span key={i} className="bg-amber-400/10 text-amber-400 text-xs px-2 py-0.5 rounded-full">{tag}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400">{t('cocktails.available')}</label>
            <button type="button" onClick={() => setIsAvailable(!isAvailable)}
              className={`w-12 h-6 rounded-full transition-colors ${isAvailable ? 'bg-green-500' : 'bg-gray-600'}`}>
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${isAvailable ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6">
          <label className="block text-sm text-gray-400 mb-2">{t('cocktails.image')}</label>
          <div className="flex items-center gap-4">
            {imagePreview && (
              <img src={imagePreview} alt="" className="w-24 h-24 object-cover rounded-lg" />
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setImageFile(file);
                  setImagePreview(URL.createObjectURL(file));
                }
              }}
              className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-amber-400 file:text-[#0f0f1a] hover:file:bg-amber-500" />
          </div>
        </div>

        {/* Ingredients */}
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm text-gray-400 font-medium">{t('cocktails.ingredients')}</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowNewIngredient(!showNewIngredient)}
                className="text-xs text-gray-400 hover:text-amber-400 px-2 py-1 border border-gray-700 rounded">
                + {t('ingredients.add')}
              </button>
              <button type="button" onClick={addIngredient}
                className="text-xs text-amber-400 hover:text-amber-300 px-2 py-1 border border-amber-400/30 rounded">
                {t('cocktails.addIngredient')}
              </button>
            </div>
          </div>

          {showNewIngredient && (
            <div className="flex gap-2 mb-4">
              <input value={newIngredientName} onChange={(e) => setNewIngredientName(e.target.value)}
                placeholder={t('ingredients.name')}
                className="flex-1 bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400" />
              <button type="button" onClick={handleCreateIngredient}
                className="bg-amber-400 text-[#0f0f1a] px-3 py-1.5 rounded-lg text-sm font-semibold">{t('common.create')}</button>
            </div>
          )}

          <div className="space-y-3">
            {ingredientRows.map((row, idx) => (
              <div key={idx} className="bg-[#0f0f1a] rounded-lg p-3 space-y-2">
                <div className="flex gap-2 items-center">
                  <select value={row.sourceType} onChange={(e) => updateIngredient(idx, { sourceType: e.target.value as any })}
                    className="bg-[#1a1a2e] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400">
                    <option value="BOTTLE">{t('cocktails.specificBottle')}</option>
                    <option value="CATEGORY">{t('cocktails.categoryType')}</option>
                    <option value="INGREDIENT">{t('cocktails.freeIngredient')}</option>
                  </select>

                  {row.sourceType === 'BOTTLE' && (
                    <select value={row.bottleId || ''} onChange={(e) => updateIngredient(idx, { bottleId: parseInt(e.target.value) })}
                      className="flex-1 bg-[#1a1a2e] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400">
                      <option value="">--</option>
                      {allBottles.filter((b) => b.remainingPercent > 0).map((b) => (
                        <option key={b.id} value={b.id}>{b.name} ({b.category?.name})</option>
                      ))}
                    </select>
                  )}

                  {row.sourceType === 'CATEGORY' && (
                    <select value={row.categoryId || ''} onChange={(e) => updateIngredient(idx, { categoryId: parseInt(e.target.value) })}
                      className="flex-1 bg-[#1a1a2e] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400">
                      <option value="">--</option>
                      {allCategories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}

                  {row.sourceType === 'INGREDIENT' && (
                    <select value={row.ingredientId || ''} onChange={(e) => updateIngredient(idx, { ingredientId: parseInt(e.target.value) })}
                      className="flex-1 bg-[#1a1a2e] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400">
                      <option value="">--</option>
                      {allIngredients.map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  )}

                  <input type="number" step="0.1" min="0" value={row.quantity}
                    onChange={(e) => updateIngredient(idx, { quantity: parseFloat(e.target.value) || 0 })}
                    className="w-20 bg-[#1a1a2e] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400"
                    placeholder={t('cocktails.quantity')} />

                  <select value={row.unitId} onChange={(e) => updateIngredient(idx, { unitId: parseInt(e.target.value) })}
                    className="bg-[#1a1a2e] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400">
                    {allUnits.map((u) => (
                      <option key={u.id} value={u.id}>{u.abbreviation}</option>
                    ))}
                  </select>

                  <button type="button" onClick={() => removeIngredient(idx)} className="text-red-400 hover:text-red-300 text-sm px-1">✕</button>
                </div>

                {row.sourceType === 'CATEGORY' && row.categoryId && (
                  <div className="pl-2">
                    <label className="text-xs text-gray-500 mb-1 block">{t('cocktails.preferredBottles')}</label>
                    <div className="flex flex-wrap gap-2">
                      {bottlesForCategory(row.categoryId).map((b) => (
                        <label key={b.id} className="flex items-center gap-1 text-xs text-gray-300">
                          <input type="checkbox" checked={row.preferredBottleIds.includes(b.id)}
                            onChange={(e) => {
                              const ids = e.target.checked
                                ? [...row.preferredBottleIds, b.id]
                                : row.preferredBottleIds.filter((x) => x !== b.id);
                              updateIngredient(idx, { preferredBottleIds: ids });
                            }}
                            className="accent-amber-400" />
                          {b.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm text-gray-400 font-medium">{t('cocktails.instructions')}</label>
            <button type="button" onClick={addInstruction}
              className="text-xs text-amber-400 hover:text-amber-300 px-2 py-1 border border-amber-400/30 rounded">
              {t('cocktails.addInstruction')}
            </button>
          </div>
          <div className="space-y-2">
            {instructionTexts.map((text, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <span className="text-xs text-gray-500 w-6">{idx + 1}.</span>
                <input value={text} onChange={(e) => updateInstruction(idx, e.target.value)}
                  className="flex-1 bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400" />
                <button type="button" onClick={() => removeInstruction(idx)} className="text-red-400 hover:text-red-300 text-sm px-1">✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/admin/cocktails')} className="px-6 py-2.5 text-gray-400 hover:text-white">{t('common.cancel')}</button>
          <button type="submit" className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-6 py-2.5 rounded-lg">{t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
