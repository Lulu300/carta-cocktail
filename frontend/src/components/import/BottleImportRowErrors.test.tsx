import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BottleImportRowError, BottleImportRowWarning } from '../../types';
import BottleImportRowErrors, { BottleImportRowWarnings } from './BottleImportRowErrors';

function rowError(
  overrides: Partial<Record<keyof BottleImportRowError, unknown>>,
): BottleImportRowError {
  return {
    source: 'bottles',
    line: 3,
    field: 'capacityMl',
    code: 'required',
    ...overrides,
  } as BottleImportRowError;
}

describe('BottleImportRowErrors', () => {
  it('names the source, the line, the column and the reason', () => {
    render(<BottleImportRowErrors errors={[rowError({})]} />);

    expect(screen.getByText('Bottles, line 3:')).toBeInTheDocument();
    expect(screen.getByText('capacityMl is missing')).toBeInTheDocument();
  });

  it('names a misplaced quote', () => {
    render(
      <BottleImportRowErrors errors={[rowError({ field: 'name', code: 'malformedQuotes' })]} />,
    );

    expect(screen.getByText('name has a misplaced quotation mark')).toBeInTheDocument();
  });

  it('names a cell past the last named column by its number', () => {
    render(
      <BottleImportRowErrors
        errors={[rowError({ field: '', column: 13, code: 'malformedQuotes' })]}
      />,
    );

    expect(screen.getByText('column 13 has a misplaced quotation mark')).toBeInTheDocument();
  });

  it('falls back on a generic reason and the raw source when the backend sends unknown values', () => {
    render(
      <BottleImportRowErrors
        errors={[rowError({ source: 'menus', code: 'tooLong', field: 'name' })]}
      />,
    );

    expect(screen.getByText('menus, line 3:')).toBeInTheDocument();
    expect(screen.getByText('name is invalid')).toBeInTheDocument();
  });

  it('names the date formats of the app language for an invalid date', () => {
    render(
      <BottleImportRowErrors errors={[rowError({ field: 'openedAt', code: 'invalidDate' })]} />,
    );

    expect(
      screen.getByText('openedAt is not a valid date (expected mm/dd/yyyy or yyyy-mm-dd)'),
    ).toBeInTheDocument();
  });

  it('renders nothing without errors', () => {
    const { container } = render(<BottleImportRowErrors errors={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('BottleImportRowWarnings', () => {
  it('names the source, the line and the field of each value on several lines, as a status', () => {
    render(
      <BottleImportRowWarnings
        warnings={[
          { source: 'bottles', line: 2, field: 'name', code: 'lineBreak' },
          { source: 'bottles', line: 2, field: 'location', code: 'lineBreak' },
          { source: 'categories', line: 3, field: 'name', code: 'lineBreak' },
        ]}
      />,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('3 values to check, imported as they are')).toBeInTheDocument();
    expect(
      screen.getByText(
        'A misplaced quotation mark in the file can merge several lines into one value.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Bottles, line 2:')).toHaveLength(2);
    expect(screen.getByText('Categories, line 3:')).toBeInTheDocument();
    expect(screen.getByText('location spans several lines')).toBeInTheDocument();
  });

  it('falls back on a generic reason for a code this version cannot name', () => {
    const warning = {
      source: 'bottles',
      line: 2,
      field: 'name',
      code: 'tooLong',
    } as unknown as BottleImportRowWarning;
    render(<BottleImportRowWarnings warnings={[warning]} />);

    expect(screen.getByText('name to check')).toBeInTheDocument();
  });

  it('renders nothing without warnings', () => {
    const { container } = render(<BottleImportRowWarnings warnings={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
