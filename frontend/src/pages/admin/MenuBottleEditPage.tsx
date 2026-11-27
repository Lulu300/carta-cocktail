import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { menus as menusApi, menuBottles as menuBottlesApi } from '../../services/api';
import type { Menu } from '../../types';
import { isBottleMenu, type BottleMenuType } from '../../utils/menuType';
import { useConfirm } from '../../contexts/ConfirmContext';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import BottleGroupLabel from '../../components/admin/menus/BottleGroupLabel';
import BottlesToAdd from '../../components/admin/menus/BottlesToAdd';
import ExcludedBottles from '../../components/admin/menus/ExcludedBottles';
import MenuComposition from '../../components/admin/menus/MenuComposition';
import MenuEditorLayout from '../../components/admin/menus/MenuEditorLayout';
import MenuItemRow from '../../components/admin/menus/MenuItemRow';
import { groupBySection } from '../../components/admin/menus/groupBySection';
import { menuEditorPath } from '../../components/admin/menus/bottleMenuType';
import { isSystemMenu } from '../../components/admin/menus/isSystemMenu';
import {
  groupMenuBottles,
  hasBottle,
  type MenuBottleGroup,
} from '../../components/admin/menus/menuBottleGroups';
import { useMenuBottles, type EntryChanges } from '../../components/admin/menus/useMenuBottles';
import { useMenuMutation } from '../../components/admin/menus/useMenuMutation';

/** i18n keys of the texts that depend on the kind of menu. */
interface MenuKindTexts {
  title: string;
  hint: string;
  empty: string;
}

/** A system menu follows the boxes of the bottles; a personal menu is filled by hand. */
interface MenuTypeTexts {
  system: MenuKindTexts;
  personal: MenuKindTexts;
  /** What the list of bottles to add offers, on a personal menu. */
  choices: string;
  noChoice: string;
  /** Shown on a bottle removed from a system menu and no longer checked for its type. */
  unchecked: string;
}

type BottleMenu = Menu & { type: BottleMenuType };

const TYPE_TEXTS: Record<BottleMenuType, MenuTypeTexts> = {
  APEROS: {
    system: {
      title: 'menus.bottles.aperos.title',
      hint: 'menus.bottles.aperos.hint',
      empty: 'menus.bottles.aperos.empty',
    },
    personal: {
      title: 'menus.bottles.aperos.personalTitle',
      hint: 'menus.bottles.aperos.personalHint',
      empty: 'menus.bottles.aperos.personalEmpty',
    },
    choices: 'menus.bottles.aperos.choices',
    noChoice: 'menus.bottles.aperos.noChoice',
    unchecked: 'menus.bottles.aperos.unchecked',
  },
  DIGESTIFS: {
    system: {
      title: 'menus.bottles.digestifs.title',
      hint: 'menus.bottles.digestifs.hint',
      empty: 'menus.bottles.digestifs.empty',
    },
    personal: {
      title: 'menus.bottles.digestifs.personalTitle',
      hint: 'menus.bottles.digestifs.personalHint',
      empty: 'menus.bottles.digestifs.personalEmpty',
    },
    choices: 'menus.bottles.digestifs.choices',
    noChoice: 'menus.bottles.digestifs.noChoice',
    unchecked: 'menus.bottles.digestifs.unchecked',
  },
};

function kindTexts(menu: BottleMenu): MenuKindTexts {
  return isSystemMenu(menu) ? TYPE_TEXTS[menu.type].system : TYPE_TEXTS[menu.type].personal;
}

export default function MenuBottleEditPage() {
  const { t } = useTranslation();
  const menuId = Number(useParams().id);

  // A cocktail menu holds no bottle: a URL typed by hand opens its own editor, under the same title.
  return (
    <MenuEditorLayout
      menuId={menuId}
      itemLabel="bottles"
      title={(menu) => t(isBottleMenu(menu) ? kindTexts(menu).title : 'menus.edit')}
    >
      {(menu) =>
        isBottleMenu(menu) ? (
          <MenuBottles menu={menu} />
        ) : (
          <Navigate to={menuEditorPath(menu)} replace />
        )
      }
    </MenuEditorLayout>
  );
}

/**
 * The bottles of the menu, grouped when identical: every change is saved at once.
 * A system menu gets its bottles from their boxes, a personal menu from the list of bottles to add.
 */
function MenuBottles({ menu }: { menu: BottleMenu }) {
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
  const typeTexts = TYPE_TEXTS[menu.type];
  const texts = kindTexts(menu);

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

  // A system menu keeps a removed bottle as an exclusion; a personal menu just lets it go.
  const remove = (group: MenuBottleGroup) => {
    if (isSystem) void exclude(group);
    else mutations.remove.mutate(group.entries);
  };

  return (
    <>
      <Card as="section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('menus.bottles.title')}</h2>
          {isSystem && (
            <Button
              variant="secondary"
              size="sm"
              loading={sync.isPending}
              onClick={() => sync.mutate(undefined)}
            >
              {t('menus.bottles.sync')}
            </Button>
          )}
        </div>
        <p className="mb-4 p-3 bg-info/10 border border-info/30 rounded-lg text-sm text-info">
          {t(texts.hint)}
        </p>
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
                move={{
                  ...move,
                  disableUp: move.disableUp || !canReorder,
                  disableDown: move.disableDown || !canReorder,
                }}
                onRemove={() => remove(group)}
                disabled={!group.isSaved}
                details={
                  group.bottle.alcoholPercentage != null && (
                    <span className="text-xs text-fg-muted">
                      {t('units.abv', { value: group.bottle.alcoholPercentage })}
                    </span>
                  )
                }
              >
                <BottleGroupLabel
                  bottle={group.bottle}
                  count={group.entries.length}
                  isEmpty={group.isEmpty}
                />
              </MenuItemRow>
            )}
          />
        )}
      </Card>
      {isSystem ? (
        <ExcludedBottles
          menu={menu}
          uncheckedNote={t(typeTexts.unchecked)}
          onRestore={(exclusions) => mutations.restore.mutate(exclusions)}
        />
      ) : (
        <BottlesToAdd
          menu={menu}
          hint={t(typeTexts.choices)}
          noChoice={t(typeTexts.noChoice)}
          onAdd={(bottles) => mutations.add.mutate(bottles)}
        />
      )}
    </>
  );
}
