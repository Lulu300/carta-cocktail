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

/**
 * Most bottles one group request can name. A group of the editor holds the identical bottles
 * of one product: far fewer than this in any bar. The bound keeps the request and its
 * transaction small, as MAX_EXPORT_BATCH does for the cocktail export.
 */
export const MAX_GROUP_BOTTLES = 500;

const GroupIds = z.array(Id).min(1).max(MAX_GROUP_BOTTLES);

/** Bottles added to a personal menu, or removed from or put back in a system menu, together (a group of the editor). */
export const MenuBottleIds = z.object({
  bottleIds: GroupIds,
});

/** Several entries (`MenuBottle.id`) of a menu, e.g. a group of the editor. */
export const MenuBottleEntryIds = z.object({
  ids: GroupIds,
});

/** One change for several entries of a menu. Each keeps its position. */
export const MenuBottleGroupUpdate = MenuBottleUpdate.omit({ position: true }).extend(
  MenuBottleEntryIds.shape,
);

export const MenuBottleExclusionParams = MenuIdParams.extend({ bottleId: PathId });
