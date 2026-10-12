import { useState } from 'react';

export interface Selection<T> {
  selected: Set<T>;
  isSelected: (id: T) => boolean;
  toggle: (id: T) => void;
  /** Selects, or unselects, every given id and leaves the others as they are. */
  setAll: (ids: T[], isSelected?: boolean) => void;
  clear: () => void;
}

/** A set of selected ids, e.g. the cocktails picked for a batch export. */
export function useSelection<T>(): Selection<T> {
  const [selected, setSelected] = useState<Set<T>>(() => new Set());

  const toggle = (id: T) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAll = (ids: T[], isSelected = true) => {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (isSelected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  return {
    selected,
    isSelected: (id) => selected.has(id),
    toggle,
    setAll,
    clear: () => setSelected(new Set()),
  };
}
