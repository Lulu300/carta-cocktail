import { useTranslation } from 'react-i18next';
import { useLocalizedName } from '../../hooks/useLocalizedName';
import { useShortages } from '../../queries/shortages';
import { getBadgeClasses } from '../../utils/colors';

export default function ShortagesPage() {
  const { t } = useTranslation();
  const localize = useLocalizedName();
  const { data: items, isPending, isError, refetch } = useShortages();

  // Never show the green "no shortages" banner unless the list really loaded.
  const renderContent = () => {
    if (isPending) {
      return <div role="status" className="text-center py-12 text-fg-muted">{t('common.loading')}</div>;
    }
    if (isError) {
      return (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-6 py-8 rounded-xl text-center space-y-4">
          <p className="text-lg">{t('common.error')}</p>
          <button
            onClick={() => refetch()}
            className="border border-red-400/40 hover:bg-red-400/10 px-4 py-2 rounded-lg transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-6 py-8 rounded-xl text-center text-lg">
          {t('shortages.noShortages')}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => {
          const deficit = item.requiredPercent - item.totalPercent;
          const fillPercent = item.requiredPercent > 0
            ? Math.min(100, (item.totalPercent / item.requiredPercent) * 100)
            : 100;
          return (
            <div key={item.category.id} className="bg-surface border border-danger/30 rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-lg">{localize(item.category)}</h2>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getBadgeClasses(item.category.categoryType?.color)}`}>
                  {item.category.categoryType ? localize(item.category.categoryType) : item.category.type}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-fg-muted">{t('shortages.currentStock')}</span>
                  <span className="text-fg">{item.totalPercent}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">{t('shortages.required')}</span>
                  <span className="text-fg">{item.requiredPercent}%</span>
                </div>
                <div className="w-full h-2 bg-line-strong rounded-full overflow-hidden">
                  <div
                    className="h-full bg-danger rounded-full transition-all motion-reduce:transition-none"
                    style={{ width: `${fillPercent}%` }}
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">{t('shortages.deficit')}</span>
                  <span className="text-danger font-bold">-{deficit}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">{t('shortages.totalUsable')}</span>
                  <span className="text-fg">{item.totalUsable}</span>
                </div>
                <div className="flex justify-between border-t border-line pt-2 mt-2">
                  <span className="text-fg-muted">{t('shortages.desired')}</span>
                  <span className="text-fg">{item.category.desiredStock}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">{t('shortages.threshold')}</span>
                  <span className="text-accent">{item.category.minimumPercent}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold font-serif text-accent mb-6">{t('shortages.title')}</h1>
      {renderContent()}
    </div>
  );
}
