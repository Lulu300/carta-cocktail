/**
 * A copy of the list with the item at `from` moved to `to`. An index outside the
 * list leaves the order unchanged.
 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const result = [...list];
  if (!isIndexOf(result, from) || !isIndexOf(result, to)) return result;

  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved);
  return result;
}

function isIndexOf(list: unknown[], index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < list.length;
}

/** The items in the order of `ids`, each with its new position; an item missing from `ids` is left out. */
export function orderByIds<T extends { id: number; position: number }>(items: T[], ids: number[]): T[] {
  return ids
    .flatMap((id) => items.filter((item) => item.id === id))
    .map((item, position) => ({ ...item, position }));
}
