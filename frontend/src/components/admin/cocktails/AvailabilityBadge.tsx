import type { CocktailAvailability } from '../../../types';
import Badge from '../../ui/Badge';

// The backend caps the servings of a cocktail made only of unlimited ingredients.
const UNLIMITED_SERVINGS = 999;
const LOW_SERVINGS = 3;

interface AvailabilityBadgeProps {
  availability?: CocktailAvailability;
  /** True while the availability is (re)loading: the previous value may be outdated. */
  loading: boolean;
}

/** How many servings the stock allows, or that the cocktail cannot be made. */
export default function AvailabilityBadge({ availability, loading }: AvailabilityBadgeProps) {
  if (!availability || loading) return <Badge>...</Badge>;
  if (!availability.isAvailable) return <Badge tone="danger">Indisponible</Badge>;

  const { maxServings } = availability;
  const servings = maxServings >= UNLIMITED_SERVINGS ? '∞' : maxServings;
  return (
    <Badge tone={maxServings <= LOW_SERVINGS ? 'warning' : 'success'}>
      {servings} {maxServings === 1 ? 'dose' : 'doses'}
    </Badge>
  );
}
