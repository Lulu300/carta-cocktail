import { useState, useRef, useEffect } from 'react';
import { units as unitsApi } from '../../services/api';
import { isConvertible, getAllConversions } from '../../utils/unitConverter';
import type { Unit } from '../../types';

interface UnitConverterProps {
  quantity: number;
  unit: string; // abbreviation
}

export default function UnitConverter({ quantity, unit: unitAbbr }: UnitConverterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(quantity);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch units on mount
  useEffect(() => {
    unitsApi.list().then(setUnits);
  }, []);

  // Find the current unit object
  const currentUnit = units.find(u => u.abbreviation === unitAbbr);

  // Set initial selected unit when units are loaded
  useEffect(() => {
    if (currentUnit && !selectedUnit) {
      setSelectedUnit(currentUnit);
    }
  }, [currentUnit, selectedUnit]);

  const canConvert = currentUnit && isConvertible(currentUnit);

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

  if (!currentUnit || !canConvert) {
    // Non-convertible units or units not loaded yet
    return (
      <span className="font-medium">
        {quantity} {unitAbbr}
      </span>
    );
  }

  const conversions = getAllConversions(quantity, currentUnit, units);

  const handleUnitSelect = (newUnit: Unit, formatted: string) => {
    setSelectedUnit(newUnit);
    setSelectedQuantity(parseFloat(formatted));
    setIsOpen(false);
  };

  const handleReset = () => {
    setSelectedUnit(currentUnit);
    setSelectedQuantity(quantity);
    setIsOpen(false);
  };

  const isChanged = selectedUnit?.id !== currentUnit.id;
  const displayUnit = selectedUnit || currentUnit;

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="font-medium inline-flex items-center gap-1 transition-colors text-amber-400 hover:text-amber-300 cursor-pointer print:text-black"
      >
        <span>{selectedQuantity} {displayUnit.abbreviation}</span>
        <svg
          className={`w-3 h-3 transition-transform print:hidden ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
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
              {quantity} {currentUnit.abbreviation}
              {!isChanged && <span className="ml-2">✓</span>}
            </button>
          </div>

          {/* Conversions */}
          <div className="py-1">
            <div className="px-3 py-1 text-xs text-gray-500">Convertir en:</div>
            {conversions.map((conv) => (
              <button
                key={conv.unit.id}
                onClick={() => handleUnitSelect(conv.unit, conv.formatted)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                  selectedUnit?.id === conv.unit.id
                    ? 'bg-amber-400/10 text-amber-400'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span>{conv.formatted} {conv.unit.abbreviation}</span>
                {selectedUnit?.id === conv.unit.id && <span className="text-amber-400">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
