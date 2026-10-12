import { useState, useEffect } from 'react';
import { publicApi } from '../../services/api';
import { isConvertible, getAllConversions } from '../../utils/unitConverter';
import type { Unit } from '../../types';
import { cx } from './classNames';
import Icon from './Icon';
import { useDisclosure } from './useDisclosure';

interface UnitConverterProps {
  quantity: number;
  unit: string; // abbreviation
}

export default function UnitConverter({ quantity, unit: unitAbbr }: UnitConverterProps) {
  const { isOpen, closeAndFocusTrigger, panelId, containerRef, handleKeyDown, triggerProps } = useDisclosure();
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(quantity);

  // Fetch units on mount
  useEffect(() => {
    publicApi.listUnits().then(setUnits).catch(() => {});
  }, []);

  // Find the current unit object
  const currentUnit = units.find(u => u.abbreviation === unitAbbr);

  const canConvert = currentUnit && isConvertible(currentUnit);

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
    closeAndFocusTrigger();
  };

  const handleReset = () => {
    setSelectedUnit(currentUnit);
    setSelectedQuantity(quantity);
    closeAndFocusTrigger();
  };

  const isChanged = selectedUnit !== null && selectedUnit.id !== currentUnit.id;
  const displayUnit = selectedUnit || currentUnit;

  return (
    <div className="relative inline-block" ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        {...triggerProps}
        className="font-medium inline-flex items-center gap-1 transition-colors text-accent hover:text-accent-soft cursor-pointer print:text-black"
      >
        <span>{selectedQuantity} {displayUnit.abbreviation}</span>
        <Icon
          name="chevron-down"
          className={cx('size-3 transition-transform motion-reduce:transition-none print:hidden', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div
          id={panelId}
          className="absolute left-0 top-full mt-1 w-48 bg-surface border border-line-strong rounded-lg shadow-lg overflow-hidden z-50"
        >
          {/* Original value */}
          <div className="px-3 py-2 bg-line/50 border-b border-line-strong">
            <div className="text-xs text-fg-muted mb-1">Unité originale</div>
            <button
              type="button"
              onClick={handleReset}
              aria-pressed={!isChanged}
              className={cx('w-full text-left text-sm', isChanged ? 'text-fg hover:text-accent' : 'text-accent font-medium')}
            >
              {quantity} {currentUnit.abbreviation}
              {!isChanged && <span aria-hidden="true" className="ml-2">✓</span>}
            </button>
          </div>

          {/* Conversions */}
          <div className="py-1">
            <div className="px-3 py-1 text-xs text-fg-muted">Convertir en:</div>
            {conversions.map((conv) => {
              const isSelected = selectedUnit?.id === conv.unit.id;
              return (
                <button
                  key={conv.unit.id}
                  type="button"
                  onClick={() => handleUnitSelect(conv.unit, conv.formatted)}
                  aria-pressed={isSelected}
                  className={cx(
                    'w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between',
                    isSelected ? 'bg-accent/10 text-accent' : 'text-fg hover:bg-line',
                  )}
                >
                  <span>{conv.formatted} {conv.unit.abbreviation}</span>
                  {isSelected && <span aria-hidden="true" className="text-accent">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
