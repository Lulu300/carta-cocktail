import { useTranslation } from 'react-i18next';

interface MenuSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export default function MenuSearchBar({ value, onChange, placeholder }: MenuSearchBarProps) {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-surface border border-line-strong rounded-lg pl-10 pr-10 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors [&::-webkit-search-cancel-button]:hidden"
      />
      <svg
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('public.clearSearch')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
        >
          ✕
        </button>
      )}
    </div>
  );
}
