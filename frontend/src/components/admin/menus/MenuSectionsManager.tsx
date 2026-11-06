import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MenuSection } from '../../../types';
import Button from '../../ui/Button';
import Card from '../../ui/Card';
import Field from '../../ui/Field';
import IconButton from '../../ui/IconButton';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import { useConfirmDelete } from '../useConfirmDelete';
import { moveItem } from './moveItem';
import ReorderButtons from './ReorderButtons';
import { useMenuSections, type MenuSectionsMutations } from './useMenuSections';

interface MenuSectionsManagerProps {
  menuId: number;
  sections: MenuSection[];
  /** What the menu holds: picks the texts that say where the items of a deleted section go. */
  itemLabel: 'cocktails' | 'bottles';
}

/** Creates, renames, deletes and orders the sections of a menu. */
export default function MenuSectionsManager({ menuId, sections, itemLabel }: MenuSectionsManagerProps) {
  const { t } = useTranslation();
  const confirmDelete = useConfirmDelete();
  const mutations = useMenuSections(menuId);
  const [isCreating, setIsCreating] = useState(false);

  const move = (from: number, to: number) => {
    mutations.reorder.mutate(moveItem(sections, from, to).map((section) => section.id));
  };

  const remove = async (section: MenuSection) => {
    if (await confirmDelete(t(`menus.sections.confirmDelete.${itemLabel}`, { name: section.name }))) {
      mutations.remove.mutate(section.id);
    }
  };

  return (
    <Card as="section" className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{t('menus.sections.title')}</h2>
        <Button variant="secondary" size="sm" onClick={() => setIsCreating(true)}>{t('menus.sections.add')}</Button>
      </div>
      {sections.length === 0 ? (
        <p className="text-center py-4 text-fg-muted text-sm">{t(`menus.sections.empty.${itemLabel}`)}</p>
      ) : (
        <ul className="space-y-2">
          {sections.map((section, index) => (
            <li key={section.id} className="flex items-center gap-3 p-3 rounded-lg border border-line-strong bg-canvas">
              <ReorderButtons
                label={section.name}
                onUp={() => move(index, index - 1)}
                onDown={() => move(index, index + 1)}
                disableUp={index === 0}
                disableDown={index === sections.length - 1}
              />
              <SectionName section={section} mutations={mutations} onDelete={() => remove(section)} />
            </li>
          ))}
        </ul>
      )}
      <Modal open={isCreating} onClose={() => setIsCreating(false)} title={t('menus.sections.create')}>
        <SectionForm
          isSaving={mutations.create.isPending}
          onCancel={() => setIsCreating(false)}
          onSubmit={(name) => mutations.create.mutate(name, { onSuccess: () => setIsCreating(false) })}
        />
      </Modal>
    </Card>
  );
}

interface SectionNameProps {
  section: MenuSection;
  mutations: MenuSectionsMutations;
  onDelete: () => void;
}

/** The name of a section, with its edit and delete buttons, or the rename field. */
function SectionName({ section, mutations, onDelete }: SectionNameProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const name = draft?.trim();
    if (name) mutations.rename.mutate({ id: section.id, name });
    setDraft(null);
  };

  if (draft === null) {
    return (
      <>
        <span className="flex-1 font-medium">{section.name}</span>
        <IconButton icon="edit" label={t('menus.sections.rename', { name: section.name })} onClick={() => setDraft(section.name)} />
        <IconButton icon="delete" variant="danger" label={t('menus.sections.delete', { name: section.name })} onClick={onDelete} />
      </>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-1 items-center gap-2">
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label={t('menus.sections.name')}
        className="flex-1"
        autoFocus
      />
      <Button type="submit" size="sm">{t('common.save')}</Button>
      <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
    </form>
  );
}

interface SectionFormProps {
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}

/** Mounted with the modal content: the field starts empty on every opening. */
function SectionForm({ isSaving, onCancel, onSubmit }: SectionFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) onSubmit(name.trim());
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t('menus.sections.name')} required>
        <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </Field>
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" loading={isSaving}>{t('common.create')}</Button>
      </div>
    </form>
  );
}
