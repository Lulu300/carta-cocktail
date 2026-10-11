import { useState } from 'react';

export interface EntityForm<T, F> {
  isOpen: boolean;
  /** The entity being edited, or null when creating one. */
  editing: T | null;
  form: F;
  /**
   * Changes on every `open()`. Give it as `key` to a form that stays mounted
   * between two openings, so that the state of its controls is reset too.
   */
  formKey: number;
  setField: <K extends keyof F>(key: K, value: F[K]) => void;
  /** Opens the form on an entity to edit, or empty to create one. */
  open: (item?: T) => void;
  close: () => void;
}

/**
 * State of a create/edit form. Every `open()` rebuilds the whole form from
 * `toForm`, so nothing typed for one entity carries over to the next. State
 * kept inside the form controls (such as an expanded translations block) is
 * reset too: a `Modal` remounts its content on each opening, and a form that
 * stays mounted uses `formKey`.
 */
export function useEntityForm<T, F>(toForm: (item?: T) => F): EntityForm<T, F> {
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<F>(() => toForm());
  const [formKey, setFormKey] = useState(0);

  const setField = <K extends keyof F>(key: K, value: F[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const open = (item?: T) => {
    setEditing(item ?? null);
    setForm(toForm(item));
    setFormKey((key) => key + 1);
    setIsOpen(true);
  };

  const close = () => setIsOpen(false);

  return { isOpen, editing, form, formKey, setField, open, close };
}
