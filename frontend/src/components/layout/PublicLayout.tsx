import { Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteSettings } from '../../contexts/SiteSettingsContext';
import LanguageSelector from '../ui/LanguageSelector';
import SkipLink, { MAIN_CONTENT_ID } from './SkipLink';

/**
 * `--header-h` is the height of the sticky header: the menu toolbar sticks right
 * below it, and the section anchors leave room for both.
 */
export default function PublicLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { siteSettings } = useSiteSettings();

  return (
    <div className="[--header-h:4rem] min-h-screen flex flex-col bg-canvas text-fg">
      <SkipLink />
      <header className="h-[var(--header-h)] bg-surface/80 backdrop-blur-sm border-b border-line px-4 sm:px-6 sticky top-0 z-10">
        <nav aria-label={t('nav.main')} className="h-full flex items-center justify-between gap-3">
          <Link to="/" className="min-w-0 truncate text-xl font-bold text-accent font-serif hover:text-accent-soft transition-colors">
            {siteSettings.siteIcon && <span aria-hidden="true" className="mr-1">{siteSettings.siteIcon}</span>}
            {siteSettings.siteName}
          </Link>
          <div className="flex items-center gap-3 shrink-0">
            <LanguageSelector />
            {user && (
              <Link
                to="/admin"
                className="text-sm text-accent hover:text-accent-soft px-3 py-1.5 rounded-lg border border-accent/30 hover:bg-accent/10 transition-colors"
              >
                {t('nav.dashboard')}
              </Link>
            )}
          </div>
        </nav>
      </header>
      <main id={MAIN_CONTENT_ID} className="flex-1">
        <Outlet />
      </main>
      {/* Guests come for the menu: the admin sign-in link stays discreet, down here. */}
      <footer className="border-t border-line px-4 sm:px-6 py-6 flex items-center justify-between gap-3 text-sm text-fg-muted print:hidden">
        <span className="min-w-0 truncate">{siteSettings.siteName}</span>
        {!user && (
          <Link to="/login" className="shrink-0 hover:text-fg transition-colors">
            {t('nav.login')}
          </Link>
        )}
      </footer>
    </div>
  );
}
