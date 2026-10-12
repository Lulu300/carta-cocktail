import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import { render as renderWithoutRouter } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test/axe';
import LoginPage from './LoginPage';
import { ApiError } from '../../services/api';

const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../components/ui/LanguageSelector', () => ({
  default: () => <div data-testid="language-selector" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/** Renders the login page as if ProtectedRoute redirected there from `from`. */
function renderRedirectedFrom(from: { pathname: string; search?: string; hash?: string }) {
  return renderWithoutRouter(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: { from } }]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

async function submitValidCredentials() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('auth.email'), 'admin@test.local');
  await user.type(screen.getByLabelText('auth.password'), 'password123');
  await user.click(screen.getByRole('button', { name: 'auth.loginButton' }));
}

describe('LoginPage', () => {
  it('should render login form', () => {
    render(<LoginPage />);
    expect(screen.getByText('auth.login')).toBeInTheDocument();
    expect(screen.getByLabelText('auth.email')).toHaveAttribute('placeholder', 'admin@carta.local');
    expect(screen.getByLabelText('auth.password')).toHaveAttribute('type', 'password');
  });

  it('should submit form and navigate on success', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText('auth.email'), 'admin@test.local');
    await user.type(screen.getByLabelText('auth.password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'auth.loginButton' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin@test.local', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true });
    });
  });

  it('should return to the requested admin page after login', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderRedirectedFrom({ pathname: '/admin/bottles', search: '?type=SPIRIT', hash: '' });

    await submitValidCredentials();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/bottles?type=SPIRIT', { replace: true });
    });
  });

  it.each([
    ['an external URL', 'https://evil.example/admin'],
    ['a public page', '/menu/x'],
    ['a look-alike admin path', '/administrator'],
  ])('should ignore %s as redirect target', async (_label, pathname) => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderRedirectedFrom({ pathname });

    await submitValidCredentials();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true });
    });
  });

  it.each([
    ['wrong credentials (401)', new ApiError(401, 'Invalid credentials'), 'auth.loginError'],
    ['the attempt limit (429)', new ApiError(429, 'Too many failed login attempts'), 'Too many failed login attempts'],
    ['a server error (500)', new ApiError(500, 'Internal server error'), 'Internal server error'],
    ['a network error', new TypeError('Failed to fetch'), 'common.error'],
    ['an API error without message', new ApiError(502, ''), 'common.error'],
  ])('should explain %s', async (_label, error, expectedMessage) => {
    mockLogin.mockRejectedValueOnce(error);
    render(<LoginPage />);

    await submitValidCredentials();

    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
  });

  it('should show loading state during submission', async () => {
    let resolveLogin: () => void;
    mockLogin.mockImplementation(() => new Promise<void>((resolve) => { resolveLogin = resolve; }));
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText('auth.email'), 'admin@test.local');
    await user.type(screen.getByLabelText('auth.password'), 'pass');
    await user.click(screen.getByRole('button', { name: 'auth.loginButton' }));

    expect(screen.getByRole('button')).toHaveTextContent('common.loading');

    resolveLogin!();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
  });
});

describe('LoginPage accessibility', () => {
  it('has no serious accessibility violation, error shown', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Network down'));
    const { container } = render(<LoginPage />);
    await submitValidCredentials();
    await screen.findByRole('alert');

    expect(await axe(container)).toHaveNoViolations();
  });
});
