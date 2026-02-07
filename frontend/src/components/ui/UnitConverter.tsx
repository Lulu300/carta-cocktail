import { useState, useRef, useEffect } from 'react';
import { isConvertible, getAllConversions } from '../../utils/unitConverter';

interface UnitConverterProps {
  quantity: number;
  unit: string;
}

export default function UnitConverter({ quantity, unit }: UnitConverterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(unit);
  const [selectedQuantity, setSelectedQuantity] = useState(quantity);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const canConvert = isConvertible(unit);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!canConvert) {
    // Non-convertible units (pieces, leaves, etc.)
    return (
      <span className="font-medium">
        {quantity} {unit}
      </span>
    );
  }

  const conversions = getAllConversions(quantity, unit);

  const handleUnitSelect = (newUnit: string, newQuantity: number, formatted: string) => {
    setSelectedUnit(newUnit);
    setSelectedQuantity(parseFloat(formatted));
    setIsOpen(false);
  };

  const handleReset = () => {
    setSelectedUnit(unit);
    setSelectedQuantity(quantity);
    setIsOpen(false);
  };

  const isChanged = selectedUnit !== unit;

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`font-medium inline-flex items-center gap-1 transition-colors ${
          canConvert
            ? 'text-amber-400 hover:text-amber-300 cursor-pointer print:text-black'
            : 'text-gray-300 print:text-black'
        }`}
      >
        <span>{selectedQuantity} {selectedUnit}</span>
        {canConvert && (
          <svg
            className={`w-3 h-3 transition-transform print:hidden ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {isOpen && canConvert && (
        <div className="absolute left-0 top-full mt-1 w-48 bg-[#1a1a2e] border border-gray-700 rounded-lg shadow-lg overflow-hidden z-50">
          {/* Original value */}
          <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Unité originale</div>
            <button
              onClick={handleReset}
              className={`w-full text-left text-sm ${
                isChanged
                  ? 'text-gray-300 hover:text-amber-400'
                  : 'text-amber-400 font-medium'
              }`}
            >
              {quantity} {unit}
              {!isChanged && <span className="ml-2">✓</span>}
            </button>
          </div>

          {/* Conversions */}
          <div className="py-1">
            <div className="px-3 py-1 text-xs text-gray-500">Convertir en:</div>
            {conversions.map((conv) => (
              <button
                key={conv.unit}
                onClick={() => handleUnitSelect(conv.unit, conv.quantity, conv.formatted)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                  selectedUnit === conv.unit
                    ? 'bg-amber-400/10 text-amber-400'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span>{conv.formatted} {conv.unit}</span>
                {selectedUnit === conv.unit && <span className="text-amber-400">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
