import { z } from 'zod';
import { Id, MenuIdParams, Position } from './common';

export const MenuBottleCreate = z.object({
  menuId: Id,
  bottleId: Id,
  position: Position.optional(),
  isHidden: z.boolean().optional(),
});

export const MenuBottleUpdate = z.object({
  position: Position.optional(),
  isHidden: z.boolean().optional(),
  // null takes the bottle out of its section
  menuSectionId: Id.nullable().optional(),
});

/** Bottles removed together from a system menu (a group of the editor). */
export const MenuBottleExclusionCreate = z.object({
  bottleIds: z.array(Id).min(1),
});

export const MenuBottleExclusionParams = MenuIdParams.extend({
  bottleId: z.coerce.number().int().positive(),
});
