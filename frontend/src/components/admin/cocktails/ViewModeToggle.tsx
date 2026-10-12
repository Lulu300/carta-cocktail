import { useTranslation } from 'react-i18next';
import { cx } from '../../ui/classNames';

export type ViewMode = 'grid' | 'list';

const VIEW_MODES: { mode: ViewMode; labelKey: string }[] = [
  { mode: 'grid', labelKey: 'cocktails.viewGrid' },
  { mode: 'list', labelKey: 'cocktails.viewList' },
];

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export default function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  const { t } = useTranslation();

  return (
    <div className="inline-flex rounded-lg border border-line-strong bg-surface p-1 self-start">
      {VIEW_MODES.map(({ mode, labelKey }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          className={cx(
            'rounded-md px-3 py-1.5 text-sm transition-colors',
            value === mode ? 'bg-accent text-on-accent font-semibold' : 'text-fg-muted hover:text-fg',
          )}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}
