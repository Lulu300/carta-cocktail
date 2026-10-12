import { cx } from '../../ui/classNames';
import { parseTags } from './parseTags';

interface TagListProps {
  /** Comma-separated, as stored or as typed in the form. */
  tags: string | null | undefined;
  className?: string;
}

export default function TagList({ tags, className }: TagListProps) {
  const tagList = parseTags(tags);
  if (tagList.length === 0) return null;

  return (
    <div className={cx('flex flex-wrap gap-1', className)}>
      {tagList.map((tag, index) => (
        // The same tag may be typed twice: the index keeps the keys unique.
        <span key={`${index}-${tag}`} className="bg-accent/10 text-accent text-xs px-2 py-0.5 rounded-full">{tag}</span>
      ))}
    </div>
  );
}
