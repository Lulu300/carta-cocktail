import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getUploadUrl } from '../../../utils/uploads';
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

  // A preview URL keeps its file in memory until revoked: the cleanup frees the
  // previous one when another file is picked, and the last one on unmount.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleChange = (file: File | undefined) => {
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    onChange(file);
  };

  const shownUrl = previewUrl ?? getUploadUrl(imagePath);

  return (
    <Card>
      <label htmlFor={inputId} className="block text-sm text-fg-muted mb-2">{t('cocktails.image')}</label>
      <div className="flex items-center gap-4">
        {shownUrl && <img src={shownUrl} alt="" className="w-24 h-24 object-cover rounded-lg" />}
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => handleChange(event.target.files?.[0])}
          className="text-sm text-fg-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-on-accent hover:file:bg-accent-hover"
        />
      </div>
    </Card>
  );
}
