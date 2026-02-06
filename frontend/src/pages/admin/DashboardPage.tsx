import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { categories as categoriesApi, bottles as bottlesApi, cocktails as cocktailsApi, menus as menusApi, shortages as shortagesApi } from '../../services/api';

export default function DashboardPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState({ categories: 0, bottles: 0, cocktails: 0, menus: 0 });
  const [shortageCount, setShortageCount] = useState(0);

  useEffect(() => {
    Promise.all([
      categoriesApi.list(),
      bottlesApi.list(),
      cocktailsApi.list(),
      menusApi.list(),
      shortagesApi.list(),
    ]).then(([cats, bots, cocks, mens, shorts]) => {
      setStats({
        categories: cats.length,
        bottles: bots.length,
        cocktails: cocks.length,
        menus: mens.length,
      });
      setShortageCount(shorts.length);
    });
  }, []);

  const statCards = [
    { label: t('dashboard.stats.categories'), value: stats.categories, icon: '🏷️', path: '/admin/categories' },
    { label: t('dashboard.stats.bottles'), value: stats.bottles, icon: '🍾', path: '/admin/bottles' },
    { label: t('dashboard.stats.cocktails'), value: stats.cocktails, icon: '🍸', path: '/admin/cocktails' },
    { label: t('dashboard.stats.menus'), value: stats.menus, icon: '📋', path: '/admin/menus' },
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
            <div className="text-3xl font-bold text-white">{card.value}</div>
            <div className="text-sm text-gray-400 mt-1">{card.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
