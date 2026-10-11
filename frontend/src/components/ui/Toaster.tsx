import { useEffect, useState, useSyncExternalStore, type FocusEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Button from './Button';
import IconButton from './IconButton';
import { cx } from './classNames';
import { toast, toastStore, type Toast, type ToastTone } from './ToastStore';

const TONE_CLASSES: Record<ToastTone, string> = {
  success: 'border-l-success',
  info: 'border-l-info',
  error: 'border-l-danger',
};

function ToastItem({ item }: { item: Toast }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const isPaused = hovered || focused;

  useEffect(() => {
    if (isPaused) toastStore.pause(item.id);
    else toastStore.resume(item.id);
  }, [isPaused, item.id]);

  // Moving the focus from one button of the toast to the other is not a blur of the toast.
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  };

  const handleAction = () => {
    item.action?.onClick();
    toast.dismiss(item.id);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      className={cx(
        'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl py-2 pr-2 pl-4 shadow-lg',
        'bg-surface text-fg border border-line border-l-4',
        TONE_CLASSES[item.tone],
      )}
    >
      <p className="flex-1 text-sm">{item.message}</p>
      {item.action && (
        <Button variant="ghost" size="sm" onClick={handleAction}>{item.action.label}</Button>
      )}
      <IconButton icon="close" label={t('common.close')} variant="neutral" onClick={() => toast.dismiss(item.id)} />
    </div>
  );
}

const REGION_CLASSES = 'flex w-full flex-col items-center gap-2 sm:items-end';

/**
 * Renders the toasts of the store: bottom right, bottom center under 640 px.
 * Both live regions stay in the page even when empty, so that screen readers
 * already watch them when the first toast arrives.
 */
export default function Toaster() {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot);
  const errors = toasts.filter((item) => item.tone === 'error');
  const notices = toasts.filter((item) => item.tone !== 'error');

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-96">
      <div role="alert" className={REGION_CLASSES}>
        {errors.map((item) => <ToastItem key={item.id} item={item} />)}
      </div>
      <div role="status" aria-live="polite" className={REGION_CLASSES}>
        {notices.map((item) => <ToastItem key={item.id} item={item} />)}
      </div>
    </div>
  );
}
