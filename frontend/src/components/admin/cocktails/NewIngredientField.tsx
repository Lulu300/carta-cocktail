import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateIngredient } from '../../../queries/ingredients';
import Button from '../../ui/Button';
import Input from '../../ui/Input';

/**
 * Creates a free ingredient without leaving the recipe. It sits inside the
 * cocktail form, so it cannot be a form of its own: Enter is handled here.
 */
export default function NewIngredientField({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createIngredient = useCreateIngredient();
  const [name, setName] = useState('');

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createIngredient.mutate(trimmed, {
      onSuccess: () => {
        setName('');
        onDone();
      },
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    // Enter would submit the cocktail form.
    event.preventDefault();
    create();
  };

  return (
    <div className="flex gap-2 mb-4">
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label={t('ingredients.name')}
        placeholder={t('ingredients.name')}
        className="flex-1 px-3 py-1.5 text-sm"
      />
      <Button size="sm" onClick={create} loading={createIngredient.isPending}>{t('common.create')}</Button>
    </div>
  );
}
