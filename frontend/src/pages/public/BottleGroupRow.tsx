import { useTranslation } from 'react-i18next';
import type { BottleGroupEntry } from './useMenuFilter';

const MAX_VISIBLE_LOCATIONS = 3;

interface BottleGroupRowProps {
  group: BottleGroupEntry;
  /** Bottle count and capacity are inventory details, shown to the admin only. */
  showInventory: boolean;
  onShowLocations: (group: BottleGroupEntry) => void;
}

export default function BottleGroupRow({ group, showInventory, onShowLocations }: BottleGroupRowProps) {
  const { t } = useTranslation();
  const hiddenLocationCount = group.locations.length - MAX_VISIBLE_LOCATIONS;

  return (
    <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium text-white">{group.name}</h3>
          {showInventory && group.count > 1 && (
            <span className="bg-accent/20 text-accent text-xs font-bold px-2 py-0.5 rounded-full">x{group.count}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-sm text-fg-muted">
          {group.alcoholPercentage !== null && (
            <span>{t('public.alcoholPercentage', { value: group.alcoholPercentage })}</span>
          )}
          {showInventory && (
            <>
              <span aria-hidden="true">•</span>
              <span>{t('public.capacityMl', { value: group.capacityMl })}</span>
            </>
          )}
        </div>
      </div>
      {group.locations.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap justify-end max-w-xs">
          {group.locations.slice(0, MAX_VISIBLE_LOCATIONS).map((location) => (
            <span key={location.name} className="bg-gray-700/50 text-fg-muted text-xs px-2 py-0.5 rounded">
              {location.name}{group.count > 1 && ` (${location.count})`}
            </span>
          ))}
          {hiddenLocationCount > 0 && (
            <button
              type="button"
              onClick={() => onShowLocations(group)}
              className="text-accent hover:text-accent-soft text-xs px-1"
            >
              +{hiddenLocationCount}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

