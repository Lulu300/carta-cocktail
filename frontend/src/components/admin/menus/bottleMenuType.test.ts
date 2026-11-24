import { describe, it, expect } from 'vitest';
import { isAvailableForMenu, isBottleMenu, menuEditorPath } from './bottleMenuType';

const apero = { isApero: true, isDigestif: false };
const digestif = { isApero: false, isDigestif: true };

describe('isBottleMenu', () => {
  it('recognises the aperitifs and digestifs types only', () => {
    expect(isBottleMenu({ type: 'APEROS' })).toBe(true);
    expect(isBottleMenu({ type: 'DIGESTIFS' })).toBe(true);
    expect(isBottleMenu({ type: 'COCKTAILS' })).toBe(false);
  });
});

describe('isAvailableForMenu', () => {
  it('follows the box of the menu type', () => {
    expect(isAvailableForMenu(apero, { type: 'APEROS' })).toBe(true);
    expect(isAvailableForMenu(apero, { type: 'DIGESTIFS' })).toBe(false);
    expect(isAvailableForMenu(digestif, { type: 'DIGESTIFS' })).toBe(true);
    expect(isAvailableForMenu(digestif, { type: 'APEROS' })).toBe(false);
  });

  it('keeps every bottle out of a cocktail menu', () => {
    expect(isAvailableForMenu({ isApero: true, isDigestif: true }, { type: 'COCKTAILS' })).toBe(false);
  });
});

describe('menuEditorPath', () => {
  it('opens the bottle editor for a bottle menu and the cocktail editor otherwise', () => {
    expect(menuEditorPath({ id: 3, type: 'APEROS' })).toBe('/admin/menus/3/bottles');
    expect(menuEditorPath({ id: 4, type: 'DIGESTIFS' })).toBe('/admin/menus/4/bottles');
    expect(menuEditorPath({ id: 5, type: 'COCKTAILS' })).toBe('/admin/menus/5');
  });
});
