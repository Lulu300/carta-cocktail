import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import Badge from '../../ui/Badge';
import type { MenuBottleGroup } from './menuBottleGroups';

/** Name, count, "empty" badge and category of a group of identical bottles. */
export default function BottleGroupLabel({ group }: { group: MenuBottleGroup }) {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const { bottle, entries, isEmpty } = group;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{bottle.name}</span>
        {entries.length > 1 && <Badge tone="accent">{t('menus.bottles.count', { count: entries.length })}</Badge>}
        {isEmpty && <Badge tone="warning">{t('menus.bottles.empty')}</Badge>}
      </div>
      {bottle.category && <div className="text-xs text-fg-muted">{localize(bottle.category)}</div>}
    </>
  );
}
