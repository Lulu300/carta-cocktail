import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  if (!availability || loading) return <Badge>...</Badge>;
  if (!availability.isAvailable) return <Badge tone="danger">{t('cocktails.unavailable')}</Badge>;

  const { maxServings } = availability;
  const servings = maxServings >= UNLIMITED_SERVINGS ? '∞' : maxServings;
  // count picks the plural form; servings is the text shown, "∞" for an unlimited cocktail.
  return (
    <Badge tone={maxServings <= LOW_SERVINGS ? 'warning' : 'success'}>
      {t('cocktails.doses', { count: maxServings, servings })}
    </Badge>
  );
}
