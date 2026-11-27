import { useState } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../services/api';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import LanguageSelector from '../../components/ui/LanguageSelector';
import {
  isSignInAfterLogoutEverywhere,
  isSignInAfterRestore,
} from '../../utils/signInAfterRestore';
import Alert from '../../components/ui/Alert';
import UpdateAvailableBanner from '../../components/admin/UpdateAvailableBanner';

const ADMIN_HOME = '/admin';

function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_HOME || pathname.startsWith(`${ADMIN_HOME}/`);
}

/**
 * Page to open after sign-in: the admin page that sent the user here, if any.
 * Only admin paths are accepted so the redirect cannot leave the admin area.
 */
function getRedirectPath(state: unknown): string {
  const from = (state as { from?: Partial<Location> } | null)?.from;
  if (typeof from?.pathname !== 'string' || !isAdminPath(from.pathname)) return ADMIN_HOME;
  return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
}

/**
 * Message for a failed sign-in. Only a 401 means wrong credentials: a rate limit
 * (429) or a server error must not send the admin to the password reset procedure.
 * Other API errors carry a message the backend has already translated; a network
 * error or an empty message gets the generic error text.
 */
function getLoginErrorMessage(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiError)) return t('common.error');
  if (error.status === 401) return t('auth.loginError');
  return error.message || t('common.error');
}

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      void navigate(getRedirectPath(location.state), { replace: true });
    } catch (err) {
      setError(getLoginErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-canvas text-fg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <UpdateAvailableBanner className="mb-6" />
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-accent font-serif mb-2">{t('app.name')}</h1>
          <p className="text-fg-muted">{t('auth.welcome')}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface rounded-xl border border-line p-8 space-y-6"
        >
          <h2 className="text-xl font-semibold text-center">{t('auth.login')}</h2>

          {isSignInAfterRestore(location.search) && (
            <Alert tone="info" size="md">
              {t('auth.backupRestored')}
            </Alert>
          )}

          {isSignInAfterLogoutEverywhere(location.search) && (
            <Alert tone="info" size="md">
              {t('auth.loggedOutEverywhere')}
            </Alert>
          )}

          {error && (
            <Alert tone="danger" size="md">
              {error}
            </Alert>
          )}

          <Field label={t('auth.email')}>
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@carta.local"
            />
          </Field>

          <Field label={t('auth.password')}>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t('common.loading') : t('auth.loginButton')}
          </Button>

          <div className="flex justify-center">
            <LanguageSelector />
          </div>
        </form>
      </div>
    </main>
  );
}
