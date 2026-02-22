import { describe, it, expect } from 'vitest';
import type { Unit } from '../types';
import {
  isConvertible, toMilliliters, fromMilliliters, convertUnit,
  formatQuantity, getAllConversions,
} from './unitConverter';

const mlUnit: Unit = { id: 1, name: 'Millilitre', abbreviation: 'ml', conversionFactorToMl: 1 };
const clUnit: Unit = { id: 2, name: 'Centilitre', abbreviation: 'cl', conversionFactorToMl: 10 };
const ozUnit: Unit = { id: 3, name: 'Ounce', abbreviation: 'oz', conversionFactorToMl: 29.5735 };
const pieceUnit: Unit = { id: 4, name: 'Piece', abbreviation: 'pce', conversionFactorToMl: null };
const dashUnit: Unit = { id: 5, name: 'Dash', abbreviation: 'dash', conversionFactorToMl: 0.6 };

describe('isConvertible', () => {
  it('should return true for unit with conversionFactorToMl', () => {
    expect(isConvertible(clUnit)).toBe(true);
  });

  it('should return false for unit with null conversionFactorToMl', () => {
    expect(isConvertible(pieceUnit)).toBe(false);
  });

  it('should return false for undefined unit', () => {
    expect(isConvertible(undefined)).toBe(false);
  });
});

describe('toMilliliters', () => {
  it('should convert cl to ml', () => {
    expect(toMilliliters(5, clUnit)).toBe(50);
  });

  it('should convert oz to ml', () => {
    expect(toMilliliters(1, ozUnit)).toBeCloseTo(29.5735);
  });

  it('should return quantity for non-convertible unit', () => {
    expect(toMilliliters(3, pieceUnit)).toBe(3);
  });
});

describe('fromMilliliters', () => {
  it('should convert ml to cl', () => {
    expect(fromMilliliters(50, clUnit)).toBe(5);
  });

  it('should convert ml to oz', () => {
    expect(fromMilliliters(29.5735, ozUnit)).toBeCloseTo(1);
  });

  it('should return ml value for non-convertible unit', () => {
    expect(fromMilliliters(100, pieceUnit)).toBe(100);
  });
});

describe('convertUnit', () => {
  it('should convert cl to oz', () => {
    const result = convertUnit(5, clUnit, ozUnit);
    // 5cl = 50ml, 50/29.5735 ≈ 1.69
    expect(result).toBeCloseTo(1.6907, 3);
  });

  it('should convert oz to cl', () => {
    const result = convertUnit(1, ozUnit, clUnit);
    // 1oz = 29.5735ml, 29.5735/10 = 2.95735
    expect(result).toBeCloseTo(2.95735);
  });
});

describe('formatQuantity', () => {
  it('should format ml integer without decimals', () => {
    expect(formatQuantity(50, mlUnit)).toBe('50');
  });

  it('should format ml with 1 decimal when needed', () => {
    expect(formatQuantity(50.5, mlUnit)).toBe('50.5');
  });

  it('should format cl with trimmed decimals', () => {
    expect(formatQuantity(5, clUnit)).toBe('5');
  });

  it('should format dash with 1 decimal', () => {
    expect(formatQuantity(3.5, dashUnit)).toBe('3.5');
  });

  it('should format oz with trimmed decimals', () => {
    expect(formatQuantity(1.5, ozUnit)).toBe('1.5');
  });
});

describe('getAllConversions', () => {
  it('should return empty array for non-convertible unit', () => {
    expect(getAllConversions(1, pieceUnit, [mlUnit, clUnit])).toEqual([]);
  });

  it('should return conversions for all other convertible units', () => {
    const result = getAllConversions(5, clUnit, [mlUnit, clUnit, ozUnit, pieceUnit]);
    // Should include ml and oz, but not cl (same) and not pce (non-convertible)
    expect(result).toHaveLength(2);
    expect(result.find(r => r.unit.id === mlUnit.id)?.quantity).toBe(50);
  });

  it('should not include the source unit', () => {
    const result = getAllConversions(5, clUnit, [mlUnit, clUnit]);
    expect(result.every(r => r.unit.id !== clUnit.id)).toBe(true);
  });
});
