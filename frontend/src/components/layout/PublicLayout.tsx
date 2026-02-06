import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function PublicLayout() {
  const { i18n } = useTranslation();

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr');
  };

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-gray-100">
      <header className="bg-[#1a1a2e]/80 backdrop-blur-sm border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-amber-400 font-serif">Carta Cocktail</h1>
        <button
          onClick={toggleLang}
          className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
        >
          {i18n.language === 'fr' ? 'EN' : 'FR'}
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
