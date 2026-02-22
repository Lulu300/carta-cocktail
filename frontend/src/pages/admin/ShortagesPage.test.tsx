import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import ShortagesPage from './ShortagesPage';

vi.mock('../../services/api', () => ({
  shortages: { list: vi.fn() },
}));

vi.mock('../../hooks/useLocalizedName', () => ({
  useLocalizedName: () => (entity: { name: string }) => entity.name,
}));

vi.mock('../../utils/colors', () => ({
  getBadgeClasses: () => 'bg-gray-500/20 text-gray-400',
}));

import { shortages as api } from '../../services/api';
const mockList = vi.mocked(api.list);

const mockShortages = [
  {
    category: { id: 1, name: 'Vodka', type: 'SPIRIT', categoryType: { name: 'SPIRIT', color: 'blue' }, desiredStock: 3 },
    sealedCount: 1,
    totalUsable: 2,
    deficit: 2,
    isShortage: true,
  },
  {
    category: { id: 2, name: 'Gin', type: 'SPIRIT', categoryType: { name: 'SPIRIT', color: 'blue' }, desiredStock: 2 },
    sealedCount: 0,
    totalUsable: 1,
    deficit: 2,
    isShortage: true,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue(mockShortages as never);
});

describe('ShortagesPage', () => {
  it('should render title', async () => {
    render(<ShortagesPage />);
    expect(screen.getByText('shortages.title')).toBeInTheDocument();
  });

  it('should display shortage cards after loading', async () => {
    render(<ShortagesPage />);
    await waitFor(() => {
      expect(screen.getByText('Vodka')).toBeInTheDocument();
      expect(screen.getByText('Gin')).toBeInTheDocument();
    });
  });

  it('should show deficit values', async () => {
    render(<ShortagesPage />);
    await waitFor(() => {
      // Both shortages have deficit=2, so there are two "-2" spans
      const deficits = screen.getAllByText('-2');
      expect(deficits.length).toBe(2);
    });
  });

  it('should show sealed and desired counts', async () => {
    render(<ShortagesPage />);
    await waitFor(() => {
      // Check that shortage details are shown
      const sealedLabels = screen.getAllByText('shortages.sealed');
      expect(sealedLabels.length).toBe(2);
      const desiredLabels = screen.getAllByText('shortages.desired');
      expect(desiredLabels.length).toBe(2);
    });
  });

  it('should show no shortages message when empty', async () => {
    mockList.mockResolvedValue([] as never);
    render(<ShortagesPage />);
    await waitFor(() => {
      expect(screen.getByText('shortages.noShortages')).toBeInTheDocument();
    });
  });
});
