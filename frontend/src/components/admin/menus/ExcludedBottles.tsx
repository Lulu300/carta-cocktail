import { useTranslation } from 'react-i18next';
import type { MenuBottleExclusion } from '../../../services/api';
import Button from '../../ui/Button';
import Card from '../../ui/Card';
import Spinner from '../../ui/Spinner';
import LoadError from '../LoadError';
import BottleGroupLabel from './BottleGroupLabel';
import { groupExcludedBottles } from './menuBottleGroups';
import { useMenuExclusions } from './useMenuBottles';

interface ExcludedBottlesProps {
  menuId: number;
  /** Receives every removed bottle of a group of identical bottles. */
  onRestore: (exclusions: MenuBottleExclusion[]) => void;
}

/** The bottles removed from a system menu, grouped like the menu, each group with a button that puts it back. */
export default function ExcludedBottles({ menuId, onRestore }: ExcludedBottlesProps) {
  const { t } = useTranslation();
  const exclusionsQuery = useMenuExclusions(menuId);
  const exclusions = exclusionsQuery.data ?? [];
  const groups = groupExcludedBottles(exclusions);

  return (
    <Card as="section" className="mt-6">
      {/* Open as soon as the list has a bottle: an empty list stays folded. */}
      <details open={exclusions.length > 0}>
        <summary className="cursor-pointer text-lg font-semibold">
          {t('menus.bottles.excludedTitle', { count: exclusions.length })}
        </summary>
        <div className="mt-4">
          {exclusionsQuery.isPending && <div className="flex justify-center py-4"><Spinner /></div>}
          {exclusionsQuery.isError && <LoadError onRetry={() => exclusionsQuery.refetch()} />}
          {exclusionsQuery.isSuccess && exclusions.length === 0 && (
            <p className="text-center py-4 text-sm text-fg-muted">{t('menus.bottles.noExcluded')}</p>
          )}
          <ul className="space-y-2">
            {groups.map((group) => (
              <li key={group.key} className="flex items-center gap-3 p-3 rounded-lg border border-line-strong bg-canvas">
                <div className="flex-1 min-w-0">
                  <BottleGroupLabel bottle={group.bottle} count={group.exclusions.length} isEmpty={group.isEmpty} />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={t('menus.bottles.restoreLabel', { name: group.bottle.name })}
                  onClick={() => onRestore(group.exclusions)}
                >
                  {t('menus.bottles.restore')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </Card>
  );
}
