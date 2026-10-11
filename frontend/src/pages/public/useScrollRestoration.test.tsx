import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useScrollRestoration } from './useScrollRestoration';

// The page under test: `ready` stays false until "load" is clicked when
// `startsLoading` is set, like a menu that is not in the cache.
function Page({ startsLoading = false }: { startsLoading?: boolean }) {
  const [ready, setReady] = useState(!startsLoading);
  const navigate = useNavigate();
  useScrollRestoration(ready);

  return (
    <div>
      <button type="button" onClick={() => setReady(true)}>load</button>
      <button type="button" onClick={() => navigate('/other')}>forward</button>
      <button type="button" onClick={() => navigate(-1)}>back</button>
    </div>
  );
}

function renderPages({ menuStartsLoading = false } = {}) {
  return render(
    <MemoryRouter initialEntries={['/menu']}>
      <Routes>
        <Route path="/menu" element={<Page key="menu" startsLoading={menuStartsLoading} />} />
        <Route path="/other" element={<Page key="other" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function scrollPageTo(position: number) {
  Object.defineProperty(window, 'scrollY', { value: position, configurable: true, writable: true });
}

describe('useScrollRestoration', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sessionStorage.clear();
    scrollPageTo(0);
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a new page at the top', async () => {
    const user = userEvent.setup();
    renderPages();
    scrollPageTo(640);

    await user.click(screen.getByRole('button', { name: 'forward' }));

    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it('restores the position of the page when going back', async () => {
    const user = userEvent.setup();
    renderPages();
    scrollPageTo(640);
    await user.click(screen.getByRole('button', { name: 'forward' }));
    scrollPageTo(0);

    await user.click(screen.getByRole('button', { name: 'back' }));

    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });

  it('waits for the page content before restoring the position', async () => {
    const user = userEvent.setup();
    renderPages({ menuStartsLoading: true });
    await user.click(screen.getByRole('button', { name: 'load' }));
    scrollPageTo(640);
    await user.click(screen.getByRole('button', { name: 'forward' }));
    scrollTo.mockClear();

    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(scrollTo).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'load' }));
    expect(scrollTo).toHaveBeenCalledWith(0, 640);
  });

  it('leaves the position alone on a first visit without saved position', () => {
    renderPages();

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('keeps working when the session storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const user = userEvent.setup();
    renderPages();
    await user.click(screen.getByRole('button', { name: 'forward' }));
    scrollTo.mockClear();

    await user.click(screen.getByRole('button', { name: 'back' }));

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
