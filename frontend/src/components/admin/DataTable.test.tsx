import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, render, screen } from '../../test/test-utils';
import DataTable, { type Column } from './DataTable';

interface Row {
  id: number;
  name: string;
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', sortable: true, render: (row) => row.name },
  { key: 'actions', header: 'Actions', align: 'right', render: () => 'edit' },
];

const pagination = {
  page: 1,
  pageSize: 25,
  totalPages: 1,
  totalItems: 2,
  setPage: vi.fn(),
  setPageSize: vi.fn(),
};

function renderTable(props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  const sort = { sortKey: null, sortDirection: 'asc' as const, toggleSort: vi.fn() };
  const onRetry = vi.fn();
  render(
    <DataTable<Row>
      columns={columns}
      rows={[{ id: 1, name: 'Vodka' }, { id: 2, name: 'Rum' }]}
      getRowKey={(row) => row.id}
      sort={sort}
      pagination={pagination}
      isLoading={false}
      isError={false}
      onRetry={onRetry}
      emptyLabel="Nothing here"
      isFiltered={false}
      {...props}
    />,
  );
  return { sort, onRetry };
}

describe('DataTable', () => {
  it('renders a row per item and a cell per column', () => {
    renderTable();

    expect(screen.getByText('Vodka')).toBeInTheDocument();
    expect(screen.getByText('Rum')).toBeInTheDocument();
    expect(screen.getAllByText('edit')).toHaveLength(2);
    expect(screen.getByText('Actions')).toHaveClass('text-right');
  });

  it('shows skeleton rows and no empty label while loading', () => {
    renderTable({ rows: [], isLoading: true });

    expect(screen.getByRole('status')).toHaveTextContent('common.loading');
    expect(screen.queryByText('Nothing here')).not.toBeInTheDocument();
    expect(screen.queryByText('Vodka')).not.toBeInTheDocument();
  });

  it('shows the empty label once loaded without rows', () => {
    renderTable({ rows: [] });

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows an error with a retry button instead of the empty label when the load failed', async () => {
    const user = userEvent.setup();
    const { onRetry } = renderTable({ rows: [], isError: true });

    expect(screen.getByText('common.error')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('lets the caller render the rows, e.g. a row with sub-rows', () => {
    renderTable({
      renderRow: (row) => (
        <>
          <tr><td>{row.name}</td></tr>
          <tr><td>{`${row.name} detail`}</td></tr>
        </>
      ),
    });

    expect(screen.getByText('Vodka detail')).toBeInTheDocument();
    expect(screen.getByText('Rum detail')).toBeInTheDocument();
    expect(screen.queryByText('edit')).not.toBeInTheDocument();
  });

  it('sorts on the column key when its header is clicked', async () => {
    const user = userEvent.setup();
    const { sort } = renderTable();

    await user.click(screen.getByText('Name'));

    expect(sort.toggleSort).toHaveBeenCalledWith('name');
  });

  it('announces the number of items to screen readers while a filter is active', async () => {
    renderTable({ isFiltered: true });
    expect(await screen.findByText('common.resultCount')).toHaveAttribute('aria-live', 'polite');
  });

  describe('announces nothing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function liveRegion() {
      act(() => vi.advanceTimersByTime(1000));
      return document.querySelector('[aria-live="polite"]');
    }

    it('without an active filter: the whole list is no news', () => {
      renderTable();
      expect(liveRegion()).toBeEmptyDOMElement();
    });

    it('while loading or after a failed load', () => {
      renderTable({ isFiltered: true, isLoading: true });
      expect(liveRegion()).toBeEmptyDOMElement();
    });
  });
});
