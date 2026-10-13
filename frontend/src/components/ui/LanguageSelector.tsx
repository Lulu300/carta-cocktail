import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FALLBACK_LANGUAGE, LANGUAGE_NAMES, getBaseLanguage } from '../../utils/localization';
import { cx } from './classNames';
import Icon from './Icon';
import { useDisclosure } from './useDisclosure';

function FlagFR({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
      <rect width="213.3" height="480" fill="#002654" />
      <rect x="213.3" width="213.4" height="480" fill="#fff" />
      <rect x="426.7" width="213.3" height="480" fill="#ce1126" />
    </svg>
  );
}

function FlagGB({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
      <rect width="640" height="480" fill="#012169" />
      <path d="M75 0l244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0z" fill="#fff" />
      <path d="M424 281l216 159v40L369 281zm-184 20l6 35L54 480H0zM640 0v3L391 191l2-44L590 0zM0 0l239 176h-60L0 42z" fill="#c8102e" />
      <path d="M241 0v480h160V0zM0 160v160h640V160z" fill="#fff" />
      <path d="M0 193v96h640v-96zM273 0v480h96V0z" fill="#c8102e" />
    </svg>
  );
}

const flagComponents: Record<string, ({ className }: { className?: string }) => React.JSX.Element> = {
  fr: FlagFR,
  en: FlagGB,
};

const languages = Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({ code, name }));

/** Moves the focus to the next or previous menu item, wrapping around the ends. */
function focusSiblingItem(menu: HTMLElement, step: 1 | -1) {
  const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
  const index = items.indexOf(document.activeElement as HTMLElement);
  items[(index + step + items.length) % items.length]?.focus();
}

export default function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const { isOpen, close, closeAndFocusTrigger, panelId, containerRef, handleKeyDown, triggerProps } = useDisclosure();
  const menuRef = useRef<HTMLDivElement>(null);

  // Defensive: i18n config already yields "fr" or "en", but never trust a regional or unknown code
  // here. Fall back to English like i18next does, not to the first entry of the list.
  const currentCode = getBaseLanguage(i18n.resolvedLanguage ?? i18n.language ?? FALLBACK_LANGUAGE);
  const currentLanguage =
    languages.find(lang => lang.code === currentCode) ??
    languages.find(lang => lang.code === FALLBACK_LANGUAGE)!;

  // Menu button pattern: the open menu takes the focus, on the current language.
  useEffect(() => {
    if (isOpen) menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [isOpen]);

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    // Menu button pattern: the chosen item disappears, the focus goes back to the button.
    closeAndFocusTrigger();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusSiblingItem(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1);
    }
  };

  return (
    <div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        {...triggerProps}
        aria-haspopup="menu"
        className="flex items-center gap-2 text-fg-muted hover:text-fg px-3 py-1.5 rounded-lg hover:bg-line transition-colors"
      >
        {/* Hidden text rather than aria-label: the name keeps the visible code (WCAG 2.5.3, label in name). */}
        <span className="sr-only">{t('nav.changeLanguage')}</span>{' '}
        {flagComponents[currentLanguage.code]?.({ className: 'w-5 h-4 rounded-sm' })}
        <span className="text-sm uppercase">{currentLanguage.code}</span>
        <Icon
          name="chevron-down"
          className={cx('size-4 transition-transform motion-reduce:transition-none', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          id={panelId}
          role="menu"
          aria-label={t('nav.language')}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 mt-2 w-40 bg-surface border border-line-strong rounded-lg shadow-lg overflow-hidden z-50"
        >
          {languages.map((lang) => {
            const isCurrent = lang.code === currentLanguage.code;
            return (
              <button
                key={lang.code}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                lang={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={cx(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  isCurrent ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:bg-line hover:text-fg',
                )}
              >
                {flagComponents[lang.code]?.({ className: 'w-5 h-4 rounded-sm' })}
                <span className="text-sm">{lang.name}</span>
                {isCurrent && <span aria-hidden="true" className="ml-auto text-accent">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
