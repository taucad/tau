import { describe, expect, it } from 'vitest';
import { terminalTextRendering } from '#components/terminal/terminal-theme.js';

describe('terminalTextRendering', () => {
  it('should thin dark text on a light background with linear blending', () => {
    expect(terminalTextRendering({ background: '#ffffff' })).toEqual({ textBlending: 'linear', textWeight: 0.65 });
    expect(terminalTextRendering({ background: '#f5f5f5' })).toEqual({ textBlending: 'linear', textWeight: 0.65 });
  });

  it('should keep sRGB weight on a dark background and thin it with the coverage exponent', () => {
    expect(terminalTextRendering({ background: '#141414' })).toEqual({
      textBlending: 'linear-corrected',
      textWeight: 1.15,
    });
    expect(terminalTextRendering({ background: '#000000' }).textBlending).toBe('linear-corrected');
  });
});
