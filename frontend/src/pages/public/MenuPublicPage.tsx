import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePublicMenu } from '../../queries/public';
import { useCocktailsAvailability } from '../../queries/cocktails';
import type { Menu } from '../../types';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import LiveResultCount from '../../components/ui/LiveResultCount';
import Modal from '../../components/ui/Modal';
import { cx } from '../../components/ui/classNames';
import BottleGroupRow from './BottleGroupRow';
import MenuSearchBar from './MenuSearchBar';
import MenuSkeleton from './MenuSkeleton';
import PublicCocktailItem from './PublicCocktailItem';
import PublicErrorState from './PublicErrorState';
import SectionBlock from './SectionBlock';
import SectionNav, { type SectionNavItem } from './SectionNav';
import { isBottleMenu, useMenuFilter, type BottleGroupEntry, type MenuBlock } from './useMenuFilter';
import { useScrollRestoration } from './useScrollRestoration';

type ViewMode = 'grid' | 'list';

export default function MenuPublicPage() {
  const { t } = useTranslation();
  const { slug = '' } = useParams();
  const { data: menu, error, refetch, isFetching } = usePublicMenu(slug);
  useScrollRestoration(Boolean(menu));

  if (menu) return <MenuContent key={slug} menu={menu} slug={slug} />;
  if (error) {
    return (
      <PublicErrorState
        error={error}
        loadErrorTitle={t('public.menuLoadError')}
        notFound={{ title: t('public.menuNotFound'), linkTo: '/', linkLabel: t('public.backHome') }}
        onRetry={() => refetch()}
        isRetrying={isFetching}
      />
    );
  }
  return <MenuSkeleton />;
}

function MenuContent({ menu, slug }: { menu: Menu; slug: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [locationsGroup, setLocationsGroup] = useState<BottleGroupEntry | null>(null);
  const bottleMenu = isBottleMenu(menu);
  const { cocktailBlocks, bottleBlocks, resultCount, hasItems } = useMenuFilter(menu, searchQuery);
  // Stock levels are private: only a signed-in admin sees them on the public page.
  const { data: availabilities } = useCocktailsAvailability({ enabled: Boolean(user) && !bottleMenu });
  const isSearching = searchQuery.trim() !== '';

  const navItems = useMemo<SectionNavItem[]>(() => {
    const blocks: MenuBlock<unknown>[] = bottleMenu ? bottleBlocks : cocktailBlocks;
    return blocks.filter((block) => block.title).map((block) => ({ anchorId: block.anchorId, label: block.title }));
  }, [bottleMenu, bottleBlocks, cocktailBlocks]);

  const renderNoResults = () => {
    if (!hasItems) return <EmptyState icon="🍸" title={t('public.emptyMenu')} />;
    return (
      <EmptyState
        icon="🔍"
        title={t('public.noResults', { query: searchQuery.trim() })}
        action={<Button variant="secondary" onClick={() => setSearchQuery('')}>{t('common.clearSearch')}</Button>}
      />
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <h1 className="text-4xl font-bold font-serif text-accent mb-3">{menu.name}</h1>
        {menu.description && <p className="text-fg-muted text-lg">{menu.description}</p>}
      </div>

      {!bottleMenu && <ViewModeToggle value={viewMode} onChange={setViewMode} />}

      <div className="sticky top-[var(--header-h)] z-[5] -mx-4 px-4 py-3 mb-6 bg-canvas/95 backdrop-blur-sm print:hidden">
        <MenuSearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={t(bottleMenu ? 'public.bottleSearchPlaceholder' : 'public.cocktailSearchPlaceholder')}
        />
        {navItems.length >= 2 && <SectionNav items={navItems} />}
      </div>

      <LiveResultCount count={isSearching ? resultCount : null} />

      {resultCount === 0 ? renderNoResults() : (
        <div className={bottleMenu ? 'space-y-8' : 'space-y-10'}>
          {bottleBlocks.map((block) => (
            <SectionBlock key={block.anchorId} anchorId={block.anchorId} title={block.title} kind={block.kind} rowsInCard>
              {block.items.map((group) => (
                <BottleGroupRow
                  key={group.key}
                  group={group}
                  showInventory={Boolean(user)}
                  onShowLocations={setLocationsGroup}
                />
              ))}
            </SectionBlock>
          ))}
          {cocktailBlocks.map((block) => (
            <SectionBlock key={block.anchorId} anchorId={block.anchorId} title={block.title} kind={block.kind}>
              <div
                data-testid={`public-cocktails-${viewMode}-view`}
                className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : 'space-y-3'}
              >
                {block.items.map((menuCocktail) => (
                  <PublicCocktailItem
                    key={menuCocktail.id}
                    menuCocktail={menuCocktail}
                    menuSlug={slug}
                    viewMode={viewMode}
                    availability={availabilities?.[menuCocktail.cocktailId]}
                    showAvailability={Boolean(user)}
                  />
                ))}
              </div>
            </SectionBlock>
          ))}
        </div>
      )}

      <Modal open={locationsGroup !== null} onClose={() => setLocationsGroup(null)} title={locationsGroup?.name} size="sm">
        <ul className="space-y-2">
          {locationsGroup?.locations.map((location) => (
            <li key={location.name} className="flex items-center justify-between px-3 py-2 bg-canvas rounded-lg">
              <span className="text-gray-300">{location.name}</span>
              <span className="text-accent font-medium">{location.count}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

const VIEW_MODES: { value: ViewMode; labelKey: string }[] = [
  { value: 'grid', labelKey: 'cocktails.viewGrid' },
  { value: 'list', labelKey: 'cocktails.viewList' },
];

function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex justify-end">
      <div className="inline-flex rounded-lg border border-line-strong bg-surface p-1">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            aria-pressed={value === mode.value}
            className={cx(
              'rounded-md px-3 py-2 text-sm transition-colors',
              value === mode.value ? 'bg-accent text-on-accent font-semibold' : 'text-fg-muted hover:text-white',
            )}
          >
            {t(mode.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
