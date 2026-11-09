import { describe, expect, it } from 'vitest';
import { terminalTextRendering } from '#components/terminal/terminal-theme.js';

describe('terminalTextRendering', () => {
  it('should thin dark text on a light background with linear blending', () => {
    expect(terminalTextRendering({ background: '#ffffff' }, false)).toEqual({
      textBlending: 'linear',
      textWeight: 0.65,
      fontWeight: 400,
    });
    expect(terminalTextRendering({ background: '#f5f5f5' }, false).textBlending).toBe('linear');
  });

  it('should keep sRGB weight on a dark background and thin it with the coverage exponent', () => {
    expect(terminalTextRendering({ background: '#141414' }, false)).toEqual({
      textBlending: 'linear-corrected',
      textWeight: 1.15,
      fontWeight: 400,
    });
    expect(terminalTextRendering({ background: '#000000' }, false).textBlending).toBe('linear-corrected');
  });

  it('should draw a lighter face on macOS, whose glyph rasterizer adds stroke width', () => {
    expect(terminalTextRendering({ background: '#ffffff' }, true)).toEqual({
      textBlending: 'linear',
      textWeight: 1.4,
      fontWeight: 300,
    });
    expect(terminalTextRendering({ background: '#141414' }, true)).toEqual({
      textBlending: 'linear-corrected',
      textWeight: 1.15,
      fontWeight: 300,
    });
  });
});
