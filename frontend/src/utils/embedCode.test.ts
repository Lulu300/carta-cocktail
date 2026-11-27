import { describe, expect, it } from 'vitest';
import { buildEmbedCode } from './embedCode';

describe('buildEmbedCode', () => {
  it('gives an iframe of the menu, named after the site', () => {
    expect(buildEmbedCode('https://carta.example/menu/summer', 'My Bar')).toBe(
      '<iframe src="https://carta.example/menu/summer" title="My Bar" loading="lazy" ' +
        'style="width: 100%; height: 80vh; border: 0"></iframe>',
    );
  });

  it('escapes a site name that would end the attribute or open a tag', () => {
    const code = buildEmbedCode('https://carta.example/menu/a?b=1&c=2', 'Tom & "Jerry" <bar>');
    expect(code).toContain('src="https://carta.example/menu/a?b=1&amp;c=2"');
    expect(code).toContain('title="Tom &amp; &quot;Jerry&quot; &lt;bar>"');
  });
});
