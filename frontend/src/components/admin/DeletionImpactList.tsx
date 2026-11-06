import { useTranslation } from 'react-i18next';
import type { DeletionImpact } from '../../types';

/** The cocktails and bottles a forced deletion changes, shown before the admin confirms it. */
export default function DeletionImpactList({ impact }: { impact: DeletionImpact }) {
  const { t } = useTranslation();
  const { cocktails, bottles } = impact;

  return (
    <div className="space-y-3">
      {cocktails.length > 0 && (
        <div>
          <p className="font-medium">{t('deletion.forced.cocktails', { count: cocktails.length })}</p>
          <ul className="mt-1 list-disc pl-5">
            {cocktails.map((cocktail) => (
              <li key={cocktail.id}>
                {t('deletion.forced.cocktailLines', { name: cocktail.name, count: cocktail.removedLines })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {bottles.length > 0 && (
        <div>
          <p className="font-medium">{t('deletion.forced.bottles', { count: bottles.length })}</p>
          <ul className="mt-1 list-disc pl-5">
            {bottles.map((bottle) => <li key={bottle.id}>{bottle.name}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
