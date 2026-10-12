import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import type { Bottle } from '../../../types';
import Badge from '../../ui/Badge';

interface BottleGroupLabelProps {
  /** The first bottle of the group, for its name and category. */
  bottle: Bottle;
  count: number;
  isEmpty: boolean;
}

/** Name, count, "empty" badge and category of a group of identical bottles. */
export default function BottleGroupLabel({ bottle, count, isEmpty }: BottleGroupLabelProps) {
  const { t } = useTranslation();
  const localize = useLocalizedName();

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{bottle.name}</span>
        {count > 1 && <Badge tone="accent">{t('menus.bottles.count', { count })}</Badge>}
        {isEmpty && <Badge tone="warning">{t('menus.bottles.empty')}</Badge>}
      </div>
      {bottle.category && <div className="text-xs text-fg-muted">{localize(bottle.category)}</div>}
    </>
  );
}
