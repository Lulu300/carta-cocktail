import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteSettings } from '../../contexts/SiteSettingsContext';
import { useShortages } from '../../queries/shortages';
import LanguageSelector from '../ui/LanguageSelector';
import AppVersion from './AppVersion';

const navItems = [
  { path: '/admin', key: 'dashboard', icon: '📊' },
  { path: '/admin/categories', key: 'categories', icon: '🏷️' },
  { path: '/admin/bottles', key: 'bottles', icon: '🍾' },
  { path: '/admin/ingredients', key: 'ingredients', icon: '🍋' },
  { path: '/admin/units', key: 'units', icon: '📏' },
  { path: '/admin/cocktails', key: 'cocktails', icon: '🍸' },
  { path: '/admin/menus', key: 'menus', icon: '📋' },
  { path: '/admin/shortages', key: 'shortages', icon: '⚠️' },
  { path: '/admin/settings', key: 'settings', icon: '⚙️' },
];

export default function AdminLayout() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { siteSettings } = useSiteSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: shortageList } = useShortages();
  const shortageCount = shortageList?.length ?? 0;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-canvas text-fg flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 flex flex-col bg-surface border-r border-line transform transition-transform duration-200 lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-line">
          <Link to="/admin" className="text-xl font-bold text-accent font-serif">
            {siteSettings.siteIcon && <span className="mr-1">{siteSettings.siteIcon}</span>}
            {siteSettings.siteName}
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
                    ? 'bg-accent/10 text-accent'
                    : 'text-fg-muted hover:bg-line hover:text-fg'
                }`}
              >
                <span>{item.icon}</span>
                <span>{t(`nav.${item.key}`)}</span>
                {item.key === 'shortages' && shortageCount > 0 && (
                  <span className="ml-auto bg-danger text-canvas text-xs font-bold px-2 py-0.5 rounded-full">
                    {shortageCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <AppVersion className="mt-auto px-6 py-4 border-t border-line" />
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
        <header className="bg-surface border-b border-line px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden text-fg-muted hover:text-fg"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-4 ml-auto">
            {shortageCount > 0 && (
              <Link
                to="/admin/shortages"
                className="flex items-center gap-2 bg-danger/10 text-danger px-3 py-1.5 rounded-lg text-sm hover:bg-danger/20 transition-colors"
              >
                <span>⚠️</span>
                <span>{t('dashboard.shortageAlert', { count: shortageCount })}</span>
              </Link>
            )}
            <LanguageSelector />
            <button
              onClick={handleLogout}
              className="text-sm text-fg-muted hover:text-fg px-3 py-1.5 rounded-lg hover:bg-line transition-colors"
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
