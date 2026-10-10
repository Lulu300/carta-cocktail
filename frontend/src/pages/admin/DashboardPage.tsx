import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UseQueryResult } from '@tanstack/react-query';
import Spinner from '../../components/ui/Spinner';
import { useBottles } from '../../queries/bottles';
import { useCategories } from '../../queries/categories';
import { useCocktails } from '../../queries/cocktails';
import { useMenus } from '../../queries/menus';
import { useShortages } from '../../queries/shortages';

/** Count shown on a stat card: never a misleading 0 while loading or after a failed request. */
function StatCount({ query }: { query: UseQueryResult<unknown[], Error> }) {
  const { t } = useTranslation();

  if (query.isPending) {
    return (
      <div className="text-3xl font-bold text-gray-500">
        <Spinner />
      </div>
    );
  }
  if (query.isError) {
    return (
      <>
        <div aria-hidden="true" className="text-3xl font-bold text-gray-500">–</div>
        <div className="text-xs text-red-400">{t('common.error')}</div>
      </>
    );
  }
  return <div className="text-3xl font-bold text-white">{query.data.length}</div>;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const categoriesQuery = useCategories();
  const bottlesQuery = useBottles();
  const cocktailsQuery = useCocktails();
  const menusQuery = useMenus();
  const { data: shortageList } = useShortages();
  const shortageCount = shortageList?.length ?? 0;

  const statCards = [
    { label: t('dashboard.stats.categories'), query: categoriesQuery, icon: '🏷️', path: '/admin/categories' },
    { label: t('dashboard.stats.bottles'), query: bottlesQuery, icon: '🍾', path: '/admin/bottles' },
    { label: t('dashboard.stats.cocktails'), query: cocktailsQuery, icon: '🍸', path: '/admin/cocktails' },
    { label: t('dashboard.stats.menus'), query: menusQuery, icon: '📋', path: '/admin/menus' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold font-serif text-amber-400 mb-6">{t('dashboard.title')}</h1>

      {shortageCount > 0 && (
        <Link
          to="/admin/shortages"
          className="block mb-6 bg-red-500/10 border border-red-500/30 text-red-400 px-6 py-4 rounded-xl hover:bg-red-500/20 transition-colors"
        >
          ⚠️ {t('dashboard.shortageAlert', { count: shortageCount })}
        </Link>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Link
            key={card.path}
            to={card.path}
            className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 hover:border-amber-400/30 transition-colors"
          >
            <div className="text-3xl mb-2">{card.icon}</div>
            <StatCount query={card.query} />
            <div className="text-sm text-gray-400 mt-1">{card.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
