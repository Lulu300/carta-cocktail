import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { menus as menusApi, menuBottles as menuBottlesApi } from '../../services/api';
import type { Menu } from '../../types';
import { useConfirm } from '../../contexts/ConfirmContext';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import BottleGroupLabel from '../../components/admin/menus/BottleGroupLabel';
import ExcludedBottles from '../../components/admin/menus/ExcludedBottles';
import MenuComposition from '../../components/admin/menus/MenuComposition';
import MenuEditorLayout from '../../components/admin/menus/MenuEditorLayout';
import MenuItemRow from '../../components/admin/menus/MenuItemRow';
import { groupBySection } from '../../components/admin/menus/groupBySection';
import { isSystemMenu } from '../../components/admin/menus/isSystemMenu';
import { groupMenuBottles, hasBottle, type MenuBottleGroup } from '../../components/admin/menus/menuBottleGroups';
import { useMenuBottles, type EntryChanges } from '../../components/admin/menus/useMenuBottles';
import { useMenuMutation } from '../../components/admin/menus/useMenuMutation';

interface MenuTypeTexts {
  title: string;
  hint: string;
  empty: string;
}

const TYPE_TEXTS: Record<Menu['type'], MenuTypeTexts> = {
  APEROS: { title: 'menus.bottles.aperos.title', hint: 'menus.bottles.aperos.hint', empty: 'menus.bottles.aperos.empty' },
  DIGESTIFS: {
    title: 'menus.bottles.digestifs.title',
    hint: 'menus.bottles.digestifs.hint',
    empty: 'menus.bottles.digestifs.empty',
  },
  // A cocktail menu holds no bottle: only reached through a typed URL.
  COCKTAILS: { title: 'menus.edit', hint: 'menus.bottles.cocktailMenu', empty: 'menus.bottles.cocktailMenu' },
};

export default function MenuBottleEditPage() {
  const { t } = useTranslation();
  const menuId = Number(useParams().id);

  return (
    <MenuEditorLayout menuId={menuId} itemLabel="bottles" title={(menu) => t(TYPE_TEXTS[menu.type].title)}>
      {(menu) => <MenuBottles menu={menu} />}
    </MenuEditorLayout>
  );
}

/** The bottles of the menu, grouped when identical: every change is saved at once. */
function MenuBottles({ menu }: { menu: Menu }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const mutations = useMenuBottles(menu.id);
  // Queued with the other changes of the menu. The menu read after the sync becomes the
  // confirmed state, so a change sent next already counts the bottles it added.
  const sync = useMenuMutation<void, Menu>({
    menuId: menu.id,
    mutationFn: async () => {
      await menuBottlesApi.sync(menu.id);
      return menusApi.get(menu.id);
    },
    applyConfirmed: (state, _variables, syncedMenu) => ({ ...state, menu: syncedMenu }),
  });
  const isSystem = isSystemMenu(menu);
  const sections = menu.sections ?? [];
  const groups = groupMenuBottles((menu.bottles ?? []).filter(hasBottle));
  // A bottle put back in the menu has no id yet: the new order cannot name it.
  const canReorder = groups.every((group) => group.isSaved);
  const texts = TYPE_TEXTS[menu.type];

  const updateGroup = (group: MenuBottleGroup, changes: EntryChanges) => {
    mutations.update.mutate({ entryIds: group.entries.map((entry) => entry.id), changes });
  };

  const reorder = (ordered: MenuBottleGroup[]) => {
    mutations.reorder.mutate(ordered.flatMap((group) => group.entries.map((entry) => entry.id)));
  };

  const exclude = async (group: MenuBottleGroup) => {
    const confirmed = await confirm({
      title: t('menus.bottles.excludeTitle'),
      message: t('menus.bottles.excludeMessage', { name: group.bottle.name }),
      confirmLabel: t('menus.bottles.exclude'),
      tone: 'danger',
    });
    if (confirmed) mutations.exclude.mutate(group.entries);
  };

  return (
    <>
      <Card as="section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('menus.bottles.title')}</h2>
          <Button variant="secondary" size="sm" loading={sync.isPending} onClick={() => sync.mutate(undefined)}>
            {t('menus.bottles.sync')}
          </Button>
        </div>
        <p className="mb-4 p-3 bg-info/10 border border-info/30 rounded-lg text-sm text-info">{t(texts.hint)}</p>
        {groups.length === 0 ? (
          <p className="text-center py-8 text-fg-muted">{t(texts.empty)}</p>
        ) : (
          <MenuComposition
            groups={groupBySection(groups, sections)}
            getKey={(group) => group.key}
            onReorder={reorder}
            renderItem={(group, move) => (
              <MenuItemRow
                label={group.bottle.name}
                isHidden={group.isHidden}
                onToggleHidden={() => updateGroup(group, { isHidden: !group.isHidden })}
                sections={sections}
                sectionId={group.menuSectionId}
                onSectionChange={(menuSectionId) => updateGroup(group, { menuSectionId })}
                move={{ ...move, disableUp: move.disableUp || !canReorder, disableDown: move.disableDown || !canReorder }}
                onRemove={isSystem ? () => exclude(group) : undefined}
                disabled={!group.isSaved}
                details={group.bottle.alcoholPercentage != null && (
                  <span className="text-xs text-fg-muted">{t('menus.bottles.abv', { value: group.bottle.alcoholPercentage })}</span>
                )}
              >
                <BottleGroupLabel bottle={group.bottle} count={group.entries.length} isEmpty={group.isEmpty} />
              </MenuItemRow>
            )}
          />
        )}
      </Card>
      {isSystem && <ExcludedBottles menuId={menu.id} onRestore={(exclusions) => mutations.restore.mutate(exclusions)} />}
    </>
  );
}
