import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import fr from './locales/fr.json';
import { FALLBACK_LANGUAGE, getBaseLanguage } from '../utils/localization';

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;

// Registered before init so the language picked by the detector is applied too.
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = getBaseLanguage(language || FALLBACK_LANGUAGE);
});

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
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
