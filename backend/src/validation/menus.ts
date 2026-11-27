import { z } from 'zod';
import { Id, Position, RequiredText, Timestamp } from './common';

export const MENU_TYPES = ['COCKTAILS', 'APEROS', 'DIGESTIFS'] as const;
export const MenuType = z.enum(MENU_TYPES);
export type MenuType = z.output<typeof MenuType>;

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
  type: MenuType.optional(),
});

/** When `cocktails` or `bottles` is sent, it replaces the whole list of the menu. */
export const MenuUpdate = MenuCreate.partial().extend({
  cocktails: z.array(MenuItem.extend({ cocktailId: Id })).optional(),
  bottles: z.array(MenuItem.extend({ bottleId: Id })).optional(),
});

/** A menu as stored, without its items. */
export const MenuRow = z.strictObject({
  id: Id,
  name: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  type: MenuType,
  isPublic: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

/** The fields shared by the cocktails and the bottles of a menu. */
export const MenuItemRow = z.strictObject({
  id: Id,
  menuId: Id,
  menuSectionId: Id.nullable(),
  position: z.number().int(),
  isHidden: z.boolean(),
});
