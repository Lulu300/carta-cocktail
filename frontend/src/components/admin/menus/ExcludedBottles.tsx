import { useTranslation } from 'react-i18next';
import type { MenuBottleExclusion } from '../../../services/api';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Card from '../../ui/Card';
import Spinner from '../../ui/Spinner';
import LoadError from '../LoadError';
import { isEmptyBottle } from './menuBottleGroups';
import { useMenuExclusions } from './useMenuBottles';

interface ExcludedBottlesProps {
  menuId: number;
  onRestore: (exclusion: MenuBottleExclusion) => void;
}

/** The bottles removed from a system menu, each with a button that puts it back. */
export default function ExcludedBottles({ menuId, onRestore }: ExcludedBottlesProps) {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const exclusionsQuery = useMenuExclusions(menuId);
  const exclusions = exclusionsQuery.data ?? [];

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
            {exclusions.map((exclusion) => (
              <li key={exclusion.bottleId} className="flex items-center gap-3 p-3 rounded-lg border border-line-strong bg-canvas">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{exclusion.bottle.name}</span>
                    {isEmptyBottle(exclusion.bottle) && <Badge tone="warning">{t('menus.bottles.empty')}</Badge>}
                  </div>
                  {exclusion.bottle.category && (
                    <div className="text-xs text-fg-muted">{localize(exclusion.bottle.category)}</div>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={t('menus.bottles.restoreLabel', { name: exclusion.bottle.name })}
                  onClick={() => onRestore(exclusion)}
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
