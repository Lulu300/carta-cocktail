import { z } from 'zod';
import { Id, MenuIdParams, PathId, Position } from './common';

export const MenuBottleCreate = z.object({
  menuId: Id,
  bottleId: Id,
  // Absent: after the last bottle of the menu
  position: Position.optional(),
  isHidden: z.boolean().optional(),
  // Absent or null: outside any section
  menuSectionId: Id.nullable().optional(),
});

export const MenuBottleUpdate = z.object({
  position: Position.optional(),
  isHidden: z.boolean().optional(),
  // null takes the bottle out of its section
  menuSectionId: Id.nullable().optional(),
});

/** Every entry (`MenuBottle.id`) of the menu, in its new order. */
export const MenuBottleReorder = z.object({ ids: z.array(Id) });

/** Bottles removed together from a system menu (a group of the editor). */
export const MenuBottleExclusionCreate = z.object({
  bottleIds: z.array(Id).min(1),
});

export const MenuBottleExclusionParams = MenuIdParams.extend({ bottleId: PathId });
