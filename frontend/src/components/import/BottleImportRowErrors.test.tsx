import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BottleImportRowError } from '../../types';
import BottleImportRowErrors from './BottleImportRowErrors';

// Shows the interpolation values, so the test sees which source and field are named
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
    i18n: { language: 'en' },
  }),
}));

function rowError(overrides: Partial<Record<keyof BottleImportRowError, unknown>>): BottleImportRowError {
  return { source: 'bottles', line: 3, field: 'capacityMl', code: 'required', ...overrides } as BottleImportRowError;
}

describe('BottleImportRowErrors', () => {
  it('names the source, the line, the column and the reason', () => {
    render(<BottleImportRowErrors errors={[rowError({})]} />);

    expect(screen.getByText(/rowErrors\.position .*"source":"bottles\.importWizard\.rowErrors\.source\.bottles","line":3/)).toBeInTheDocument();
    expect(screen.getByText('bottles.importWizard.rowErrors.code.required {"field":"capacityMl"}')).toBeInTheDocument();
  });

  it('falls back on a generic reason and the raw source when the backend sends unknown values', () => {
    render(<BottleImportRowErrors errors={[rowError({ source: 'menus', code: 'tooLong', field: 'name' })]} />);

    expect(screen.getByText(/rowErrors\.position .*"source":"menus"/)).toBeInTheDocument();
    expect(screen.getByText('bottles.importWizard.rowErrors.code.unknown {"field":"name"}')).toBeInTheDocument();
  });

  it('renders nothing without errors', () => {
    const { container } = render(<BottleImportRowErrors errors={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
