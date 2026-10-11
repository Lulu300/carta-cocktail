import type { ReactNode } from 'react';
import { cx } from '../../components/ui/classNames';
import type { MenuBlockKind } from './useMenuFilter';

interface SectionBlockProps {
  anchorId: string;
  title: string;
  kind: MenuBlockKind;
  /** Children are rows (bottles) shown in a single card, instead of cards of their own. */
  rowsInCard?: boolean;
  children: ReactNode;
}

// Leaves room for the sticky header and toolbar when the section navigation
// scrolls a block to the top of the screen.
const SCROLL_MARGIN = 'scroll-mt-[calc(var(--header-h)+8rem)]';

const CARD_CLASSES = 'bg-surface border border-line rounded-xl overflow-hidden';

/** A titled block of the public menu, target of the section navigation. */
export default function SectionBlock({ anchorId, title, kind, rowsInCard = false, children }: SectionBlockProps) {
  const content = rowsInCard ? <div className="divide-y divide-line">{children}</div> : children;

  // Bottles grouped by category: the title is the header of the card.
  if (kind === 'category') {
    return (
      <section id={anchorId} className={cx(SCROLL_MARGIN, CARD_CLASSES)}>
        <div className="bg-canvas px-4 sm:px-6 py-3 border-b border-line">
          <h2 className="text-lg font-serif font-bold text-accent">{title}</h2>
        </div>
        {content}
      </section>
    );
  }

  return (
    <section id={anchorId} className={SCROLL_MARGIN}>
      {title && (
        <h2 className={cx('text-2xl font-serif font-bold mb-4', kind === 'unsectioned' ? 'text-fg-muted' : 'text-accent')}>
          {title}
        </h2>
      )}
      {rowsInCard ? <div className={CARD_CLASSES}>{content}</div> : content}
    </section>
  );
}
