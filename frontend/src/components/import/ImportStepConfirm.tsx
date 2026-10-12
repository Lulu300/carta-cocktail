import { useTranslation } from 'react-i18next';
import type { ImportEntityResolution, ImportPreviewResponse } from '../../types';
import Button from '../ui/Button';
import { IMPORT_ENTITY_TYPES, referenceLabel, resolutionKey, type ImportEntityType, type ImportResolutions } from './importResolutions';
import { existingOptionLabel, type ImportReferenceLists } from './useImportReferenceLists';

interface ImportStepConfirmProps {
  preview: ImportPreviewResponse;
  resolutions: ImportResolutions;
  lists: ImportReferenceLists;
  isLoading: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

interface SummaryLine {
  key: string;
  type: string;
  name: string;
  mappedTo?: string;
}

interface Summary {
  created: SummaryLine[];
  mapped: SummaryLine[];
  skipped: SummaryLine[];
}

/** Name of the existing entity the admin picked, which may differ from the backend's match. */
function mappedName(
  type: ImportEntityType,
  entity: ImportEntityResolution,
  existingId: number | undefined,
  lists: ImportReferenceLists,
): string {
  const picked = lists[type].find((option) => option.id === existingId);
  if (picked) return existingOptionLabel(type, picked);
  // The lists are still loading: the backend's match is the only name known
  const match = entity.existingMatch;
  if (match && match.id === existingId) return match.name;
  return '?';
}

function buildSummary(
  preview: ImportPreviewResponse,
  resolutions: ImportResolutions,
  lists: ImportReferenceLists,
  typeLabel: (type: ImportEntityType) => string,
): Summary {
  const summary: Summary = { created: [], mapped: [], skipped: [] };
  for (const type of IMPORT_ENTITY_TYPES) {
    for (const entity of preview[type]) {
      const key = resolutionKey(type, entity.ref);
      const resolution = resolutions[type][key];
      const line = { key: `${type}-${key}`, type: typeLabel(type), name: referenceLabel(type, entity.ref) };
      if (resolution?.action === 'create') {
        summary.created.push({ ...line, name: resolution.data?.name ?? line.name });
      } else if (resolution?.action === 'skip') {
        summary.skipped.push(line);
      } else if (resolution?.action === 'use_existing') {
        summary.mapped.push({ ...line, mappedTo: mappedName(type, entity, resolution.existingId, lists) });
      }
    }
  }
  return summary;
}

function SummarySection({ title, lines, marker, className }: {
  title: string;
  lines: SummaryLine[];
  marker: string;
  className: string;
}) {
  const { t } = useTranslation();
  if (lines.length === 0) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold mb-2">{title} ({lines.length})</h3>
      <ul className="space-y-1">
        {lines.map((line) => (
          <li key={line.key} className={`flex items-center gap-2 text-sm rounded px-3 py-1.5 border ${className}`}>
            <span aria-hidden="true">{marker}</span>
            <span className="text-xs text-fg-muted w-20">{line.type}</span>
            <span>{line.name}</span>
            {line.mappedTo !== undefined && (
              <>
                <span aria-hidden="true">→</span>
                <span className="sr-only">{t('cocktails.importWizard.mapsTo')}</span>
                <span className="text-fg">{line.mappedTo}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ImportStepConfirm({ preview, resolutions, lists, isLoading, onBack, onConfirm }: ImportStepConfirmProps) {
  const { t } = useTranslation();
  const summary = buildSummary(preview, resolutions, lists, (type) => t(`cocktails.importWizard.${type}`));

  return (
    <div className="space-y-6">
      <div className="bg-canvas border border-gray-700 rounded-xl p-5">
        <p className="text-xl font-bold font-serif text-accent">{preview.cocktail.name}</p>
        {preview.cocktail.description && (
          <p className="text-sm text-fg-muted mt-1 italic">{preview.cocktail.description}</p>
        )}
      </div>

      <SummarySection
        title={t('cocktails.importWizard.entitiesToCreate')}
        lines={summary.created}
        marker="+"
        className="text-green-400 bg-green-500/5 border-green-500/10"
      />
      <SummarySection
        title={t('cocktails.importWizard.entitiesMapped')}
        lines={summary.mapped}
        marker="~"
        className="text-blue-400 bg-blue-500/5 border-blue-500/10"
      />
      <SummarySection
        title={t('cocktails.importWizard.skip')}
        lines={summary.skipped}
        marker="-"
        className="text-fg-muted bg-gray-500/5 border-gray-500/10"
      />

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} disabled={isLoading}>{t('cocktails.importWizard.back')}</Button>
        <Button onClick={onConfirm} loading={isLoading}>
          {isLoading ? t('cocktails.importWizard.importing') : t('cocktails.importWizard.confirmImport')}
        </Button>
      </div>
    </div>
  );
}
