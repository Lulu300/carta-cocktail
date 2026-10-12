/** A slug holds lowercase letters, digits and dashes only. */
export function toSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}
