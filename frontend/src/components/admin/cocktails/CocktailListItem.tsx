import { cx } from '../../ui/classNames';
import AvailabilityBadge from './AvailabilityBadge';
import AvailabilityWarnings from './AvailabilityWarnings';
import CocktailActions from './CocktailActions';
import CocktailThumbnail from './CocktailThumbnail';
import SelectionCheckbox from './SelectionCheckbox';
import TagList from './TagList';
import type { CocktailItemProps } from './cocktailItem';

/** A cocktail in the list view. In selection mode, a click anywhere on the row toggles it. */
export default function CocktailListItem({
  cocktail, availability, availabilityLoading, selectionMode, isSelected, onToggle, onDelete,
}: CocktailItemProps) {
  return (
    <div
      className={cx(
        'p-4 transition-colors border-t border-line first:border-t-0',
        selectionMode && (isSelected ? 'bg-accent/10 cursor-pointer' : 'hover:bg-white/2 cursor-pointer'),
      )}
      onClick={selectionMode ? () => onToggle(cocktail.id) : undefined}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          {selectionMode && (
            <SelectionCheckbox
              name={cocktail.name}
              checked={isSelected}
              onToggle={() => onToggle(cocktail.id)}
              className="mt-1"
            />
          )}
          <CocktailThumbnail cocktail={cocktail} variant="square" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <h2 className="font-semibold text-lg truncate">{cocktail.name}</h2>
                {cocktail.description && <p className="mt-1 text-sm text-fg-muted">{cocktail.description}</p>}
              </div>
              <div className="shrink-0">
                <AvailabilityBadge availability={availability} loading={availabilityLoading} />
              </div>
            </div>
            <TagList tags={cocktail.tags} className="mt-3" />
            <div className="mt-3">
              <AvailabilityWarnings availability={availability} loading={availabilityLoading} />
            </div>
          </div>
        </div>
        {!selectionMode && (
          <CocktailActions cocktail={cocktail} onDelete={onDelete} className="justify-end md:pl-4" />
        )}
      </div>
    </div>
  );
}
