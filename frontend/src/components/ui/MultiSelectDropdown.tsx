import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './classNames';
import { controlClasses } from './fieldContext';
import Icon from './Icon';
import { useDisclosure } from './useDisclosure';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
  className?: string;
}

/**
 * Button that shows a panel with a search field and one checkbox per option.
 * A disclosure, not a listbox: the panel holds real form controls.
 */
export default function MultiSelectDropdown({
  options, selected, onChange, placeholder, className = '',
}: MultiSelectDropdownProps) {
  const { t } = useTranslation();
  const [filterText, setFilterText] = useState('');
  const { isOpen, panelId, containerRef, handleKeyDown, triggerProps } = useDisclosure(useCallback(() => setFilterText(''), []));

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  const visibleOptions = options.filter(
    (opt) => !filterText || opt.label.toLowerCase().includes(filterText.toLowerCase()),
  );

  return (
    <div ref={containerRef} onKeyDown={handleKeyDown} className={`relative ${className}`}>
      <button
        {...triggerProps}
        className={cx(controlClasses, 'text-left text-sm flex items-center justify-between')}
      >
        <span className={selected.length > 0 ? 'text-fg' : 'text-fg-muted'}>
          {selected.length > 0
            ? t('common.selected', { count: selected.length })
            : placeholder}
        </span>
        <Icon
          name="chevron-down"
          className={cx('size-4 text-fg-muted transition-transform motion-reduce:transition-none', isOpen && 'rotate-180')}
        />
      </button>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((val) => {
            const label = options.find((o) => o.value === val)?.label ?? val;
            return (
              <span key={val}
                className="inline-flex items-center gap-1 bg-accent/10 text-accent text-xs pl-2 rounded-full">
                {label}
                <button
                  type="button"
                  onClick={() => toggle(val)}
                  aria-label={t('common.removeItem', { name: label })}
                  className="p-1.5 rounded-full hover:text-accent-soft"
                >
                  <Icon name="close" className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {isOpen && (
        <div
          id={panelId}
          role="group"
          aria-label={placeholder}
          className="absolute z-30 mt-1 w-full bg-surface border border-line-strong rounded-lg shadow-lg max-h-72 overflow-hidden"
        >
          <div className="p-2 border-b border-line-strong">
            <input
              type="search"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              aria-label={t('common.filterOptions')}
              placeholder={t('common.search')}
              className="w-full bg-canvas border border-line-strong rounded px-3 py-1.5 text-sm text-fg placeholder:text-fg-muted"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-56 py-1">
            {visibleOptions.map((opt) => (
              <label key={opt.value}
                className="flex items-center gap-2 px-3 py-2 hover:bg-line/50 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="w-4 h-4 rounded accent-accent"
                />
                <span className="text-fg">{opt.label}</span>
              </label>
            ))}
            {visibleOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-fg-muted">{t('common.noResults')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
