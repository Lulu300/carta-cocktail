import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx, focusRingClasses } from '../../components/ui/classNames';

export interface SectionNavItem {
  anchorId: string;
  label: string;
}

interface SectionNavProps {
  items: SectionNavItem[];
}

// A section is active while it crosses a band at 30-40 % of the viewport height,
// just below the sticky header and toolbar.
const ACTIVE_BAND_MARGIN = '-30% 0px -60% 0px';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Horizontal list of the menu sections: a click scrolls to one, the active one follows the scroll. */
export default function SectionNav({ items }: SectionNavProps) {
  const { t } = useTranslation();
  const [observedId, setObservedId] = useState(items[0]?.anchorId);
  const listRef = useRef<HTMLUListElement>(null);
  // A search can remove the active section: fall back to the first one left.
  const activeId = items.some((item) => item.anchorId === observedId) ? observedId : items[0]?.anchorId;

  useEffect(() => {
    const targets = items
      .map((item) => document.getElementById(item.anchorId))
      .filter((element): element is HTMLElement => element !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      const topmost = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (topmost) setObservedId(topmost.target.id);
    }, { rootMargin: ACTIVE_BAND_MARGIN });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [items]);

  // Keep the active chip visible on a narrow screen. Scrolling the list itself
  // (not scrollIntoView) leaves a running page scroll untouched.
  useEffect(() => {
    const list = listRef.current;
    const chip = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !chip) return;
    list.scrollLeft = chip.offsetLeft - (list.clientWidth - chip.offsetWidth) / 2;
  }, [activeId]);

  const scrollToSection = (anchorId: string) => {
    setObservedId(anchorId);
    document.getElementById(anchorId)?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <nav aria-label={t('public.sectionNav')} className="mt-3">
      <ul
        ref={listRef}
        className="flex gap-2 overflow-x-auto pb-1 scroll-smooth motion-reduce:scroll-auto [scrollbar-width:none]"
      >
        {items.map((item) => {
          const isActive = item.anchorId === activeId;
          return (
            <li key={item.anchorId} className="shrink-0">
              <button
                type="button"
                onClick={() => scrollToSection(item.anchorId)}
                aria-current={isActive ? 'true' : undefined}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                  focusRingClasses,
                  isActive
                    ? 'border-accent bg-accent text-on-accent font-semibold'
                    : 'border-line-strong text-fg-muted hover:text-fg',
                )}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
