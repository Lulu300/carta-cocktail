import type { Bottle, Category } from '../../../types';

const DEFAULT_CAPACITY_ML = 700;
const MAX_QUANTITY = 50;

export interface BottleForm {
  name: string;
  categoryId: number;
  /** Kept as typed: empty means no price. */
  purchasePrice: string;
  capacityMl: number;
  remainingPercent: number;
  /** Date part only (YYYY-MM-DD), empty for a sealed bottle. */
  openedAt: string;
  /** Kept as typed: empty means unknown. */
  alcoholPercentage: string;
  location: string;
  isApero: boolean;
  isDigestif: boolean;
  /** Identical bottles to create at once; creation only. */
  quantity: number;
}

export interface BottleInput {
  name: string;
  categoryId: number;
  purchasePrice: number | null;
  capacityMl: number;
  remainingPercent: number;
  openedAt: string | null;
  alcoholPercentage: number | null;
  location: string | null;
  isApero: boolean;
  isDigestif: boolean;
  quantity?: number;
}

/** A new bottle goes in the first category, full and sealed. */
export function toBottleForm(categories: Category[], bottle?: Bottle): BottleForm {
  return {
    name: bottle?.name ?? '',
    categoryId: bottle?.categoryId ?? categories[0]?.id ?? 0,
    purchasePrice: bottle?.purchasePrice?.toString() ?? '',
    capacityMl: bottle?.capacityMl ?? DEFAULT_CAPACITY_ML,
    remainingPercent: bottle?.remainingPercent ?? 100,
    openedAt: bottle?.openedAt ? bottle.openedAt.split('T')[0] : '',
    alcoholPercentage: bottle?.alcoholPercentage?.toString() ?? '',
    location: bottle?.location ?? '',
    isApero: bottle?.isApero ?? false,
    isDigestif: bottle?.isDigestif ?? false,
    quantity: 1,
  };
}

export function toBottleInput(form: BottleForm): BottleInput {
  return {
    name: form.name,
    categoryId: form.categoryId,
    purchasePrice: form.purchasePrice ? parseFloat(form.purchasePrice) : null,
    capacityMl: form.capacityMl,
    remainingPercent: form.remainingPercent,
    openedAt: form.openedAt || null,
    alcoholPercentage: form.alcoholPercentage ? parseFloat(form.alcoholPercentage) : null,
    location: form.location || null,
    isApero: form.isApero,
    isDigestif: form.isDigestif,
  };
}

export function clampQuantity(value: string): number {
  return Math.max(1, Math.min(MAX_QUANTITY, parseInt(value) || 1));
}
