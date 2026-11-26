import type { ReactNode } from 'react';

/**
 * Lets a table wider than its card scroll on its own, so the page does not.
 * Keep it around the `<table>` only: the pagination and messages of the card stay in place.
 */
export default function ScrollableTable({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}
