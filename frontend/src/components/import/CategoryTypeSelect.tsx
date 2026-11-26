import type { CategoryType } from '../../types';
import { useCategoryTypeName } from '../../hooks/useCategoryTypeName';
import Select from '../ui/Select';

interface CategoryTypeSelectProps {
  value: string;
  onChange: (type: string) => void;
  categoryTypes: CategoryType[];
}

/**
 * Type of a category to create, labelled in the interface language. Names HTML would hide are
 * marked, the file's own type included, so that ' SPIRIT ' and 'SPIRIT' read differently.
 */
export default function CategoryTypeSelect({ value, onChange, categoryTypes }: CategoryTypeSelectProps) {
  const { visibleName, typeLabel } = useCategoryTypeName();
  const isKnownType = categoryTypes.some((categoryType) => categoryType.name === value);

  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {/* The file's type stays selectable while the types are loading, or if it is new */}
      {!isKnownType && <option value={value}>{visibleName(value)}</option>}
      {categoryTypes.map((categoryType) => (
        <option key={categoryType.name} value={categoryType.name}>{typeLabel(categoryType)}</option>
      ))}
    </Select>
  );
}
