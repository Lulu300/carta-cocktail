import type { CategoryType } from '../../types';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import Select from '../ui/Select';

interface CategoryTypeSelectProps {
  value: string;
  onChange: (type: string) => void;
  categoryTypes: CategoryType[];
  /** Needed outside a `Field`, which otherwise labels the select. */
  'aria-label'?: string;
}

/** Type of a category to create, labelled in the interface language. */
export default function CategoryTypeSelect({ value, onChange, categoryTypes, 'aria-label': ariaLabel }: CategoryTypeSelectProps) {
  const localizedName = useLocalizedName();
  const isKnownType = categoryTypes.some((categoryType) => categoryType.name === value);

  return (
    <Select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
      {/* The file's type stays selectable while the types are loading, or if it is new */}
      {!isKnownType && <option value={value}>{value}</option>}
      {categoryTypes.map((categoryType) => (
        <option key={categoryType.name} value={categoryType.name}>{localizedName(categoryType)}</option>
      ))}
    </Select>
  );
}
