import { escapeHtml } from '../utils/html';

// Default of SiteSettings.siteName, and the title the SPA shows when the admin left the name empty
const FALLBACK_SITE_NAME = 'Carta Cocktail';

/** What a link preview shows: every value is plain text, escaped by renderSharePage(). */
export interface SharePreview {
  /** Name of the menu or the cocktail. */
  pageName: string;
  siteName: string;
  description: string | null;
  /** Absolute URL of the page a guest opens. */
  pageUrl: string;
  /** Absolute URL of the photo, or null when there is none. */
  imageUrl: string | null;
}

function metaTag(attribute: 'name' | 'property', key: string, content: string): string {
  return `<meta ${attribute}="${key}" content="${escapeHtml(content)}">`;
}

/**
 * Minimal HTML page with the Open Graph and Twitter tags of a public menu or
 * cocktail. Only the link preview robots of messaging apps get it (nginx picks
 * them by User-Agent): they do not run JavaScript, so the SPA tells them nothing.
 * No script and no style, so the Content-Security-Policy of the site applies as is.
 */
export function renderSharePage(preview: SharePreview): string {
  const { pageName, description, pageUrl, imageUrl } = preview;
  const siteName = preview.siteName || FALLBACK_SITE_NAME;
  // "Mojito · My Bar", as the browser tab of the page
  const title = `${pageName} · ${siteName}`;
  const tags = [
    metaTag('property', 'og:type', 'website'),
    metaTag('property', 'og:site_name', siteName),
    metaTag('property', 'og:title', title),
    metaTag('property', 'og:url', pageUrl),
    metaTag('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary'),
  ];
  if (description) {
    tags.push(metaTag('name', 'description', description), metaTag('property', 'og:description', description));
  }
  if (imageUrl) {
    tags.push(metaTag('property', 'og:image', imageUrl));
  }
  const link = `<a href="${escapeHtml(pageUrl)}">${escapeHtml(title)}</a>`;
  const body = description ? `<h1>${link}</h1>\n<p>${escapeHtml(description)}</p>` : `<h1>${link}</h1>`;

  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(pageUrl)}">`,
    ...tags,
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
