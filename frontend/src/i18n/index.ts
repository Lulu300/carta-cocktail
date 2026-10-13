import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/public/en.json';
import fr from './locales/public/fr.json';
import { FALLBACK_LANGUAGE, getBaseLanguage } from '../utils/localization';

// Languages with their own message files. A regional variant without files ("en-GB") is only
// added to SUPPORTED_LANGUAGES: i18next serves it the messages of its base language.
export const TRANSLATED_LANGUAGES = ['fr', 'en'] as const;
export type TranslatedLanguage = (typeof TRANSLATED_LANGUAGES)[number];

export const SUPPORTED_LANGUAGES: readonly string[] = [...TRANSLATED_LANGUAGES];

// Only the messages of the first load (public pages and the components they share with the
// admin) ship with the app entry: guests opening a menu from a QR code never need the rest.
// The admin and login messages are registered by ./admin, loaded with their chunks.
// A language added to TRANSLATED_LANGUAGES goes in this map and in the one of ./admin:
// `satisfies` fails until both list it.
const PUBLIC_RESOURCES = {
  en: { translation: en },
  fr: { translation: fr },
} satisfies Record<TranslatedLanguage, { translation: typeof en }>;

// Registered before init so the language picked by the detector is applied too.
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = getBaseLanguage(language || FALLBACK_LANGUAGE);
});

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: PUBLIC_RESOURCES,
    detection: {
      // Default order without 'htmlTag' and 'cookie'. <html lang> is written by the listener above,
      // so reading it back would make an unsupported browser language ("de") inherit the previous
      // choice. No cookie is ever written (the choice is cached in localStorage only).
      order: ['querystring', 'localStorage', 'sessionStorage', 'navigator'],
      // Reduce detected codes to their base language ("fr-FR" -> "fr") so they match supportedLngs.
      convertDetectedLanguage: getBaseLanguage,
    },
    // Unsupported languages ("de") fall through to fallbackLng: i18n.language is always "fr" or "en".
    // Neither nonExplicitSupportedLngs nor load: 'languageOnly' may be set: both make i18next
    // accept "fr-FR" as supported and keep the regional code.
    supportedLngs: [...SUPPORTED_LANGUAGES],
    fallbackLng: FALLBACK_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
