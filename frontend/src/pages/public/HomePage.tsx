import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSiteSettings } from '../../contexts/SiteSettingsContext';
import { usePublicMenus } from '../../queries/public';
import type { Menu } from '../../types';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import PublicErrorState from './PublicErrorState';
import PublicLoading from './PublicLoading';
import { isBottleMenu } from './useMenuFilter';
import { useScrollRestoration } from './useScrollRestoration';

const PLACEHOLDER_CARDS = [1, 2, 3, 4];

export default function HomePage() {
  const { t } = useTranslation();
  const { siteSettings } = useSiteSettings();
  const { data: menus, error, refetch, isFetching } = usePublicMenus();
  useScrollRestoration(Boolean(menus));

  const renderMenus = () => {
    if (menus) {
      if (menus.length === 0) return <EmptyState icon="🍸" title={t('home.noMenus')} />;
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {menus.map((menu) => <MenuCard key={menu.id} menu={menu} />)}
        </div>
      );
    }
    if (error) {
      return (
        <PublicErrorState
          error={error}
          loadErrorTitle={t('home.loadError')}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      );
    }
    return <HomeSkeleton />;
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold font-serif text-accent mb-3">
          {siteSettings.siteIcon && <span className="mr-2">{siteSettings.siteIcon}</span>}
          {siteSettings.siteName}
        </h1>
        <p className="text-fg-muted text-lg">{t('home.subtitle')}</p>
      </div>
      {renderMenus()}
    </div>
  );
}

function MenuCard({ menu }: { menu: Menu }) {
  const { t } = useTranslation();
  const countLabel = isBottleMenu(menu)
    ? t('home.bottleCount', { count: menu._count?.bottles ?? 0 })
    : t('home.cocktailCount', { count: menu._count?.cocktails ?? 0 });

  return (
    <Link
      to={`/menu/${menu.slug}`}
      className="group bg-surface border border-line rounded-xl p-6 hover:border-accent/50 transition-all motion-reduce:transition-none hover:shadow-lg hover:shadow-accent/5"
    >
      <h2 className="text-xl font-bold font-serif text-white group-hover:text-accent transition-colors mb-2">
        {menu.name}
      </h2>
      {menu.description && (
        <p className="text-fg-muted text-sm mb-4 line-clamp-2">{menu.description}</p>
      )}
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span>{countLabel}</span>
        <span aria-hidden="true" className="text-accent motion-safe:group-hover:translate-x-1 transition-transform motion-reduce:transition-none">
          &rarr;
        </span>
      </div>
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <PublicLoading className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {PLACEHOLDER_CARDS.map((card) => (
        <div key={card} className="bg-surface border border-line rounded-xl p-6 space-y-3">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      ))}
    </PublicLoading>
  );
}
