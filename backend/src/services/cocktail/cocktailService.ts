import { prisma } from '../../lib/prisma';
import { removeImageFile } from './cocktailImage';

/**
 * Deletes a cocktail, then its photo. The row goes first: if the deletion fails,
 * the cocktail keeps its photo. A missing cocktail ends in a 404 (Prisma P2025).
 */
export async function removeCocktail(id: number): Promise<void> {
  const { imagePath } = await prisma.cocktail.delete({ where: { id }, select: { imagePath: true } });
  if (imagePath) await removeImageFile(imagePath);
}
