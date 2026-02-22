import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useClickOutside } from '../../hooks/useClickOutside';

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

export default function MultiSelectDropdown({
  options, selected, onChange, placeholder, className = '',
}: MultiSelectDropdownProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(useCallback(() => setOpen(false), []));

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-left text-sm focus:outline-none focus:border-amber-400 transition-colors flex items-center justify-between"
      >
        <span className={selected.length > 0 ? 'text-white' : 'text-gray-500'}>
          {selected.length > 0
            ? t('common.selected', { count: selected.length })
            : placeholder}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((val) => {
            const opt = options.find((o) => o.value === val);
            return (
              <span key={val}
                className="inline-flex items-center gap-1 bg-amber-400/10 text-amber-400 text-xs px-2 py-0.5 rounded-full">
                {opt?.label ?? val}
                <button type="button" onClick={() => toggle(val)}
                  className="hover:text-amber-200">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            );
          })}
        </div>
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-[#1a1a2e] border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto py-1">
          {options.map((opt) => (
            <label key={opt.value}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800/50 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="w-4 h-4 rounded bg-[#0f0f1a] border-gray-700 text-amber-400 accent-amber-400"
              />
              <span className="text-gray-300">{opt.label}</span>
            </label>
          ))}
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">-</div>
          )}
        </div>
      )}
    </div>
  );
}
