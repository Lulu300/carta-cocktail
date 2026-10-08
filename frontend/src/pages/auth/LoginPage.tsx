import { useState } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import LanguageSelector from '../../components/ui/LanguageSelector';

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
      navigate(getRedirectPath(location.state), { replace: true });
    } catch {
      setError(t('auth.loginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-amber-400 font-serif mb-2">Carta Cocktail</h1>
          <p className="text-gray-400">{t('auth.welcome')}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#1a1a2e] rounded-xl border border-gray-800 p-8 space-y-6"
        >
          <h2 className="text-xl font-semibold text-center">{t('auth.login')}</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-2">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-amber-400 transition-colors"
              placeholder="admin@carta.local"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-400 hover:bg-amber-500 text-[#0f0f1a] font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('auth.loginButton')}
          </button>

          <div className="flex justify-center">
            <LanguageSelector />
          </div>
        </form>
      </div>
    </div>
  );
}
