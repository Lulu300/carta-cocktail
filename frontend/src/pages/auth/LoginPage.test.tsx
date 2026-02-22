import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import LoginPage from './LoginPage';

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

describe('LoginPage', () => {
  it('should render login form', () => {
    render(<LoginPage />);
    expect(screen.getByText('auth.login')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('admin@carta.local')).toBeInTheDocument();
  });

  it('should submit form and navigate on success', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('admin@carta.local'), 'admin@test.local');
    await user.type(screen.getByRole('textbox', { hidden: true }).closest('form')!.querySelector('input[type="password"]')!, 'password123');
    await user.click(screen.getByRole('button', { name: 'auth.loginButton' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin@test.local', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/admin');
    });
  });

  it('should display error on failed login', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Bad credentials'));
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('admin@carta.local'), 'wrong@test.local');
    await user.type(screen.getByPlaceholderText('admin@carta.local').closest('form')!.querySelector('input[type="password"]')!, 'wrong');
    await user.click(screen.getByRole('button', { name: 'auth.loginButton' }));

    await waitFor(() => {
      expect(screen.getByText('auth.loginError')).toBeInTheDocument();
    });
  });

  it('should show loading state during submission', async () => {
    let resolveLogin: () => void;
    mockLogin.mockImplementation(() => new Promise<void>((resolve) => { resolveLogin = resolve; }));
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('admin@carta.local'), 'admin@test.local');
    await user.type(screen.getByPlaceholderText('admin@carta.local').closest('form')!.querySelector('input[type="password"]')!, 'pass');
    await user.click(screen.getByRole('button', { name: 'auth.loginButton' }));

    expect(screen.getByRole('button')).toHaveTextContent('common.loading');

    resolveLogin!();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
  });
});
