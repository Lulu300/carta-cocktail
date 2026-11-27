function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

/**
 * The code a bar pastes in its website to show a public menu. The title names the frame for
 * screen readers; the height leaves room for the menu while the bar's page stays visible.
 */
export function buildEmbedCode(menuUrl: string, title: string): string {
  return (
    `<iframe src="${escapeAttribute(menuUrl)}" title="${escapeAttribute(title)}" loading="lazy" ` +
    'style="width: 100%; height: 80vh; border: 0"></iframe>'
  );
}
