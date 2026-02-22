import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLocalizedName } from './useLocalizedName';

describe('useLocalizedName', () => {
  it('should return a function', () => {
    const { result } = renderHook(() => useLocalizedName());
    expect(typeof result.current).toBe('function');
  });

  it('should return entity name when no translations', () => {
    const { result } = renderHook(() => useLocalizedName());
    expect(result.current({ name: 'Vodka' })).toBe('Vodka');
  });

  it('should use i18n.language for localization', () => {
    const { result } = renderHook(() => useLocalizedName());
    // Mock returns 'en' as language
    const entity = { name: 'Vodka', nameTranslations: { en: 'Vodka EN', fr: 'Vodka FR' } };
    expect(result.current(entity)).toBe('Vodka EN');
  });
});
