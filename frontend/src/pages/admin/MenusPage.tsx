import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSort } from '../../hooks/useSort';
import { usePagination } from '../../hooks/usePagination';
import { menus as menusApi } from '../../services/api';
import type { Menu, MenuInput } from '../../types';
import { qk } from '../../queries/keys';
import { useMenus } from '../../queries/menus';
import { useCrudMutations } from '../../queries/crud';
import { getBadgeClasses } from '../../utils/colors';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Icon from '../../components/ui/Icon';
import IconButton from '../../components/ui/IconButton';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import SearchInput from '../../components/ui/SearchInput';
import Textarea from '../../components/ui/Textarea';
import ToggleSwitch from '../../components/ui/ToggleSwitch';
import { cx, focusRingClasses } from '../../components/ui/classNames';
import DataTable, { type Column } from '../../components/admin/DataTable';
import { useConfirmDelete } from '../../components/admin/useConfirmDelete';
import { useEntityForm } from '../../components/admin/useEntityForm';
import { isSystemMenu } from '../../components/admin/menus/isSystemMenu';
import { toSlug } from '../../components/admin/menus/menuSlug';

interface MenuForm {
  name: string;
  slug: string;
  description: string;
  isPublic: boolean;
}

const EMPTY_MENU_FORM: MenuForm = { name: '', slug: '', description: '', isPublic: false };

const TYPE_BADGES: Record<Menu['type'], { label: string; color: string }> = {
  COCKTAILS: { label: 'Cocktails', color: 'purple' },
  APEROS: { label: 'Apéritifs', color: 'yellow' },
  DIGESTIFS: { label: 'Digestifs', color: 'orange' },
};

function isBottleMenu(menu: Menu): boolean {
  return menu.type === 'APEROS' || menu.type === 'DIGESTIFS';
}

export default function MenusPage() {
  const { t } = useTranslation();
  const confirmDelete = useConfirmDelete();
  const menusQuery = useMenus();
  const { create, remove } = useCrudMutations<MenuInput>({
    key: qk.menus,
    api: menusApi,
    messages: { created: 'menus.created', updated: 'menus.updated', deleted: 'menus.deleted' },
  });
  const menuForm = useEntityForm<Menu, MenuForm>(() => EMPTY_MENU_FORM);
  const { form, setField } = menuForm;
  const [search, setSearch] = useState('');

  const filteredMenus = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (menusQuery.data ?? []).filter((menu) =>
      menu.name.toLowerCase().includes(query) || menu.slug.toLowerCase().includes(query),
    );
  }, [menusQuery.data, search]);

  const sort = useSort<Menu>(filteredMenus);
  const pagination = usePagination(sort.sortedItems);

  // A slug already taken comes back as a 409, shown in the error toast; the form stays open.
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(form, { onSuccess: menuForm.close });
  };

  const handleDelete = async (menu: Menu) => {
    if (await confirmDelete(t('menus.confirmDelete'))) remove.mutate(menu.id);
  };

  const columns: Column<Menu>[] = [
    {
      key: 'name',
      header: t('menus.name'),
      sortable: true,
      className: 'font-medium',
      render: (menu) => (
        <>
          <a
            href={`/menu/${menu.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg hover:text-accent transition-colors"
            title={menu.isPublic ? t('menus.publicUrl') : t('menus.edit')}
          >
            {menu.name}
          </a>
          {isSystemMenu(menu) && <span className="ml-2 text-xs text-fg-muted">(par défaut)</span>}
        </>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (menu) => (
        <span className={cx('px-2 py-0.5 rounded text-xs font-medium', getBadgeClasses(TYPE_BADGES[menu.type].color))}>
          {TYPE_BADGES[menu.type].label}
        </span>
      ),
    },
    { key: 'slug', header: t('menus.slug'), sortable: true, className: 'text-fg-muted', render: (menu) => `/menu/${menu.slug}` },
    {
      key: 'isPublic',
      header: t('menus.isPublic'),
      sortable: true,
      render: (menu) => (menu.isPublic
        ? <Badge tone="success">{t('common.yes')}</Badge>
        : <Badge>{t('common.no')}</Badge>),
    },
    {
      key: 'content',
      header: 'Contenu',
      className: 'text-fg-muted',
      render: (menu) => (isBottleMenu(menu)
        ? `${menu._count?.bottles ?? 0} bouteille(s)`
        : `${menu._count?.cocktails ?? 0} cocktail(s)`),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      align: 'right',
      render: (menu) => (
        <div className="flex items-center justify-end gap-1">
          <Link
            to={isBottleMenu(menu) ? `/admin/menus/${menu.id}/bottles` : `/admin/menus/${menu.id}`}
            aria-label={t('common.edit')}
            title={t('common.edit')}
            className={cx('inline-flex items-center justify-center min-w-10 min-h-10 rounded-lg text-accent hover:bg-accent/10', focusRingClasses)}
          >
            <Icon name="edit" />
          </Link>
          {!isSystemMenu(menu) && (
            <IconButton icon="delete" label={t('common.delete')} variant="danger" onClick={() => handleDelete(menu)} />
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif text-accent">{t('menus.title')}</h1>
        <Button onClick={() => menuForm.open()}>{t('menus.add')}</Button>
      </div>
      <SearchInput value={search} onChange={setSearch} label={t('menus.search')} className="max-w-sm mb-4" />
      <DataTable
        columns={columns}
        rows={pagination.paginatedItems}
        getRowKey={(menu) => menu.id}
        sort={sort}
        pagination={pagination}
        isLoading={menusQuery.isPending}
        isError={menusQuery.isError}
        onRetry={() => menusQuery.refetch()}
        emptyLabel={t('common.noResults')}
      />
      <Modal open={menuForm.isOpen} onClose={menuForm.close} title={t('menus.add')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t('menus.name')} required>
            <Input value={form.name} onChange={(event) => setField('name', event.target.value)} />
          </Field>
          <Field label={t('menus.slug')} required>
            <Input value={form.slug} onChange={(event) => setField('slug', toSlug(event.target.value))} />
          </Field>
          <Field label={t('menus.description')}>
            <Textarea
              value={form.description}
              onChange={(event) => setField('description', event.target.value)}
              rows={2}
              className="resize-none"
            />
          </Field>
          <ToggleSwitch
            checked={form.isPublic}
            onChange={(isPublic) => setField('isPublic', isPublic)}
            label={t('menus.isPublic')}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={menuForm.close}>{t('common.cancel')}</Button>
            <Button type="submit" loading={create.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
