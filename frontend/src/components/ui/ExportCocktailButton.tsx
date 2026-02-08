import { useTranslation } from 'react-i18next';
import { cocktails as cocktailsApi, publicApi } from '../../services/api';

interface ExportCocktailButtonProps {
  cocktailId: number;
  cocktailName: string;
  isPublic?: boolean;
  className?: string;
}

export default function ExportCocktailButton({ cocktailId, cocktailName, isPublic, className }: ExportCocktailButtonProps) {
  const { t } = useTranslation();

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const data = isPublic
        ? await publicApi.exportCocktail(cocktailId)
        : await cocktailsApi.exportRecipe(cocktailId);

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const slug = cocktailName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const a = document.createElement('a');
      a.href = url;
      a.download = `cocktail-${slug}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <button
      onClick={handleExport}
      title={t('cocktails.export')}
      className={className || 'text-gray-400 hover:text-amber-400 text-sm transition-colors'}
    >
      <svg className="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </button>
  );
}
