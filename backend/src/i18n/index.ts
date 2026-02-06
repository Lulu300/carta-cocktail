import i18next from 'i18next';
import middleware from 'i18next-http-middleware';
import en from './en.json';
import fr from './fr.json';

i18next.use(middleware.LanguageDetector).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  fallbackLng: 'en',
  preload: ['en', 'fr'],
});

export default i18next;
export const i18nMiddleware = middleware.handle(i18next);
