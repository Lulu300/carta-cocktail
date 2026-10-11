import { z } from 'zod';
import { Id, Position, RequiredText } from './common';

export const MenuSectionCreate = z.object({ name: RequiredText });

export const MenuSectionUpdate = z.object({
  name: RequiredText.optional(),
  position: Position.optional(),
});

export const MenuSectionReorder = z.object({ sectionIds: z.array(Id) });
