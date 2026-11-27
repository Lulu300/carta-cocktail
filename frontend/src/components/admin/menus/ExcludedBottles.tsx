import { useTranslation } from 'react-i18next';
import type { MenuBottleExclusion, MenuRow } from '../../../types';
import Card from '../../ui/Card';
import Spinner from '../../ui/Spinner';
import LoadError from '../LoadError';
import BottleGroupActionRow from './BottleGroupActionRow';
import { isAvailableForMenu } from './bottleMenuType';
import { groupExcludedBottles } from './menuBottleGroups';
import { useMenuExclusions } from './useMenuBottles';

interface ExcludedBottlesProps {
  menu: Pick<MenuRow, 'id' | 'type'>;
  /** Shown on a bottle no longer checked for the menu's type: putting it back does not bring it into the menu. */
  uncheckedNote: string;
  /** Receives every removed bottle of a group of identical bottles. */
  onRestore: (exclusions: MenuBottleExclusion[]) => void;
}

/** The bottles removed from a system menu, grouped like the menu, each group with a button that puts it back. */
export default function ExcludedBottles({ menu, uncheckedNote, onRestore }: ExcludedBottlesProps) {
  const { t } = useTranslation();
  const exclusionsQuery = useMenuExclusions(menu.id);
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
          {exclusionsQuery.isPending && (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          )}
          {exclusionsQuery.isError && <LoadError onRetry={() => exclusionsQuery.refetch()} />}
          {exclusionsQuery.isSuccess && exclusions.length === 0 && (
            <p className="text-center py-4 text-sm text-fg-muted">
              {t('menus.bottles.noExcluded')}
            </p>
          )}
          <ul className="space-y-2">
            {groups.map((group) => (
              <BottleGroupActionRow
                key={group.key}
                bottle={group.bottle}
                count={group.exclusions.length}
                isEmpty={group.isEmpty}
                note={isAvailableForMenu(group.bottle, menu) ? undefined : uncheckedNote}
                actionText={t('menus.bottles.restore')}
                actionLabel={t('menus.bottles.restoreLabel', { name: group.bottle.name })}
                onAction={() => onRestore(group.exclusions)}
              />
            ))}
          </ul>
        </div>
      </details>
    </Card>
  );
}
