import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { bottles as bottlesApi, categories as categoriesApi, categoryTypes as ctApi } from '../../services/api';
import type {
  BottleImportPreviewResponse,
  BottleImportResolutions,
  BottleImportConfirmResponse,
  BottleCategoryResolution,
  BottleRowResolution,
  Category,
  CategoryType,
} from '../../types';

type Step = 'upload' | 'resolve' | 'confirm' | 'success' | 'error';

interface ImportBottlesWizardProps {
  onClose: () => void;
  onImported?: () => void;
}

const ACCEPTED_EXT = /\.(json|csv|zip)$/i;

function buildAutoCategoryResolutions(preview: BottleImportPreviewResponse): Record<string, BottleCategoryResolution> {
  const out: Record<string, BottleCategoryResolution> = {};
  for (const entry of preview.categories) {
    const key = entry.ref.name.toLowerCase();
    if (entry.status === 'matched' && entry.existingMatch) {
      out[key] = { action: 'use_existing', existingId: entry.existingMatch.id };
    } else {
      out[key] = {
        action: 'create',
        data: {
          name: entry.ref.name,
          type: entry.ref.type || 'SPIRIT',
          desiredStock: entry.ref.desiredStock || 1,
          minimumPercent: entry.ref.minimumPercent || 30,
          nameTranslations: entry.ref.nameTranslations || null,
        },
      };
    }
  }
  return out;
}

function buildAutoBottleResolutions(preview: BottleImportPreviewResponse): Record<string, BottleRowResolution> {
  const out: Record<string, BottleRowResolution> = {};
  preview.bottles.forEach((entry, idx) => {
    out[String(idx)] = { action: 'import', categoryName: entry.ref.categoryName };
  });
  return out;
}

