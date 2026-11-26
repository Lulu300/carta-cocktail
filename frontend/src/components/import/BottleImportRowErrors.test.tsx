import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BottleImportRowError, BottleImportRowWarning } from '../../types';
import BottleImportRowErrors, { BottleImportRowWarnings } from './BottleImportRowErrors';

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
    expect(screen.getByText(/^bottles\.importWizard\.rowErrors\.code\.required \{"field":"capacityMl"/)).toBeInTheDocument();
  });

  it('names a misplaced quote', () => {
    render(<BottleImportRowErrors errors={[rowError({ field: 'name', code: 'malformedQuotes' })]} />);

    expect(screen.getByText(/^bottles\.importWizard\.rowErrors\.code\.malformedQuotes \{"field":"name"/)).toBeInTheDocument();
  });

  it('names a cell past the last named column by its number', () => {
    render(<BottleImportRowErrors errors={[rowError({ field: '', column: 13, code: 'malformedQuotes' })]} />);

    expect(screen.getByText(
      'bottles.importWizard.rowErrors.code.malformedQuotes {"field":"bottles.importWizard.rowErrors.column {\\"number\\":13}"',
      { exact: false },
    )).toBeInTheDocument();
  });

  it('falls back on a generic reason and the raw source when the backend sends unknown values', () => {
    render(<BottleImportRowErrors errors={[rowError({ source: 'menus', code: 'tooLong', field: 'name' })]} />);

    expect(screen.getByText(/rowErrors\.position .*"source":"menus"/)).toBeInTheDocument();
    expect(screen.getByText(/^bottles\.importWizard\.rowErrors\.code\.unknown \{"field":"name"/)).toBeInTheDocument();
  });

  it('names the date formats of the app language for an invalid date', () => {
    render(<BottleImportRowErrors errors={[rowError({ field: 'openedAt', code: 'invalidDate' })]} />);

    expect(screen.getByText(
      'bottles.importWizard.rowErrors.code.invalidDate '
      + '{"field":"openedAt","pattern":"dates.month/dates.day/dates.year","isoPattern":"dates.year-dates.month-dates.day"}',
    )).toBeInTheDocument();
  });

  it('renders nothing without errors', () => {
    const { container } = render(<BottleImportRowErrors errors={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('BottleImportRowWarnings', () => {
  it('names the source, the line and the field of each value on several lines, as a status', () => {
    render(<BottleImportRowWarnings warnings={[
      { source: 'bottles', line: 2, field: 'name', code: 'lineBreak' },
      { source: 'bottles', line: 2, field: 'location', code: 'lineBreak' },
      { source: 'categories', line: 3, field: 'name', code: 'lineBreak' },
    ]} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('bottles.importWizard.rowWarnings.title {"count":3}')).toBeInTheDocument();
    expect(screen.getByText('bottles.importWizard.rowWarnings.hint')).toBeInTheDocument();
    expect(screen.getAllByText(/rowErrors\.position .*"source":"bottles\.importWizard\.rowErrors\.source\.bottles","line":2/)).toHaveLength(2);
    expect(screen.getByText(/rowErrors\.position .*"source":"bottles\.importWizard\.rowErrors\.source\.categories","line":3/)).toBeInTheDocument();
    expect(screen.getByText('bottles.importWizard.rowWarnings.code.lineBreak {"field":"location"}')).toBeInTheDocument();
  });

  it('falls back on a generic reason for a code this version cannot name', () => {
    const warning = { source: 'bottles', line: 2, field: 'name', code: 'tooLong' } as unknown as BottleImportRowWarning;
    render(<BottleImportRowWarnings warnings={[warning]} />);

    expect(screen.getByText('bottles.importWizard.rowWarnings.code.unknown {"field":"name"}')).toBeInTheDocument();
  });

  it('renders nothing without warnings', () => {
    const { container } = render(<BottleImportRowWarnings warnings={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
