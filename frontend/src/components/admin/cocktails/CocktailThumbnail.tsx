import type { ReactNode } from 'react';
import type { Cocktail } from '../../../types';
import { getUploadUrl } from '../../../utils/uploads';
import { cx } from '../../ui/classNames';

type ThumbnailVariant = 'cover' | 'square';

interface CocktailThumbnailProps {
  cocktail: Pick<Cocktail, 'name' | 'imagePath'>;
  /** `cover` fills the top of a card, `square` sits beside a list row. */
  variant: ThumbnailVariant;
  className?: string;
  children?: ReactNode;
}

const VARIANT_CLASSES: Record<ThumbnailVariant, string> = {
  cover: 'aspect-video relative',
  square: 'h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg',
};

/** The cocktail photo, or a glass when it has none. `children` are laid over it, e.g. badges. */
export default function CocktailThumbnail({ cocktail, variant, className, children }: CocktailThumbnailProps) {
  const imageUrl = getUploadUrl(cocktail.imagePath);

  return (
    <div className={cx('bg-canvas flex items-center justify-center', VARIANT_CLASSES[variant], className)}>
      {imageUrl ? (
        <img src={imageUrl} alt={cocktail.name} className="w-full h-full object-cover" />
      ) : (
        <span aria-hidden="true" className={variant === 'cover' ? 'text-4xl' : 'text-3xl'}>🍸</span>
      )}
      {children}
    </div>
  );
}
