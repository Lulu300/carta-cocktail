import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import type { CocktailAvailability, IngredientAvailability } from '../../../types';
import { cx } from '../../ui/classNames';

// Enough to recognise the problem on a card; the recipe page lists the rest.
const MAX_LISTED = 2;

type WarningTone = 'warning' | 'danger';

const TONE_CLASSES: Record<WarningTone, string> = {
  warning: 'bg-warning/10 border-warning/20 text-warning',
  danger: 'bg-danger/10 border-danger/20 text-danger',
};

interface WarningBoxProps {
  tone: WarningTone;
  title: string;
  names: string[];
  /** Shown under the listed names when some are left out. */
  more?: ReactNode;
}

function WarningBox({ tone, title, names, more }: WarningBoxProps) {
  if (names.length === 0) return null;
  return (
    <div className={cx('mb-2 p-2 border rounded text-xs', TONE_CLASSES[tone])}>
      <div className="font-medium mb-1">{title}</div>
      {names.slice(0, MAX_LISTED).map((name, index) => (
        <div key={index} className="opacity-80 truncate">
          {name}
        </div>
      ))}
      {names.length > MAX_LISTED && more}
    </div>
  );
}

interface AvailabilityWarningsProps {
  availability?: CocktailAvailability;
  loading: boolean;
}

/** Low stock, missing ingredients and category lines whose preferred bottles are all empty. */
export default function AvailabilityWarnings({ availability, loading }: AvailabilityWarningsProps) {
  const { t } = useTranslation();
  const localizedName = useLocalizedName();
  if (!availability || loading) return null;

  const lineName = (line: IngredientAvailability) =>
    line.orphan ? t('cocktails.unknownSource') : localizedName(line);
  const lowStock = availability.lowStock.map((resource) =>
    t('cocktails.lowStockItem', { name: localizedName(resource), count: resource.servings }),
  );
  const missing = availability.ingredients.filter((line) => !line.isAvailable).map(lineName);
  const withoutPreferred = availability.ingredients
    .filter((line) => line.preferredAvailable === false)
    .map(lineName);

  return (
    <>
      <WarningBox tone="warning" title={`⚠️ ${t('cocktails.lowStock')}`} names={lowStock} />
      <WarningBox
        tone="danger"
        title={`❌ ${t('cocktails.missing')}`}
        names={missing}
        more={
          <div className="opacity-60">
            {t('cocktails.moreMissing', { count: missing.length - MAX_LISTED })}
          </div>
        }
      />
      <WarningBox
        tone="warning"
        title={`⚠️ ${t('cocktails.noPreferredAvailable')}`}
        names={withoutPreferred}
      />
    </>
  );
}
