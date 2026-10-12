import { useTranslation } from 'react-i18next';

/** Id of the `<main>` element the skip link jumps to. */
export const MAIN_CONTENT_ID = 'main-content';

/**
 * First focusable element of a layout: lets a keyboard user jump over the header
 * and navigation. Hidden until it receives the focus.
 */
export default function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-accent focus:text-on-accent focus:font-semibold"
    >
      {t('nav.skipToContent')}
    </a>
  );
}
