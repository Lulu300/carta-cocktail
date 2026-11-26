/** Joins the non-empty parts of a tab title: "Mojito · Summer menu · My Bar". */
export function joinTitle(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ');
}
