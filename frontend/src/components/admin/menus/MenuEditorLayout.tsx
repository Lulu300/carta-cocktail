import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { menus as menusApi } from '../../../services/api';
import type { Menu } from '../../../types';
import { useMenu } from '../../../queries/menus';
import Button from '../../ui/Button';
import Spinner from '../../ui/Spinner';
import { cx, focusRingClasses } from '../../ui/classNames';
import { isSystemMenu } from './isSystemMenu';
import MenuInfoForm, { type MenuInfoValues } from './MenuInfoForm';
import MenuSectionsManager from './MenuSectionsManager';
import { updateMenu, useMenuMutation } from './useMenuMutation';

interface MenuEditorLayoutProps {
  menuId: number;
  /** What the menu holds, for the texts of the sections. */
  itemLabel: 'cocktails' | 'bottles';
  title: (menu: Menu) => string;
  /** The composition of the menu. */
  children: (menu: Menu) => ReactNode;
}

function BackToList() {
  const { t } = useTranslation();
  return (
    <Link to="/admin/menus" className={cx('text-sm text-fg-muted hover:text-fg rounded', focusRingClasses)}>
      ← {t('menus.backToList')}
    </Link>
  );
}

/** Loads a menu and shows what both menu editors share: info form, sections, link back to the list. */
export default function MenuEditorLayout({ menuId, itemLabel, title, children }: MenuEditorLayoutProps) {
  const { t } = useTranslation();
  const menuQuery = useMenu(menuId);
  // Queued with the composition changes of the menu, so its refetch never hides one of them.
  const saveInfo = useMenuMutation<Partial<MenuInfoValues>>({
    menuId,
    mutationFn: (values) => menusApi.update(menuId, values),
    applyConfirmed: (state, values) => updateMenu(state, (menu) => ({ ...menu, ...values })),
    successMessage: 'menus.updated',
  });

  if (menuQuery.isPending) {
    return <div className="flex justify-center py-12"><Spinner /></div>;
  }

  if (menuQuery.isError) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-danger">{t('menus.loadError')}</p>
        <Button variant="secondary" size="sm" onClick={() => menuQuery.refetch()}>{t('common.retry')}</Button>
        <BackToList />
      </div>
    );
  }

  const menu = menuQuery.data;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold font-serif text-accent mb-6">{title(menu)}</h1>
      <MenuInfoForm
        key={menu.id}
        menu={menu}
        lockedFields={isSystemMenu(menu) ? ['slug'] : []}
        onSave={(values) => saveInfo.mutate(values)}
        isSaving={saveInfo.isPending}
      />
      <MenuSectionsManager menuId={menu.id} sections={menu.sections ?? []} itemLabel={itemLabel} />
      {children(menu)}
      <div className="mt-6">
        <BackToList />
      </div>
    </div>
  );
}