export default function ImportBottlesWizard({ onClose, onImported }: ImportBottlesWizardProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BottleImportPreviewResponse | null>(null);
  const [resolutions, setResolutions] = useState<BottleImportResolutions>({ categories: {}, bottles: {} });
  const [result, setResult] = useState<BottleImportConfirmResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [existingCategories, setExistingCategories] = useState<Category[]>([]);
  const [allCategoryTypes, setAllCategoryTypes] = useState<CategoryType[]>([]);

  useEffect(() => {
    categoriesApi.list().then(setExistingCategories).catch(() => undefined);
    ctApi.list().then(setAllCategoryTypes).catch(() => undefined);
  }, []);

  const handleFile = (selected: File) => {
    setError(null);
    if (!ACCEPTED_EXT.test(selected.name)) {
      setError(t('bottles.importWizard.invalidFile'));
      return;
    }
    setFile(selected);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const onPreview = async () => {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await bottlesApi.importPreview(file);
      setPreview(res);
      setResolutions({
        categories: buildAutoCategoryResolutions(res),
        bottles: buildAutoBottleResolutions(res),
      });
      setStep('resolve');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bottles.importWizard.previewError'));
    } finally {
      setIsLoading(false);
    }
  };

  const onConfirm = async () => {
    if (!preview) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await bottlesApi.importConfirm({ payload: preview.payload, resolutions });
      setResult(res);
      setStep('success');
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bottles.importWizard.error'));
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  };

  const updateCategoryResolution = (key: string, resolution: BottleCategoryResolution) => {
    setResolutions((prev) => ({ ...prev, categories: { ...prev.categories, [key]: resolution } }));
  };

  const updateBottleResolution = (idx: string, resolution: BottleRowResolution) => {
    setResolutions((prev) => ({ ...prev, bottles: { ...prev.bottles, [idx]: resolution } }));
  };

  // Resolve step state derivations
  const unresolvedBottles = preview
    ? preview.bottles.filter((b, idx) => {
        const res = resolutions.bottles[String(idx)];
        if (!res || res.action === 'skip') return false;
        const finalCat = (res.action === 'import' && res.categoryName) || b.ref.categoryName;
        return !finalCat;
      })
    : [];
  const duplicateRows = preview
    ? preview.bottles.filter((b, idx) => {
        const res = resolutions.bottles[String(idx)];
        return res?.action !== 'skip' && b.potentialDuplicates.length > 0;
      })
    : [];

  // Build options list for category dropdown: existing + categories the user is about to create
  const categoryOptions = preview
    ? [
        ...existingCategories.map((c) => ({ name: c.name, source: 'existing' as const })),
        ...preview.categories
          .filter((c) => {
            const r = resolutions.categories[c.ref.name.toLowerCase()];
            return r?.action === 'create';
          })
          .map((c) => ({ name: c.ref.name, source: 'new' as const })),
      ]
    : [];

  const stepLabels = [
    { key: 'upload', label: '1' },
    { key: 'resolve', label: '2' },
    { key: 'confirm', label: '3' },
  ];
  const currentStepIndex = stepLabels.findIndex((s) => s.key === step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-lg font-semibold">{t('bottles.importWizard.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {step !== 'success' && step !== 'error' && (
          <div className="flex items-center justify-center gap-2 px-6 pt-4">
            {stepLabels.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  i <= currentStepIndex ? 'bg-amber-400 text-[#0f0f1a]' : 'bg-gray-700 text-gray-400'
                }`}>
                  {s.label}
                </div>
                {i < stepLabels.length - 1 && (
                  <div className={`w-12 h-0.5 ${i < currentStepIndex ? 'bg-amber-400' : 'bg-gray-700'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="p-6 space-y-6">
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-600 hover:border-amber-400/50 rounded-xl p-8 text-center cursor-pointer transition-colors"
              >
                <div className="text-4xl mb-3">📦</div>
                <p className="text-gray-400 text-sm">{t('bottles.importWizard.dropzone')}</p>
                {file && <p className="text-amber-400 text-sm mt-3 font-mono">{file.name}</p>}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv,.zip"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                  className="hidden"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm">
                  {error}
                </div>
              )}

              {file && (
                <div className="flex justify-end">
                  <button
                    onClick={onPreview}
                    disabled={isLoading}
                    className="bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-[#0f0f1a] font-semibold px-6 py-2 rounded-lg transition-colors"
                  >
                    {isLoading ? t('common.loading') : t('bottles.importWizard.next')}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'resolve' && preview && (
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
              <div className="bg-[#0f0f1a] border border-gray-700 rounded-lg p-3 text-sm flex gap-6">
                <span className="text-gray-400">
                  {t('bottles.importWizard.summaryCategories', { count: preview.categories.length })}
                </span>
                <span className="text-gray-400">
                  {t('bottles.importWizard.summaryBottles', { count: preview.bottles.length })}
                </span>
              </div>

              {preview.categories.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {t('bottles.importWizard.categoriesTitle')}
                  </h3>
                  <div className="space-y-2">
                    {preview.categories.map((entry) => {
                      const key = entry.ref.name.toLowerCase();
                      const res = resolutions.categories[key];
                      const action = res?.action || (entry.status === 'matched' ? 'use_existing' : 'create');
                      return (
                        <div key={key} className="border border-gray-700 rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${entry.status === 'matched' ? 'bg-green-400' : 'bg-orange-400'}`} />
                            <span className="flex-1 text-sm font-medium">{entry.ref.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              entry.status === 'matched' ? 'bg-green-500/10 text-green-400' : 'bg-orange-500/10 text-orange-400'
                            }`}>
                              {entry.status === 'matched' ? t('bottles.importWizard.matched') : t('bottles.importWizard.missing')}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            {entry.existingMatch && (
                              <button
                                onClick={() => updateCategoryResolution(key, { action: 'use_existing', existingId: entry.existingMatch!.id })}
                                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                                  action === 'use_existing'
                                    ? 'bg-amber-400/10 text-amber-400 border border-amber-400/50'
                                    : 'text-gray-400 border border-gray-700 hover:border-gray-500'
                                }`}
                              >
                                {t('bottles.importWizard.useExisting')}
                              </button>
                            )}
                            <button
                              onClick={() => updateCategoryResolution(key, {
                                action: 'create',
                                data: {
                                  name: entry.ref.name,
                                  type: entry.ref.type || 'SPIRIT',
                                  desiredStock: entry.ref.desiredStock || 1,
                                  minimumPercent: entry.ref.minimumPercent || 30,
                                  nameTranslations: entry.ref.nameTranslations || null,
                                },
                              })}
                              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                                action === 'create'
                                  ? 'bg-amber-400/10 text-amber-400 border border-amber-400/50'
                                  : 'text-gray-400 border border-gray-700 hover:border-gray-500'
                              }`}
                            >
                              {t('bottles.importWizard.createNew')}
                            </button>
                          </div>
                          {action === 'create' && res?.action === 'create' && (
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={res.data.name}
                                onChange={(e) => updateCategoryResolution(key, { ...res, data: { ...res.data, name: e.target.value } })}
                                placeholder={t('categories.name')}
                                className="bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                              />
                              <select
                                value={res.data.type}
                                onChange={(e) => updateCategoryResolution(key, { ...res, data: { ...res.data, type: e.target.value } })}
                                className="bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                              >
                                {allCategoryTypes.length === 0 && <option value={res.data.type}>{res.data.type}</option>}
                                {allCategoryTypes.map((ct) => (
                                  <option key={ct.name} value={ct.name}>
                                    {ct.nameTranslations?.fr || ct.nameTranslations?.en || ct.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {t('bottles.importWizard.bottlesTitle')}
                </h3>
                <div className="space-y-2">
                  {preview.bottles.map((entry, idx) => {
                    const idxStr = String(idx);
                    const res = resolutions.bottles[idxStr];
                    const isSkip = res?.action === 'skip';
                    const currentCategory =
                      (res?.action === 'import' && res.categoryName) || entry.ref.categoryName || '';
                    const hasDuplicates = entry.potentialDuplicates.length > 0;
                    const needsCat = entry.needsCategory && !currentCategory;
                    return (
                      <div
                        key={idxStr}
                        className={`border rounded-lg p-3 space-y-2 ${
                          isSkip ? 'border-gray-700 opacity-50' : needsCat ? 'border-orange-500/40' : 'border-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex-1 text-sm font-medium">{entry.ref.name}</span>
                          <span className="text-xs text-gray-500">{entry.ref.capacityMl} ml</span>
                          {entry.ref.quantity > 1 && (
                            <span className="bg-amber-400/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full">
                              ×{entry.ref.quantity}
                            </span>
                          )}
                          {hasDuplicates && !isSkip && (
                            <span className="bg-orange-500/10 text-orange-400 text-xs px-2 py-0.5 rounded">
                              {t('bottles.importWizard.duplicateFlag', { count: entry.potentialDuplicates.length })}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500 w-24">{t('bottles.category')}</label>
                          <select
                            value={currentCategory}
                            onChange={(e) =>
                              updateBottleResolution(idxStr, { action: 'import', categoryName: e.target.value })
                            }
                            disabled={isSkip}
                            className="flex-1 bg-[#0f0f1a] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400 disabled:opacity-50"
                          >
                            <option value="">{t('bottles.importWizard.pickCategory')}</option>
                            {categoryOptions.map((c) => (
                              <option key={`${c.source}-${c.name}`} value={c.name}>
                                {c.name}{c.source === 'new' ? ` (${t('bottles.importWizard.willCreate')})` : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() =>
                              updateBottleResolution(idxStr, isSkip ? { action: 'import', categoryName: currentCategory } : { action: 'skip' })
                            }
                            className={`text-xs px-3 py-1.5 rounded-lg transition-colors border ${
                              isSkip
                                ? 'bg-gray-400/10 text-gray-300 border-gray-500'
                                : 'text-gray-400 border-gray-700 hover:border-gray-500'
                            }`}
                          >
                            {isSkip ? t('bottles.importWizard.unskip') : t('bottles.importWizard.skip')}
                          </button>
                        </div>

                        {needsCat && !isSkip && (
                          <p className="text-xs text-orange-400">{t('bottles.importWizard.categoryRequired')}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {step === 'confirm' && preview && (
            <div className="space-y-4">
              <div className="bg-[#0f0f1a] border border-gray-700 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  {t('bottles.importWizard.confirmTitle')}
                </h3>
                <ul className="text-sm space-y-1.5">
                  <li className="flex justify-between">
                    <span className="text-gray-400">{t('bottles.importWizard.categoriesToCreate')}</span>
                    <span className="font-mono text-amber-400">
                      {Object.values(resolutions.categories).filter((r) => r.action === 'create').length}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-gray-400">{t('bottles.importWizard.bottlesToImport')}</span>
                    <span className="font-mono text-amber-400">
                      {preview.bottles.reduce((acc, b, idx) => {
                        const r = resolutions.bottles[String(idx)];
                        if (r?.action === 'skip') return acc;
                        return acc + (b.ref.quantity || 1);
                      }, 0)}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-gray-400">{t('bottles.importWizard.bottlesToSkip')}</span>
                    <span className="font-mono text-gray-500">
                      {Object.values(resolutions.bottles).filter((r) => r.action === 'skip').length}
                    </span>
                  </li>
                </ul>
              </div>

              {duplicateRows.length > 0 && (
                <div className="bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-lg p-3 text-xs space-y-1">
                  <p className="font-semibold">{t('bottles.importWizard.duplicatesWarningTitle')}</p>
                  <p>{t('bottles.importWizard.duplicatesWarningBody', { count: duplicateRows.length })}</p>
                </div>
              )}

              {unresolvedBottles.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-xs">
                  {t('bottles.importWizard.unresolvedWarning', { count: unresolvedBottles.length })}
                </div>
              )}
            </div>
          )}

          {step === 'success' && result && (
            <div className="text-center py-8 space-y-4">
              <div className="text-5xl">🎉</div>
              <p className="text-lg font-semibold text-green-400">
                {t('bottles.importWizard.successCount', { count: result.created.bottles })}
              </p>
              {result.duplicatesCreated > 0 && (
                <p className="text-sm text-orange-400">
                  {t('bottles.importWizard.duplicatesCreatedRecap', { count: result.duplicatesCreated })}
                </p>
              )}
              {result.skippedNoCategory > 0 && (
                <p className="text-sm text-gray-400">
                  {t('bottles.importWizard.skippedRecap', { count: result.skippedNoCategory })}
                </p>
              )}
              <button
                onClick={onClose}
                className="bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold px-6 py-2 rounded-lg transition-colors"
              >
                {t('bottles.importWizard.close')}
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="text-center py-8 space-y-4">
              <div className="text-5xl">❌</div>
              <p className="text-lg font-semibold text-red-400">{t('bottles.importWizard.error')}</p>
              {error && <p className="text-sm text-gray-400">{error}</p>}
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
              >
                {t('bottles.importWizard.close')}
              </button>
            </div>
          )}
        </div>

        {(step === 'resolve' || step === 'confirm') && (
          <div className="flex justify-between p-6 border-t border-gray-800">
            <button
              onClick={() => setStep(step === 'confirm' ? 'resolve' : 'upload')}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              {t('bottles.importWizard.back')}
            </button>
            {step === 'resolve' ? (
              <button
                onClick={() => setStep('confirm')}
                disabled={unresolvedBottles.length > 0}
                className="bg-amber-400 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-[#0f0f1a] font-semibold px-6 py-2 rounded-lg transition-colors"
              >
                {t('bottles.importWizard.next')}
              </button>
            ) : (
              <button
                onClick={onConfirm}
                disabled={isLoading || unresolvedBottles.length > 0}
                className="bg-amber-400 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-[#0f0f1a] font-semibold px-6 py-2 rounded-lg transition-colors"
              >
                {isLoading ? t('bottles.importWizard.importing') : t('bottles.importWizard.confirmImport')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
