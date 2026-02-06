import { Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

export default function PublicLayout() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr');
  };

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-gray-100">
      <header className="bg-[#1a1a2e]/80 backdrop-blur-sm border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <Link to="/" className="text-xl font-bold text-amber-400 font-serif hover:text-amber-300 transition-colors">
          Carta Cocktail
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleLang}
            className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            {i18n.language === 'fr' ? 'EN' : 'FR'}
          </button>
          {user ? (
            <Link
              to="/admin"
              className="text-sm text-amber-400 hover:text-amber-300 px-3 py-1.5 rounded-lg border border-amber-400/30 hover:bg-amber-400/10 transition-colors"
            >
              {t('nav.dashboard')}
            </Link>
          ) : (
            <Link
              to="/login"
              className="text-sm text-amber-400 hover:text-amber-300 px-3 py-1.5 rounded-lg border border-amber-400/30 hover:bg-amber-400/10 transition-colors"
            >
              {t('nav.login')}
            </Link>
          )}
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
