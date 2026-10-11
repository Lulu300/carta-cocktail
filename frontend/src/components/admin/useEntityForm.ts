import { useState } from 'react';

export interface EntityForm<T, F> {
  isOpen: boolean;
  /** The entity being edited, or null when creating one. */
  editing: T | null;
  form: F;
  setField: <K extends keyof F>(key: K, value: F[K]) => void;
  /** Opens the form on an entity to edit, or empty to create one. */
  open: (item?: T) => void;
  close: () => void;
}

/**
 * State of a create/edit modal. Every `open()` rebuilds the whole form from
 * `toForm`, so nothing typed for one entity carries over to the next. State
 * kept inside the form controls (such as an expanded translations block) is
 * reset too, as long as they are rendered only while the form is open, e.g.
 * inside a `Modal`.
 */
export function useEntityForm<T, F>(toForm: (item?: T) => F): EntityForm<T, F> {
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<F>(() => toForm());

  const setField = <K extends keyof F>(key: K, value: F[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const open = (item?: T) => {
    setEditing(item ?? null);
    setForm(toForm(item));
    setIsOpen(true);
  };

  const close = () => setIsOpen(false);

  return { isOpen, editing, form, setField, open, close };
}
