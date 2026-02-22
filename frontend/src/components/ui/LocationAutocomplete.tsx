import { useState, useMemo, useCallback } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  locations: string[];
  placeholder: string;
  className?: string;
}

export default function LocationAutocomplete({
  value, onChange, locations, placeholder, className = '',
}: LocationAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(useCallback(() => setOpen(false), []));

  const filtered = useMemo(() => {
    if (!value) return locations;
    const lower = value.toLowerCase();
    return locations.filter((loc) => loc.toLowerCase().includes(lower));
  }, [value, locations]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-400 transition-colors"
      />
      {value && (
        <button type="button" onClick={() => { onChange(''); setOpen(false); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-[#1a1a2e] border border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto py-1">
          {filtered.map((loc) => (
            <button key={loc} type="button"
              onClick={() => { onChange(loc); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-gray-800/50 text-sm text-gray-300">
              {loc}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
