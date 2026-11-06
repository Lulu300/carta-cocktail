import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Menu } from '../../../types';
import Button from '../../ui/Button';
import Card from '../../ui/Card';
import Field from '../../ui/Field';
import Input from '../../ui/Input';
import Textarea from '../../ui/Textarea';
import ToggleSwitch from '../../ui/ToggleSwitch';
import { toSlug } from './menuSlug';

export interface MenuInfoValues {
  name: string;
  slug: string;
  description: string;
  isPublic: boolean;
}

type MenuInfoField = keyof MenuInfoValues;

interface MenuInfoFormProps {
  menu: Menu;
  /** Shown read-only and never sent, e.g. the slug of a system menu. */
  lockedFields?: MenuInfoField[];
  onSave: (values: Partial<MenuInfoValues>) => void;
  isSaving: boolean;
}

function initialValues(menu: Menu): MenuInfoValues {
  return { name: menu.name, slug: menu.slug, description: menu.description ?? '', isPublic: menu.isPublic };
}

function withoutFields(values: MenuInfoValues, fields: MenuInfoField[]): Partial<MenuInfoValues> {
  return Object.fromEntries(Object.entries(values).filter(([field]) => !fields.includes(field as MenuInfoField)));
}

/**
 * Name, slug, description and publication of a menu: free text, so saved with
 * a button, unlike the composition of the menu.
 */
export default function MenuInfoForm({ menu, lockedFields = [], onSave, isSaving }: MenuInfoFormProps) {
  const { t } = useTranslation();
  // Kept apart from the menu: a refetch after a composition change must not erase a draft.
  const [values, setValues] = useState(() => initialValues(menu));
  const isLocked = (field: MenuInfoField) => lockedFields.includes(field);

  const setField = <K extends MenuInfoField>(field: K, value: MenuInfoValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(withoutFields(values, lockedFields));
  };

  return (
    <Card as="section" className="mb-6">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('menus.name')} required>
            <Input value={values.name} onChange={(event) => setField('name', event.target.value)} />
          </Field>
          <Field label={t('menus.slug')} hint={isLocked('slug') ? t('menus.slugLocked') : undefined}>
            <Input
              value={values.slug}
              onChange={(event) => setField('slug', toSlug(event.target.value))}
              readOnly={isLocked('slug')}
              required={!isLocked('slug')}
            />
          </Field>
        </div>
        <Field label={t('menus.description')}>
          <Textarea
            value={values.description}
            onChange={(event) => setField('description', event.target.value)}
            rows={2}
            className="resize-none"
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ToggleSwitch checked={values.isPublic} onChange={(isPublic) => setField('isPublic', isPublic)} label={t('menus.isPublic')} />
            {menu.isPublic && (
              <a href={`/menu/${menu.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-info hover:underline">
                {`/menu/${menu.slug}`}
              </a>
            )}
          </div>
          <Button type="submit" loading={isSaving}>{t('common.save')}</Button>
        </div>
      </form>
    </Card>
  );
}
