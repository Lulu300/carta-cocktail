import i18next from 'i18next';
import middleware from 'i18next-http-middleware';
import en from './en.json';
import fr from './fr.json';

/** Language used when the request's language has no translation (also read by the import's date formats). */
export const FALLBACK_LANGUAGE = 'en';

i18next.use(middleware.LanguageDetector).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  fallbackLng: FALLBACK_LANGUAGE,
  preload: ['en', 'fr'],
  // No promotional banner in the server logs
  showSupportNotice: false,
});

export default i18next;
export const i18nMiddleware = middleware.handle(i18next);
