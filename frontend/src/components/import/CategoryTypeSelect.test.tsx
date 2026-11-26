import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { buildCategoryType } from '../../test/factories';
import type { CategoryType } from '../../types';
import CategoryTypeSelect from './CategoryTypeSelect';

// Data older than v1.9.0 can hold ' SPIRIT ' next to 'SPIRIT', and a type with an empty name.
const spacedSpirit = buildCategoryType({ name: ' SPIRIT ' });
const spirit = buildCategoryType({ name: 'SPIRIT' });
const unnamed = buildCategoryType({ name: '' });
const doubleSpaced = buildCategoryType({ name: 'X  Y' });
const SPACED_SPIRIT_LABEL = '␣SPIRIT␣ (with spaces)';

function renderOptions(value: string, categoryTypes: CategoryType[]) {
  render(
    <CategoryTypeSelect value={value} onChange={() => undefined} categoryTypes={categoryTypes} />,
  );
  return within(screen.getByRole('combobox'))
    .getAllByRole('option')
    .map((option) => option.textContent);
}

describe('CategoryTypeSelect', () => {
  it('tells the stored names apart, and labels the empty name', () => {
    expect(renderOptions('SPIRIT', [spacedSpirit, spirit, unnamed, doubleSpaced])).toEqual([
      SPACED_SPIRIT_LABEL,
      'SPIRIT',
      '(no name)',
      'X␣␣Y (with spaces)',
    ]);
    expect(screen.getByRole('option', { name: SPACED_SPIRIT_LABEL })).toBeInTheDocument();
  });

  it('adds the stored name to a translation that would hide it', () => {
    const nameTranslations = { en: 'Spirits' };
    expect(
      renderOptions('SPIRIT', [
        { ...spacedSpirit, nameTranslations },
        { ...spirit, nameTranslations },
      ]),
    ).toEqual([`Spirits – ${SPACED_SPIRIT_LABEL}`, 'Spirits']);
  });

  it("marks the file's own type when it is not in the list", () => {
    expect(renderOptions(' SPIRIT ', [spirit])).toEqual([SPACED_SPIRIT_LABEL, 'SPIRIT']);
    expect(screen.getByRole('combobox')).toHaveValue(' SPIRIT ');
  });
});
