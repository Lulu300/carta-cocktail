import { z } from 'zod';
import { Id, Position } from './common';

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
