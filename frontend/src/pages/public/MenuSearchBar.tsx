import { useTranslation } from 'react-i18next';
import ClearButton from '../../components/ui/ClearButton';
import Icon from '../../components/ui/Icon';

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
        enterKeyHint="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-surface border border-line-strong rounded-lg pl-10 pr-10 py-3 text-fg placeholder:text-fg-muted focus:border-accent transition-colors [&::-webkit-search-cancel-button]:hidden"
      />
      <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-fg-muted" />
      {value && <ClearButton label={t('public.clearSearch')} onClick={() => onChange('')} className="right-1.5" />}
    </div>
  );
}
