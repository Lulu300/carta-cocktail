import { useState, type ImgHTMLAttributes } from 'react';
import { getUploadSrcSet, getUploadUrl } from '../../utils/uploads';

type UploadedPhotoProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'srcSet' | 'onError' | 'decoding'
> & {
  imagePath: string;
  /** Width the photo takes on screen, for the browser to pick a copy (`sizes` of <img>). */
  sizes: string;
};

/**
 * A cocktail photo in its smallest copy that fills `sizes`. When the copy the
 * browser picked is missing (a photo restored from an older backup, until the
 * backend has made its copies), it falls back to the photo itself.
 */
export default function UploadedPhoto({ imagePath, ...imgProps }: UploadedPhotoProps) {
  // Kept per photo: a new photo gets its copies tried again
  const [photoWithoutCopies, setPhotoWithoutCopies] = useState<string | null>(null);
  const srcSet = photoWithoutCopies === imagePath ? undefined : getUploadSrcSet(imagePath);

  return (
    <img
      {...imgProps}
      src={getUploadUrl(imagePath) ?? undefined}
      srcSet={srcSet ?? undefined}
      decoding="async"
      onError={() => setPhotoWithoutCopies(imagePath)}
    />
  );
}
