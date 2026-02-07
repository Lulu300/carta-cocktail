import { useState } from 'react';

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

const commonEmojis = [
  // Agrumes / Citrus
  '🍋', '🟡', '🍊', '🟠',
  // Fruits rouges / Berries
  '🍒', '🍓', '🫐', '🍇',
  // Fruits tropicaux / Tropical
  '🍍', '🥭', '🥥', '🍌', '🍑', '🍉', '🍈', '🥝',
  // Fruits à pépins / Stone fruits
  '🍎', '🍏', '🍐', '🍅',
  // Herbes aromatiques / Aromatic herbs
  '🌿', '🍃', '🌱', '🪴',
  // Légumes / Vegetables
  '🥒', '🌶️', '🫑', '🥕', '🧅', '🧄', '🌽',
  // Épices & Aromates / Spices
  '🫚', '⭐',
  // Sucreries & Sirops / Sweeteners & Syrups
  '🍯', '🧂', '🧊', '🍬',
  // Produits laitiers / Dairy
  '🥛', '🧈', '🥚',
  // Noix & Graines / Nuts & Seeds
  '🥜', '🌰',
  // Olives & Fruits secs
  '🫒',
  // Fleurs & Déco naturelle / Flowers & Natural garnish
  '🌸', '🌺', '🌹', '🏵️',
  // Autres / Other
  '💧', '☕',
];

export default function IconPicker({ value, onChange }: IconPickerProps) {
  const [customInput, setCustomInput] = useState('');

  const handleEmojiClick = (emoji: string) => {
    onChange(emoji);
  };

  const handleCustomSubmit = () => {
    if (customInput.trim()) {
      onChange(customInput.trim());
      setCustomInput('');
    }
  };

  return (
    <div className="space-y-3">
      {/* Helper text */}
      <div className="text-xs text-gray-500">
        Sélectionne un emoji pour représenter cet ingrédient
      </div>

      <div className="grid grid-cols-10 gap-2 max-h-64 overflow-y-auto p-2 bg-[#0f0f1a]/50 rounded-lg">
        {commonEmojis.map((emoji, idx) => (
          <button
            key={`${emoji}-${idx}`}
            type="button"
            onClick={() => handleEmojiClick(emoji)}
            className={`
              text-2xl p-2 rounded-lg border transition-all
              ${value === emoji
                ? 'border-amber-400 bg-amber-400/10 scale-110 shadow-lg shadow-amber-400/20'
                : 'border-gray-700 bg-[#1a1a2e] hover:border-amber-400/50 hover:bg-amber-400/5'
              }
            `}
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCustomSubmit())}
          placeholder="Ou collez un emoji personnalisé..."
          className="flex-1 bg-[#0f0f1a] border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-amber-400"
        />
        <button
          type="button"
          onClick={handleCustomSubmit}
          disabled={!customInput.trim()}
          className="bg-amber-400/20 hover:bg-amber-400/30 disabled:bg-gray-800 disabled:text-gray-600 text-amber-400 px-4 py-2 rounded-lg transition-colors"
        >
          OK
        </button>
      </div>

      {value && (
        <div className="flex items-center justify-between p-3 bg-[#0f0f1a] border border-gray-700 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{value}</span>
            <span className="text-sm text-gray-400">Sélectionné</span>
          </div>
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-red-400 hover:text-red-300 text-sm"
          >
            Effacer
          </button>
        </div>
      )}
    </div>
  );
}
