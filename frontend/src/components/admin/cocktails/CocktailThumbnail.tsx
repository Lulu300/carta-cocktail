import type { ReactNode } from 'react';
import type { Cocktail } from '../../../types';
import { cx } from '../../ui/classNames';
import UploadedPhoto from '../../ui/UploadedPhoto';

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

// Width the photo takes on screen, for the browser to pick a copy. The cards sit in a
// grid of 1 to 4 columns next to the admin sidebar, so the cover sizes are rough upper bounds.
const VARIANT_SIZES: Record<ThumbnailVariant, string> = {
  cover: '(min-width: 80rem) 20vw, (min-width: 64rem) 25vw, (min-width: 40rem) 40vw, 100vw',
  square: '5rem',
};

/** The cocktail photo, or a glass when it has none. `children` are laid over it, e.g. badges. */
export default function CocktailThumbnail({
  cocktail,
  variant,
  className,
  children,
}: CocktailThumbnailProps) {
  return (
    <div
      className={cx(
        'bg-canvas flex items-center justify-center',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {cocktail.imagePath ? (
        <UploadedPhoto
          imagePath={cocktail.imagePath}
          sizes={VARIANT_SIZES[variant]}
          loading="lazy"
          alt={cocktail.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <span aria-hidden="true" className={variant === 'cover' ? 'text-4xl' : 'text-3xl'}>
          🍸
        </span>
      )}
      {children}
    </div>
  );
}
