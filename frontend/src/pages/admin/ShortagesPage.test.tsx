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
    category: { id: 1, name: 'Vodka', type: 'SPIRIT', categoryType: { name: 'SPIRIT', color: 'blue' }, desiredStock: 3, minimumPercent: 30 },
    totalPercent: 100,
    requiredPercent: 230,
    totalUsable: 1,
    isShortage: true,
  },
  {
    category: { id: 2, name: 'Gin', type: 'SPIRIT', categoryType: { name: 'SPIRIT', color: 'blue' }, desiredStock: 1, minimumPercent: 30 },
    totalPercent: 20,
    requiredPercent: 30,
    totalUsable: 1,
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

  it('should show current stock and required threshold', async () => {
    render(<ShortagesPage />);
    await waitFor(() => {
      const currentLabels = screen.getAllByText('shortages.currentStock');
      expect(currentLabels.length).toBe(2);
      const requiredLabels = screen.getAllByText('shortages.required');
      expect(requiredLabels.length).toBe(2);
    });
  });

  it('should show deficit values', async () => {
    render(<ShortagesPage />);
    await waitFor(() => {
      // Vodka: 230 - 100 = 130%, Gin: 30 - 20 = 10%
      expect(screen.getByText('-130%')).toBeInTheDocument();
      expect(screen.getByText('-10%')).toBeInTheDocument();
    });
  });

  it('should show threshold info', async () => {
    render(<ShortagesPage />);
    await waitFor(() => {
      const thresholdLabels = screen.getAllByText('shortages.threshold');
      expect(thresholdLabels.length).toBe(2);
      const thresholdValues = screen.getAllByText('30%');
      expect(thresholdValues.length).toBeGreaterThanOrEqual(2);
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
