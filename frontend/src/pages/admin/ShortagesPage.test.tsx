import { describe, it, expect } from 'vitest';
import { render, screen, within } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import { buildShortage } from '../../test/factories';
import { captureRequest, mockApiError, mockApiPending, mockApiResponse } from '../../test/msw/utils';
import ShortagesPage from './ShortagesPage';

const vodka = buildShortage({
  category: { id: 1, name: 'Vodka', desiredStock: 3, minimumPercent: 30 },
  totalPercent: 100,
  requiredPercent: 230,
});
const gin = buildShortage({
  category: {
    id: 2,
    name: 'Gin',
    nameTranslations: { en: 'Dry gin', fr: 'Gin sec' },
    categoryType: { name: 'LIQUEUR', nameTranslations: { en: 'Liqueur' }, color: 'purple' },
  },
  totalPercent: 20,
  requiredPercent: 30,
});

function mockShortages(items = [vodka, gin]) {
  mockApiResponse('get', '/api/shortages', items);
}

/** The card of a category, found by its heading. */
function getCard(name: string): HTMLElement {
  const card = screen.getByRole('heading', { name }).closest('div.rounded-xl');
  if (!(card instanceof HTMLElement)) throw new Error(`No card for ${name}`);
  return card;
}

describe('ShortagesPage', () => {
  it('shows a card per short category, with its localized name and type badge', async () => {
    mockShortages();
    render(<ShortagesPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'shortages.title' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Vodka' })).toBeInTheDocument();
    // English name of the category and of its type, with the badge color of the type
    expect(screen.getByRole('heading', { name: 'Dry gin' })).toBeInTheDocument();
    expect(within(getCard('Dry gin')).getByText('Liqueur')).toHaveClass('bg-purple-500/20');
    expect(within(getCard('Vodka')).getByText('SPIRIT')).toHaveClass('bg-blue-500/20');
  });

  it('shows the stock, the requirement, the deficit and the threshold of each category', async () => {
    mockShortages();
    render(<ShortagesPage />);

    await screen.findByRole('heading', { name: 'Vodka' });
    const vodkaCard = getCard('Vodka');
    expect(within(vodkaCard).getByText('100%')).toBeInTheDocument();
    expect(within(vodkaCard).getByText('230%')).toBeInTheDocument();
    // Deficit: 230 - 100
    expect(within(vodkaCard).getByText('-130%')).toBeInTheDocument();
    expect(within(vodkaCard).getByText('3')).toBeInTheDocument();
    expect(within(vodkaCard).getByText('30%')).toBeInTheDocument();

    expect(within(getCard('Dry gin')).getByText('-10%')).toBeInTheDocument();
  });

  it('shows a message when nothing is short', async () => {
    mockShortages([]);
    render(<ShortagesPage />);
    expect(await screen.findByText('shortages.noShortages')).toBeInTheDocument();
  });

  it('shows a loading message instead of "no shortages" while loading', () => {
    mockApiPending('get', '/api/shortages');
    render(<ShortagesPage />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
    expect(screen.queryByText('shortages.noShortages')).not.toBeInTheDocument();
  });

  it('shows an error with a retry button when loading fails', async () => {
    const user = userEvent.setup();
    mockApiError('get', '/api/shortages', 500, 'Database unavailable');
    render(<ShortagesPage />);

    expect(await screen.findByText('common.error')).toBeInTheDocument();
    expect(screen.queryByText('shortages.noShortages')).not.toBeInTheDocument();

    mockShortages();
    const retried = captureRequest('get', '/api/shortages');
    await user.click(screen.getByRole('button', { name: 'common.retry' }));

    expect(await screen.findByRole('heading', { name: 'Vodka' })).toBeInTheDocument();
    expect(retried.count()).toBe(1);
    expect(screen.queryByText('common.error')).not.toBeInTheDocument();
  });

  it('renders a full bar instead of NaN when the required percent is 0', async () => {
    mockShortages([{ ...vodka, totalPercent: 0, requiredPercent: 0 }]);
    render(<ShortagesPage />);
    await screen.findByRole('heading', { name: 'Vodka' });

    const bar = getCard('Vodka').querySelector('.bg-danger');
    expect(bar).toHaveStyle({ width: '100%' });
  });
});
