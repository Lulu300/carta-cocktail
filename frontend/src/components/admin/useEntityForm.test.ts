import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEntityForm } from './useEntityForm';

interface Unit {
  id: number;
  name: string;
}

const toForm = (unit?: Unit) => ({ name: unit?.name ?? '', abbreviation: '' });

describe('useEntityForm', () => {
  it('starts closed with an empty form', () => {
    const { result } = renderHook(() => useEntityForm(toForm));

    expect(result.current.isOpen).toBe(false);
    expect(result.current.editing).toBeNull();
    expect(result.current.form).toEqual({ name: '', abbreviation: '' });
  });

  it('opens on an entity to edit, with the form built from it', () => {
    const { result } = renderHook(() => useEntityForm(toForm));

    act(() => result.current.open({ id: 1, name: 'Centiliter' }));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.editing).toEqual({ id: 1, name: 'Centiliter' });
    expect(result.current.form.name).toBe('Centiliter');
  });

  it('changes one field and keeps the others', () => {
    const { result } = renderHook(() => useEntityForm(toForm));

    act(() => result.current.open({ id: 1, name: 'Centiliter' }));
    act(() => result.current.setField('abbreviation', 'cl'));

    expect(result.current.form).toEqual({ name: 'Centiliter', abbreviation: 'cl' });
  });

  it('resets the form when opened again to create, after an edit', () => {
    const { result } = renderHook(() => useEntityForm(toForm));

    act(() => result.current.open({ id: 1, name: 'Centiliter' }));
    act(() => result.current.setField('abbreviation', 'cl'));
    act(() => result.current.close());
    act(() => result.current.open());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.editing).toBeNull();
    expect(result.current.form).toEqual({ name: '', abbreviation: '' });
  });
});
