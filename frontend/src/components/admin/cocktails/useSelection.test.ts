import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSelection } from './useSelection';

describe('useSelection', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useSelection<number>());
    expect(result.current.selected.size).toBe(0);
    expect(result.current.isSelected(1)).toBe(false);
  });

  it('toggles an id in and out', () => {
    const { result } = renderHook(() => useSelection<number>());
    act(() => result.current.toggle(1));
    expect(result.current.isSelected(1)).toBe(true);
    act(() => result.current.toggle(1));
    expect(result.current.isSelected(1)).toBe(false);
  });

  it('selects and unselects the given ids only, keeping the others', () => {
    const { result } = renderHook(() => useSelection<number>());
    act(() => result.current.toggle(9));
    act(() => result.current.setAll([1, 2]));
    expect([...result.current.selected].sort()).toEqual([1, 2, 9]);

    act(() => result.current.setAll([1, 2], false));
    expect([...result.current.selected]).toEqual([9]);
  });

  it('clears the selection', () => {
    const { result } = renderHook(() => useSelection<string>());
    act(() => result.current.setAll(['a', 'b']));
    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
  });
});
