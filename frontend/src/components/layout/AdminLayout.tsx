import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { shortages as shortagesApi } from '../../services/api';
import LanguageSelector from '../ui/LanguageSelector';

const navItems = [
  { path: '/admin', key: 'dashboard', icon: '📊' },
  { path: '/admin/categories', key: 'categories', icon: '🏷️' },
  { path: '/admin/bottles', key: 'bottles', icon: '🍾' },
  { path: '/admin/ingredients', key: 'ingredients', icon: '🍋' },
  { path: '/admin/units', key: 'units', icon: '📏' },
  { path: '/admin/cocktails', key: 'cocktails', icon: '🍸' },
  { path: '/admin/menus', key: 'menus', icon: '📋' },
  { path: '/admin/shortages', key: 'shortages', icon: '⚠️' },
];

export default function AdminLayout() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortageCount, setShortageCount] = useState(0);

  useEffect(() => {
    shortagesApi.list().then((data) => setShortageCount(data.length)).catch(() => {});
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-gray-100 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-[#1a1a2e] border-r border-gray-800 transform transition-transform duration-200 lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-gray-800">
          <Link to="/admin" className="text-xl font-bold text-amber-400 font-serif">
            Carta Cocktail
          </Link>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = item.path === '/admin'
              ? location.pathname === '/admin'
              : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-amber-400/10 text-amber-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                <span>{item.icon}</span>
                <span>{t(`nav.${item.key}`)}</span>
                {item.key === 'shortages' && shortageCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {shortageCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="bg-[#1a1a2e] border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-4 ml-auto">
            {shortageCount > 0 && (
              <Link
                to="/admin/shortages"
                className="flex items-center gap-2 bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg text-sm hover:bg-red-500/20 transition-colors"
              >
                <span>⚠️</span>
                <span>{t('dashboard.shortageAlert', { count: shortageCount })}</span>
              </Link>
            )}
            <LanguageSelector />
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              {t('nav.logout')}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
