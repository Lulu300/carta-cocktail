import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
  default: () => <div data-testid="admin-layout" />,
}));

// These tests only cover routing: stub the other pages so they are not loaded.
vi.mock('./components/layout/PublicLayout', () => ({ default: () => null }));
vi.mock('./pages/admin/DashboardPage', () => ({ default: () => null }));
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
vi.mock('./pages/public/HomePage', () => ({ default: () => null }));
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
  it('redirects to /login and remembers the requested page when signed out', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });

    renderAt('/admin/bottles');

    expect(screen.getByTestId('login-page')).toHaveTextContent('/admin/bottles');
    expect(screen.queryByTestId('admin-layout')).not.toBeInTheDocument();
  });

  it('renders the admin layout when signed in', () => {
    mockUseAuth.mockReturnValue({ user: { id: 1, email: 'admin@test.local' }, isLoading: false });

    renderAt('/admin/bottles');

    expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
  });

  it('waits for the session check before deciding', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });

    renderAt('/admin/bottles');

    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-layout')).not.toBeInTheDocument();
  });
});
