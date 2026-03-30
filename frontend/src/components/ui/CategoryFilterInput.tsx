import { useState, useCallback } from 'react';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import { useClickOutside } from '../../hooks/useClickOutside';
import type { Category } from '../../types';

interface CategoryFilterInputProps {
  categories: Category[];
  value: string;
  selectedId: number | null;
  onChange: (text: string, selectedId: number | null) => void;
  placeholder: string;
  className?: string;
}

export default function CategoryFilterInput({
  categories, value, selectedId, onChange, placeholder, className = '',
}: CategoryFilterInputProps) {
  const localize = useLocalizedName();
  const [focused, setFocused] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(useCallback(() => setFocused(false), []));

  const matchingCategories = value.trim()
    ? categories.filter((c) => localize(c).toLowerCase().includes(value.toLowerCase()))
    : [];

  const handleTextChange = (text: string) => {
    onChange(text, null);
    setFocused(true);
  };

  const handleSelect = (cat: Category) => {
    onChange(localize(cat), cat.id);
    setFocused(false);
  };

  const handleClear = () => {
    onChange('', null);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => handleTextChange(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          className={`w-full bg-[#0f0f1a] border rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-amber-400 transition-colors ${
            selectedId !== null ? 'border-amber-400/50' : 'border-gray-700'
          }`}
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {focused && matchingCategories.length > 0 && selectedId === null && (
        <div className="absolute z-30 mt-1 w-full bg-[#1a1a2e] border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto py-1">
          {matchingCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleSelect(cat)}
              className="w-full text-left px-3 py-2 hover:bg-gray-800/50 text-sm text-gray-300 hover:text-white transition-colors"
            >
              {localize(cat)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
