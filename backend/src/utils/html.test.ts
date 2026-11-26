import { describe, it, expect } from 'vitest';
import { escapeHtml } from './html';

describe('escapeHtml', () => {
  it('should escape the characters that open a tag, an entity or close an attribute', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`))
      .toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
  });

  it('should escape an ampersand once, even before an entity', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('should keep any other text as it is', () => {
    expect(escapeHtml('Piña colada · été')).toBe('Piña colada · été');
  });
});
