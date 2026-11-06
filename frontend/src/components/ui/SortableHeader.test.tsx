import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/test-utils';
import SortableHeader from './SortableHeader';

function renderHeader(currentSortKey: string | null, sortDirection: 'asc' | 'desc' = 'asc', onSort = vi.fn()) {
  render(
    <table>
      <thead>
        <tr>
          <SortableHeader
            label="Name"
            sortKey="name"
            currentSortKey={currentSortKey}
            sortDirection={sortDirection}
            onSort={onSort}
          />
        </tr>
      </thead>
    </table>,
  );
  return onSort;
}

describe('SortableHeader', () => {
  it('sorts from the keyboard with a real button', async () => {
    const user = userEvent.setup();
    const onSort = renderHeader(null);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Name' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onSort).toHaveBeenCalledWith('name');
  });

  it('tells the sort order of the active column only', () => {
    renderHeader('name', 'desc');
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending');
  });

  it('says ascending for an ascending sort', () => {
    renderHeader('name', 'asc');
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending');
  });

  it('leaves aria-sort out on an inactive column', () => {
    renderHeader('other');
    expect(screen.getByRole('columnheader')).not.toHaveAttribute('aria-sort');
  });
});
