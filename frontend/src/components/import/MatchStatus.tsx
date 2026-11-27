import { useTranslation } from 'react-i18next';
import type { ImportMatchStatus } from '../../types';
import Badge from '../ui/Badge';
import { cx } from '../ui/classNames';

const DOT_CLASSES: Record<ImportMatchStatus, string> = {
  matched: 'bg-success',
  missing: 'bg-warning',
  ambiguous: 'bg-danger',
};

const BADGE_TONES = { matched: 'success', missing: 'warning', ambiguous: 'danger' } as const;

/** Coloured dot in front of an imported entity: found in the database, not found, or several matches. */
export function MatchDot({ status }: { status: ImportMatchStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cx('w-2.5 h-2.5 rounded-full flex-shrink-0', DOT_CLASSES[status])}
    />
  );
}

/** "Match found", "To create" or "Several matches", after the entity's name. */
export function MatchBadge({ status, label }: { status: ImportMatchStatus; label: string }) {
  return <Badge tone={BADGE_TONES[status]}>{label}</Badge>;
}

/**
 * Names the existing rows an ambiguous entity could mean: they differ only by case, and the
 * backend refuses to create another one.
 */
export function AmbiguousMatches({ matches }: { matches: { name: string }[] }) {
  const { t } = useTranslation();
  return (
    <p className="text-xs text-danger">
      {t('importMatches.pickOne', { names: matches.map((match) => match.name).join(', ') })}
    </p>
  );
}
