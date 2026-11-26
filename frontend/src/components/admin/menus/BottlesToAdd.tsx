import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../../hooks/useLocalizedName';
import { useBottles } from '../../../queries/bottles';
import type { Bottle, Menu } from '../../../types';
import { getBottleSearchText, matchesSearchText } from '../../../utils/cocktailSearch';
import Card from '../../ui/Card';
import SearchInput from '../../ui/SearchInput';
import Spinner from '../../ui/Spinner';
import LoadError from '../LoadError';
import BottleGroupActionRow from './BottleGroupActionRow';
import { isAvailableForMenu } from './bottleMenuType';
import { groupBottleChoices } from './menuBottleGroups';

interface BottlesToAddProps {
  menu: Menu;
  /** What the list offers, for the menu's type. */
  hint: string;
  /** Shown when every bottle checked for the menu's type is already in it. */
  noChoice: string;
  /** Receives every bottle of a group of identical bottles. */
  onAdd: (bottles: Bottle[]) => void;
}

/**
 * The bottles checked for the type of a personal menu that are not in it yet,
 * empty ones included, grouped like the menu: each group has a button that adds it.
 */
export default function BottlesToAdd({ menu, hint, noChoice, onAdd }: BottlesToAddProps) {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const bottlesQuery = useBottles();
  const [search, setSearch] = useState('');

  const inMenu = new Set((menu.bottles ?? []).map((entry) => entry.bottleId));
  const choices = (bottlesQuery.data ?? []).filter(
    (bottle) => isAvailableForMenu(bottle, menu) && !inMenu.has(bottle.id),
  );
  const groups = groupBottleChoices(
    choices.filter((bottle) => matchesSearchText(getBottleSearchText(bottle, localize), search)),
  );

  return (
    <Card as="section" className="mt-6">
      <h2 className="text-lg font-semibold mb-2">{t('menus.bottles.addTitle')}</h2>
      <p className="mb-4 text-sm text-fg-muted">{hint}</p>
      {bottlesQuery.isPending && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
      {bottlesQuery.isError && <LoadError onRetry={() => bottlesQuery.refetch()} />}
      {bottlesQuery.isSuccess && choices.length === 0 && (
        <p className="text-center py-4 text-sm text-fg-muted">{noChoice}</p>
      )}
      {choices.length > 0 && (
        <>
          <SearchInput
            value={search}
            onChange={setSearch}
            label={t('menus.bottles.searchChoices')}
            className="mb-4"
          />
          {groups.length === 0 && (
            <p className="text-center py-4 text-sm text-fg-muted">{t('common.noResults')}</p>
          )}
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {groups.map((group) => (
              <BottleGroupActionRow
                key={group.key}
                bottle={group.bottle}
                count={group.bottles.length}
                isEmpty={group.isEmpty}
                actionText={t('menus.bottles.add')}
                actionLabel={t('menus.bottles.addLabel', { name: group.bottle.name })}
                onAction={() => onAdd(group.bottles)}
              />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
