import { useTranslation } from 'react-i18next';
import type { MenuSection } from '../../../types';
import { cx, focusRingClasses } from '../../ui/classNames';

interface SectionSelectProps {
  /** Null: outside any section. */
  value: number | null;
  sections: MenuSection[];
  onChange: (sectionId: number | null) => void;
  /** Name of the item, for the accessible name. */
  label: string;
  disabled?: boolean;
}

/** Picks the section of a menu item. */
export default function SectionSelect({ value, sections, onChange, label, disabled }: SectionSelectProps) {
  const { t } = useTranslation();

  return (
    <select
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      disabled={disabled}
      aria-label={t('menus.sections.select', { name: label })}
      className={cx(
        'text-xs bg-surface border border-line-strong rounded px-2 py-1 text-fg disabled:opacity-50',
        focusRingClasses,
      )}
    >
      <option value="">{t('menus.sections.none')}</option>
      {sections.map((section) => (
        <option key={section.id} value={section.id}>{section.name}</option>
      ))}
    </select>
  );
}
