import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/test-utils';
import MenuBottleEditPage from './MenuBottleEditPage';
import type { Bottle, Menu, MenuBottle } from '../../types';

vi.mock('../../services/api', () => ({
  menus: { get: vi.fn(), update: vi.fn() },
  menuBottles: { sync: vi.fn(), update: vi.fn() },
  menuSections: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

import { menus as menusApi, menuBottles as menuBottlesApi } from '../../services/api';

function makeBottle(id: number, name: string): Bottle {
  return {
    id,
    name,
    categoryId: 1,
    category: { id: 1, name: 'Gin', type: 'SPIRIT', desiredStock: 1, minimumPercent: 0, createdAt: '2026-01-01' },
    purchasePrice: null,
    capacityMl: 700,
    remainingPercent: 100,
    openedAt: null,
    alcoholPercentage: null,
    location: null,
    isApero: true,
    isDigestif: false,
    createdAt: '2026-01-01',
  };
}

function makeMenuBottle(id: number, bottle: Bottle): MenuBottle {
  return { id, menuId: 5, bottleId: bottle.id, bottle, menuSectionId: null, position: id, isHidden: false };
}

function makeMenu(bottles: MenuBottle[]): Menu {
  return {
    id: 5,
    name: 'Apéritifs',
    description: 'Before dinner',
    slug: 'aperitifs',
    type: 'APEROS',
    isPublic: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    sections: [],
    bottles,
  };
}

function renderPage() {
  window.history.pushState({}, '', '/admin/menus/5/bottles');
  return render(
    <Routes>
      <Route path="/admin/menus/:id/bottles" element={<MenuBottleEditPage />} />
    </Routes>,
  );
}

describe('MenuBottleEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the menu from the route id and groups identical bottles', async () => {
    const gin = makeBottle(1, 'Hendricks');
    const sameGin = makeBottle(2, 'Hendricks');
    vi.mocked(menusApi.get).mockResolvedValue(
      makeMenu([makeMenuBottle(10, gin), makeMenuBottle(11, sameGin)]),
    );

    renderPage();

    expect(await screen.findByText('Hendricks')).toBeInTheDocument();
    expect(menusApi.get).toHaveBeenCalledWith(5);
    expect(screen.getByDisplayValue('Apéritifs')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Before dinner')).toBeInTheDocument();
    expect(screen.getByText('x2')).toBeInTheDocument();
  });

  it('reloads the menu after a sync', async () => {
    const user = userEvent.setup();
    vi.mocked(menusApi.get)
      .mockResolvedValueOnce(makeMenu([]))
      .mockResolvedValueOnce(makeMenu([makeMenuBottle(10, makeBottle(1, 'Lillet'))]));
    vi.mocked(menuBottlesApi.sync).mockResolvedValue({ message: 'ok', added: 1, removed: 0 });

    renderPage();
    await user.click(await screen.findByText('🔄 Synchroniser'));

    expect(await screen.findByText('Lillet')).toBeInTheDocument();
    expect(menuBottlesApi.sync).toHaveBeenCalledWith(5);
    expect(menusApi.get).toHaveBeenCalledTimes(2);
  });
});
