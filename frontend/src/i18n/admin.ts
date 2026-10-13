import i18n, { type TranslatedLanguage } from './index';
import en from './locales/admin/en.json';
import fr from './locales/admin/fr.json';

// Messages of the login page and the admin, kept out of the public first load.
// App.tsx loads this module with every chunk behind /login and /admin and waits for it,
// so the messages are registered when evaluating it, before those chunks first render.
const ADMIN_MESSAGES = { en, fr } satisfies Record<TranslatedLanguage, typeof en>;

for (const [language, messages] of Object.entries(ADMIN_MESSAGES)) {
  // Deep merge: namespaces such as "common" are split between the public and admin bundles.
  i18n.addResourceBundle(language, 'translation', messages, true, false);
}
