import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { publicApi } from '../../services/api';
import type { Menu } from '../../types';

export default function HomePage() {
  const { t } = useTranslation();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    publicApi.listMenus()
      .then(setMenus)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold font-serif text-amber-400 mb-3">
          {t('app.name')}
        </h1>
        <p className="text-gray-400 text-lg">{t('home.subtitle')}</p>
      </div>

      {menus.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {t('home.noMenus')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {menus.map((menu) => {
            const isBottleMenu = menu.type === 'APEROS' || menu.type === 'DIGESTIFS';
            const count = isBottleMenu ? (menu._count?.bottles ?? 0) : (menu._count?.cocktails ?? 0);
            const countLabel = isBottleMenu ? 'bouteille(s)' : t('home.cocktailCount');

            return (
              <Link
                key={menu.id}
                to={`/menu/${menu.slug}`}
                className="group bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 hover:border-amber-400/50 transition-all hover:shadow-lg hover:shadow-amber-400/5"
              >
                <h2 className="text-xl font-bold font-serif text-white group-hover:text-amber-400 transition-colors mb-2">
                  {menu.name}
                </h2>
                {menu.description && (
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                    {menu.description}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {count} {countLabel}
                  </span>
                  <span className="text-amber-400 group-hover:translate-x-1 transition-transform">
                    &rarr;
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
