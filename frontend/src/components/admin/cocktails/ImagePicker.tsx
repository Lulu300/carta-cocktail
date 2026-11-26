import { useEffect, useId, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getUploadUrl } from '../../../utils/uploads';
import { exceedsUploadLimit, MAX_IMAGE_BYTES } from '../../../utils/uploadLimits';
import Card from '../../ui/Card';

interface ImagePickerProps {
  /** The stored image, shown until another file is picked. */
  imagePath: string | null;
  onChange: (file: File) => void;
}

export default function ImagePicker({ imagePath, onChange }: ImagePickerProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [tooLarge, setTooLarge] = useState(false);

  // A preview URL keeps its file in memory until revoked: the cleanup frees the
  // previous one when another file is picked, and the last one on unmount.
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const refused = exceedsUploadLimit(file, MAX_IMAGE_BYTES);
    setTooLarge(refused);
    if (refused) {
      // The input would keep showing the refused file while the previous photo stays in use
      event.target.value = '';
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    onChange(file);
  };

  const shownUrl = previewUrl ?? getUploadUrl(imagePath);

  return (
    <Card>
      <label htmlFor={inputId} className="block text-sm text-fg-muted mb-2">
        {t('cocktails.image')}
      </label>
      <div className="flex items-center gap-4">
        {shownUrl && <img src={shownUrl} alt="" className="w-24 h-24 object-cover rounded-lg" />}
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleChange}
          className="text-sm text-fg-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-on-accent hover:file:bg-accent-hover"
        />
      </div>
      {tooLarge && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {t('common.requestTooLarge')}
        </p>
      )}
    </Card>
  );
}
