import { describe, expect, it } from 'vitest';
import { contrastRatio, hostThemeOf, parseComputedColor } from '#app/host-theme.js';

/** The page resolves colours through the document; the test's are already computed. */
const compute = (value: string): string => value;

describe('hostThemeOf', () => {
  it("should take the host's focus ring as the accent and keep standard contrast for a subtle border", () => {
    expect(
      hostThemeOf({
        variables: {
          '--color-background-primary': 'rgb(255, 255, 255)',
          '--color-border-primary': 'rgb(229, 229, 229)',
          '--color-ring-primary': 'rgb(51, 102, 204)',
        },
        compute,
        prefersMoreContrast: false,
      }),
    ).toEqual({ isHighContrast: false, accentColor: '#3366cc' });
  });

  it('should read a strong primary border, or the system asking for more contrast, as high contrast', () => {
    const variables = { '--color-background-primary': 'rgb(0, 0, 0)', '--color-border-primary': 'rgb(255, 255, 255)' };

    expect(hostThemeOf({ variables, compute, prefersMoreContrast: false })).toEqual({
      isHighContrast: true,
      accentColor: undefined,
    });
    expect(hostThemeOf({ variables: undefined, compute, prefersMoreContrast: true }).isHighContrast).toBe(true);
  });
});

describe('parseComputedColor', () => {
  it('should read rgb and rgba, and drop a transparent or unknown colour', () => {
    expect(parseComputedColor('rgba(1, 2, 3, 0.5)')).toEqual([1, 2, 3]);
    expect(parseComputedColor('rgba(1, 2, 3, 0)')).toBeUndefined();
    expect(parseComputedColor('color(srgb 1 0 0)')).toBeUndefined();
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
  });
});
