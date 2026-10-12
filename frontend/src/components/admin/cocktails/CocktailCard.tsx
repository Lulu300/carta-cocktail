import { cx } from '../../ui/classNames';
import AvailabilityBadge from './AvailabilityBadge';
import AvailabilityWarnings from './AvailabilityWarnings';
import CocktailActions from './CocktailActions';
import CocktailThumbnail from './CocktailThumbnail';
import SelectionCheckbox from './SelectionCheckbox';
import TagList from './TagList';
import type { CocktailItemProps } from './cocktailItem';

/** A cocktail in the grid view. In selection mode, a click anywhere on the card toggles it. */
export default function CocktailCard({
  cocktail, availability, availabilityLoading, selectionMode, isSelected, onToggle, onDelete,
}: CocktailItemProps) {
  return (
    <div
      className={cx(
        'bg-surface border rounded-xl overflow-hidden transition-colors',
        !selectionMode && 'border-line hover:border-accent/30',
        selectionMode && (isSelected ? 'border-accent ring-1 ring-accent/30' : 'border-line hover:border-line-strong cursor-pointer'),
      )}
      onClick={selectionMode ? () => onToggle(cocktail.id) : undefined}
    >
      <CocktailThumbnail cocktail={cocktail} variant="cover">
        {selectionMode && (
          <SelectionCheckbox
            name={cocktail.name}
            checked={isSelected}
            onToggle={() => onToggle(cocktail.id)}
            className="absolute top-2 left-2 z-10"
          />
        )}
        {availability && !availabilityLoading && (
          <div className="absolute top-2 right-2">
            <AvailabilityBadge availability={availability} loading={availabilityLoading} />
          </div>
        )}
      </CocktailThumbnail>
      <div className="p-4">
        <h3 className="font-semibold mb-2">{cocktail.name}</h3>
        {cocktail.description && <p className="text-sm text-fg-muted line-clamp-2 mb-2">{cocktail.description}</p>}
        <TagList tags={cocktail.tags} className="mb-2" />
        <AvailabilityWarnings availability={availability} loading={availabilityLoading} />
        {!selectionMode && (
          <CocktailActions cocktail={cocktail} onDelete={onDelete} className="justify-center pt-2 border-t border-line" />
        )}
      </div>
    </div>
  );
}
