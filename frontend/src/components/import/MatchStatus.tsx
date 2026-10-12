import Badge from '../ui/Badge';
import { cx } from '../ui/classNames';

/** Coloured dot in front of an imported entity: found in the database or not. */
export function MatchDot({ matched }: { matched: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx('w-2.5 h-2.5 rounded-full flex-shrink-0', matched ? 'bg-success' : 'bg-warning')}
    />
  );
}

/** "Match found" or "To create", after the entity's name. */
export function MatchBadge({ matched, label }: { matched: boolean; label: string }) {
  return <Badge tone={matched ? 'success' : 'warning'}>{label}</Badge>;
}
