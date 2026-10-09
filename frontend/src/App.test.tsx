import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom';
import App from './App';

const mockUseAuth = vi.fn();

vi.mock('./contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Shows where ProtectedRoute asked to come back to, instead of the real form
vi.mock('./pages/auth/LoginPage', () => ({
  default: function LoginPageStub() {
    const location = useLocation();
    const from = (location.state as { from?: { pathname: string } } | null)?.from;
    return <div data-testid="login-page">{from?.pathname ?? 'no-from'}</div>;
  },
}));

vi.mock('./components/layout/AdminLayout', () => ({
  default: () => (
    <div data-testid="admin-layout">
      <Outlet />
    </div>
  ),
}));

// These tests only cover routing: stub the other pages so they are not loaded.
vi.mock('./components/layout/PublicLayout', () => ({ default: () => <Outlet /> }));
vi.mock('./pages/admin/DashboardPage', () => ({ default: () => <h1>dashboard.title</h1> }));
vi.mock('./pages/admin/CategoriesPage', () => ({ default: () => null }));
vi.mock('./pages/admin/BottlesPage', () => ({ default: () => null }));
vi.mock('./pages/admin/IngredientsPage', () => ({ default: () => null }));
vi.mock('./pages/admin/UnitsPage', () => ({ default: () => null }));
vi.mock('./pages/admin/CocktailsPage', () => ({ default: () => null }));
vi.mock('./pages/admin/CocktailFormPage', () => ({ default: () => null }));
vi.mock('./pages/admin/MenusPage', () => ({ default: () => null }));
vi.mock('./pages/admin/MenuEditPage', () => ({ default: () => null }));
vi.mock('./pages/admin/MenuBottleEditPage', () => ({ default: () => null }));
vi.mock('./pages/admin/ShortagesPage', () => ({ default: () => null }));
vi.mock('./pages/admin/SettingsPage', () => ({ default: () => null }));
vi.mock('./pages/public/HomePage', () => ({ default: () => <div data-testid="home-page" /> }));
vi.mock('./pages/public/MenuPublicPage', () => ({ default: () => null }));
vi.mock('./pages/public/CocktailPublicPage', () => ({ default: () => null }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProtectedRoute', () => {
  it('redirects to /login and remembers the requested page when signed out', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });

    renderAt('/admin/bottles');

    expect(await screen.findByTestId('login-page')).toHaveTextContent('/admin/bottles');
    expect(screen.queryByTestId('admin-layout')).not.toBeInTheDocument();
  });

  it('renders the admin layout when signed in', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 1, email: 'admin@test.local' }, isLoading: false });

    renderAt('/admin/bottles');

    expect(await screen.findByTestId('admin-layout')).toBeInTheDocument();
  });

  it('shows the loading screen while the session check runs', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });

    renderAt('/admin/bottles');

    expect(await screen.findByText('common.loading')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-layout')).not.toBeInTheDocument();
  });
});

describe('route code splitting', () => {
  it('loads a lazy admin page through the Suspense boundary', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 1, email: 'admin@test.local' }, isLoading: false });

    renderAt('/admin');

    // The fallback shows first, then the dashboard chunk resolves
    expect(screen.getByText('common.loading')).toBeInTheDocument();
    expect(await screen.findByText('dashboard.title')).toBeInTheDocument();
    expect(screen.queryByText('common.loading')).not.toBeInTheDocument();
  });

  it('renders the public home page without waiting for any chunk', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });

    renderAt('/');

    // Synchronous query: the public pages are in the entry chunk, nothing suspends
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByText('common.loading')).not.toBeInTheDocument();
  });
});
