import { describe, expect, it } from 'vitest';
import { renderImageLabelMaxLength, renderImageLabelPattern } from 'nanoraster';
import { normalizeImageLabel } from '#image-label.js';

describe('normalizeImageLabel', () => {
  it('preserves a short supported path and replaces unsupported characters', () => {
    expect(normalizeImageLabel('/parts/bracket.ts')).toBe('/parts/bracket.ts');
    expect(normalizeImageLabel('/parts/☃.ts')).toBe('/parts/?.ts');
  });

  it('middle-elides the path while preserving the complete view suffix', () => {
    const normalized = normalizeImageLabel(`/very/${'long/'.repeat(20)}bracket.ts`, 'Front — View From −Y');
    expect([...normalized]).toHaveLength(renderImageLabelMaxLength);
    expect(normalized).toContain('...');
    expect(normalized.endsWith(' — Front — View From −Y')).toBe(true);
    expect(normalized).toMatch(new RegExp(renderImageLabelPattern, 'u'));
  });
});
