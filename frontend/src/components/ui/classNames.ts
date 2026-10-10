type ClassValue = string | false | null | undefined;

/** Joins the truthy class names, so conditional classes stay readable. */
export function cx(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Keyboard focus ring shared by every interactive primitive. */
export const focusRingClasses =
  'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2';
