import { z } from 'zod';
import { Id, Position, RequiredText } from './common';

export const MENU_TYPES = ['COCKTAILS', 'APEROS', 'DIGESTIFS'] as const;

const MenuItem = z.object({
  position: Position.optional(),
  isHidden: z.boolean().optional(),
  menuSectionId: Id.nullish(),
});

export const MenuCreate = z.object({
  name: RequiredText,
  slug: RequiredText,
  description: z.string().nullish(),
  isPublic: z.boolean().optional(),
  type: z.enum(MENU_TYPES).optional(),
});

/** When `cocktails` or `bottles` is sent, it replaces the whole list of the menu. */
export const MenuUpdate = MenuCreate.partial().extend({
  cocktails: z.array(MenuItem.extend({ cocktailId: Id })).optional(),
  bottles: z.array(MenuItem.extend({ bottleId: Id })).optional(),
});
