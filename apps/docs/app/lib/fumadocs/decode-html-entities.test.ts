import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '#lib/fumadocs/decode-html-entities.js';

describe('decodeHtmlEntities', () => {
  it('decodes hex numeric character references', () => {
    expect(decodeHtmlEntities('&#x2A;')).toBe('*');
    expect(decodeHtmlEntities('&#x22;')).toBe('"');
    expect(decodeHtmlEntities('&#x60;')).toBe('`');
  });

  it('decodes decimal numeric character references', () => {
    expect(decodeHtmlEntities('&#42;')).toBe('*');
  });

  it('decodes common named entities', () => {
    expect(decodeHtmlEntities('&amp; &lt; &gt; &quot; &apos;')).toBe('& < > " \'');
  });

  it('leaves unknown named entities untouched', () => {
    expect(decodeHtmlEntities('&foo;')).toBe('&foo;');
  });

  it('leaves bare ampersands untouched', () => {
    expect(decodeHtmlEntities('a & b')).toBe('a & b');
  });

  it('is idempotent on decoded text', () => {
    const once = decodeHtmlEntities('&#x22;hello&#x22;');
    expect(decodeHtmlEntities(once)).toBe(once);
  });
});
