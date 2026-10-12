import { useTranslation } from 'react-i18next';
import { bottles as bottlesApi } from '../../../services/api';
import Button from '../../ui/Button';
import { toast } from '../../ui/ToastStore';
import { useDisclosure } from '../../ui/useDisclosure';

type ExportFormat = 'json' | 'csv';

export interface BottleExportFilters {
  categoryId?: number;
  search?: string;
  location?: string;
}

const MENU_ITEM_CLASSES = 'block w-full text-left px-4 py-2 text-sm text-fg hover:bg-accent/10 hover:text-accent';

/** "Export" button with its JSON / CSV choices, applied to the bottles the filters show. */
export default function ExportMenu({ filters }: { filters: BottleExportFilters }) {
  const { t } = useTranslation();
  const { isOpen, closeAndFocusTrigger, panelId, containerRef, handleKeyDown, triggerProps } = useDisclosure();

  const handleExport = async (format: ExportFormat) => {
    closeAndFocusTrigger();
    try {
      await bottlesApi.exportFile(format, filters);
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <div ref={containerRef} onKeyDown={handleKeyDown} className="relative">
      <Button variant="secondary" {...triggerProps}>
        {t('bottles.export')}
      </Button>
      {isOpen && (
        <div id={panelId} className="absolute right-0 mt-1 bg-surface border border-line-strong rounded-lg shadow-lg z-20 min-w-36">
          <button type="button" onClick={() => handleExport('json')} className={MENU_ITEM_CLASSES}>
            {t('bottles.exportJson')}
          </button>
          <button type="button" onClick={() => handleExport('csv')} className={MENU_ITEM_CLASSES}>
            {t('bottles.exportCsv')}
          </button>
        </div>
      )}
    </div>
  );
}
