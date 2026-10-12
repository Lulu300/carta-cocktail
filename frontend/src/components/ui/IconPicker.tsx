import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from './Button';
import Input from './Input';
import { cx } from './classNames';

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

const commonEmojis = [
  // Citrus
  '🍋', '🟡', '🍊', '🟠',
  // Berries
  '🍒', '🍓', '🫐', '🍇',
  // Tropical fruits
  '🍍', '🥭', '🥥', '🍌', '🍑', '🍉', '🍈', '🥝',
  // Pome fruits
  '🍎', '🍏', '🍐', '🍅',
  // Aromatic herbs
  '🌿', '🍃', '🌱', '🪴',
  // Vegetables
  '🥒', '🌶️', '🫑', '🥕', '🧅', '🧄', '🌽',
  // Spices
  '🫚', '⭐',
  // Sweeteners and syrups
  '🍯', '🧂', '🧊', '🍬',
  // Dairy
  '🥛', '🧈', '🥚',
  // Nuts and seeds
  '🥜', '🌰',
  // Olives
  '🫒',
  // Flowers and natural garnish
  '🌸', '🌺', '🌹', '🏵️',
  // Other
  '💧', '☕',
];

export default function IconPicker({ value, onChange }: IconPickerProps) {
  const { t } = useTranslation();
  const [customInput, setCustomInput] = useState('');

  const handleCustomSubmit = () => {
    if (customInput.trim()) {
      onChange(customInput.trim());
      setCustomInput('');
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">{t('iconPicker.hint')}</p>

      <div
        role="group"
        aria-label={t('iconPicker.suggestions')}
        className="grid grid-cols-10 gap-2 max-h-64 overflow-y-auto p-2 bg-canvas/50 rounded-lg"
      >
        {commonEmojis.map((emoji) => {
          const isSelected = value === emoji;
          // Emojis have no reliable name across screen readers: a generic one says what the button does.
          const label = t('iconPicker.emoji', { emoji });
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange(emoji)}
              aria-pressed={isSelected}
              aria-label={label}
              title={label}
              className={cx(
                'text-2xl p-2 rounded-lg border transition-colors',
                isSelected
                  ? 'border-accent bg-accent/10 shadow-lg shadow-accent/20'
                  : 'border-line-strong bg-surface hover:border-accent/50 hover:bg-accent/5',
              )}
            >
              {emoji}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCustomSubmit())}
          aria-label={t('iconPicker.customLabel')}
          placeholder={t('iconPicker.customPlaceholder')}
          className="flex-1"
        />
        <Button variant="secondary" onClick={handleCustomSubmit} disabled={!customInput.trim()}>
          {t('iconPicker.useCustom')}
        </Button>
      </div>

      {value && (
        <div className="flex items-center justify-between p-3 bg-canvas border border-line-strong rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{value}</span>
            <span className="text-sm text-fg-muted">{t('iconPicker.selected')}</span>
          </div>
          <Button variant="danger" size="sm" onClick={() => onChange('')}>
            {t('common.clear')}
          </Button>
        </div>
      )}
    </div>
  );
}
