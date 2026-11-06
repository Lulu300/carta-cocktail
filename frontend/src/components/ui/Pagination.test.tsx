import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../../test/test-utils';
import Pagination from './Pagination';

vi.mock('react-i18next', async () => {
  const { translateWithValues } = await import('../../test/translateWithValues');
  return { useTranslation: () => ({ t: translateWithValues, i18n: { language: 'en' } }) };
});

function renderPagination(page: number, totalPages = 10, handlers = { onPageChange: vi.fn(), onPageSizeChange: vi.fn() }) {
  render(
    <Pagination
      page={page}
      totalPages={totalPages}
      pageSize={10}
      totalItems={totalPages * 10}
      onPageChange={handlers.onPageChange}
      onPageSizeChange={handlers.onPageSizeChange}
    />,
  );
  return handlers;
}

describe('Pagination', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(
      <Pagination page={1} totalPages={0} pageSize={10} totalItems={0} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('puts the page buttons in a named navigation landmark', () => {
    renderPagination(5);
    const nav = screen.getByRole('navigation', { name: 'pagination.label' });

    for (const name of ['pagination.first', 'pagination.previous', 'pagination.next', 'pagination.last']) {
      expect(within(nav).getByRole('button', { name })).toBeEnabled();
    }
    expect(within(nav).getByRole('button', { name: 'pagination.goToPage(4)' })).toBeInTheDocument();
  });

  it('marks the current page', () => {
    renderPagination(5);
    expect(screen.getByRole('button', { name: 'pagination.goToPage(5)' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'pagination.goToPage(4)' })).not.toHaveAttribute('aria-current');
  });

  it('disables the first and previous buttons on the first page', () => {
    renderPagination(1);
    expect(screen.getByRole('button', { name: 'pagination.first' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'pagination.previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'pagination.next' })).toBeEnabled();
  });

  it('disables the next and last buttons on the last page', () => {
    renderPagination(10);
    expect(screen.getByRole('button', { name: 'pagination.next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'pagination.last' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'pagination.previous' })).toBeEnabled();
  });

  it('goes to the requested page', async () => {
    const user = userEvent.setup();
    const { onPageChange } = renderPagination(5);

    await user.click(screen.getByRole('button', { name: 'pagination.first' }));
    await user.click(screen.getByRole('button', { name: 'pagination.previous' }));
    await user.click(screen.getByRole('button', { name: 'pagination.next' }));
    await user.click(screen.getByRole('button', { name: 'pagination.last' }));
    await user.click(screen.getByRole('button', { name: 'pagination.goToPage(6)' }));

    expect(onPageChange.mock.calls).toEqual([[1], [4], [6], [10], [6]]);
  });

  it('hides the ellipses from screen readers', () => {
    renderPagination(5);
    for (const ellipsis of screen.getAllByText('...')) expect(ellipsis).toHaveAttribute('aria-hidden', 'true');
  });

  it('changes the page size with a labelled select', async () => {
    const user = userEvent.setup();
    const { onPageSizeChange } = renderPagination(1);

    await user.selectOptions(screen.getByRole('combobox', { name: 'pagination.pageSize' }), '25');

    expect(onPageSizeChange).toHaveBeenCalledWith(25);
  });

  it('shows no navigation for a single page', () => {
    renderPagination(1, 1);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
