import { useEffect, useId, useState, type KeyboardEvent, type MouseEvent } from 'react';

interface ComboboxKeyboardOptions<T> {
  /** Suggestions currently listed, in display order. */
  options: T[];
  /** Text typed in the input: the highlight goes back to the input when it changes. */
  query: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (option: T) => void;
}

/**
 * Keyboard behaviour of an editable combobox with a list of suggestions (WAI-ARIA
 * APG pattern): focus stays in the input, the arrow keys move a highlight through
 * the options (`aria-activedescendant`), Enter picks the highlighted one, Escape
 * and leaving the input close the list.
 */
export function useComboboxKeyboard<T>({
  options, query, isOpen, onOpen, onClose, onSelect,
}: ComboboxKeyboardOptions<T>) {
  const listboxId = useId();
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [highlightedQuery, setHighlightedQuery] = useState(query);

  // New text means new suggestions: the old highlight would point at another option.
  if (query !== highlightedQuery) {
    setHighlightedQuery(query);
    setHighlightedIndex(-1);
  }

  const activeIndex = isOpen && highlightedIndex < options.length ? highlightedIndex : -1;
  const getOptionId = (index: number) => `${listboxId}-option-${index}`;
  const activeOptionId = activeIndex >= 0 ? getOptionId(activeIndex) : undefined;

  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeOptionId]);

  const moveHighlight = (step: 1 | -1) => {
    if (options.length === 0) return;
    if (!isOpen) {
      onOpen();
      setHighlightedIndex(step === 1 ? 0 : options.length - 1);
      return;
    }
    const start = activeIndex === -1 && step === -1 ? options.length : activeIndex;
    setHighlightedIndex((start + step + options.length) % options.length);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      onSelect(options[activeIndex]);
    } else if (event.key === 'Escape' && isOpen) {
      // Only the list closes: an enclosing modal stays open.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return {
    activeIndex,
    getOptionId,
    inputProps: {
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': isOpen,
      'aria-controls': listboxId,
      'aria-activedescendant': activeOptionId,
      onKeyDown: handleKeyDown,
      onBlur: onClose,
    } as const,
    listboxProps: {
      id: listboxId,
      role: 'listbox',
      // Keeps the focus in the input, so its blur does not close the list before the click lands.
      onMouseDown: (event: MouseEvent) => event.preventDefault(),
    } as const,
  };
}
