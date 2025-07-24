import { describe, it, expect, vi } from 'vitest';
import { stringToColor } from '~/utils/color.utils.js';
import * as cryptoUtils from '~/utils/crypto.js';

describe('stringToColor', () => {
  it('should return a valid OKLCH color string for any input', () => {
    const inputs = ['stl', 'gltf', '3mf', 'step', 'obj'];

    for (const input of inputs) {
      const color = stringToColor(input);
      expect(color).toMatch(/^oklch\(var\(--l-medium\) 0\.2 \d+deg\)$/);
    }
  });

  it('should return consistent colors for the same input', () => {
    const input = 'test-extension';
    const color1 = stringToColor(input);
    const color2 = stringToColor(input);

    expect(color1).toBe(color2);
  });

  it('should return different colors for different inputs', () => {
    const color1 = stringToColor('stl');
    const color2 = stringToColor('gltf');
    const color3 = stringToColor('obj');

    expect(color1).not.toBe(color2);
    expect(color2).not.toBe(color3);
    expect(color1).not.toBe(color3);
  });

  it('should generate hue values within 0-359 range', () => {
    const testInputs = ['stl', 'gltf', 'obj', '3mf', 'step'];

    for (const input of testInputs) {
      const color = stringToColor(input);
      const hueRegex = /(\d+)deg/;
      const hueMatch = hueRegex.exec(color);
      expect(hueMatch).toBeTruthy();

      if (hueMatch?.[1]) {
        const hue = Number.parseInt(hueMatch[1], 10);
        expect(hue).toBeGreaterThanOrEqual(0);
        expect(hue).toBeLessThan(360);
      }
    }
  });

  it('should handle empty strings and special characters', () => {
    const edgeCases = ['', ' ', '!@#$%', '中文', '🎨'];

    for (const input of edgeCases) {
      expect(() => stringToColor(input)).not.toThrow();
      expect(stringToColor(input)).toMatch(/^oklch\(/);
    }
  });

  it('should use design system variables', () => {
    const color = stringToColor('test-input');

    expect(color).toContain('var(--l-medium)');
    expect(color).toContain('0.2');
  });

  it('should call hashCode internally', () => {
    const hashCodeSpy = vi.spyOn(cryptoUtils, 'hashCode');
    const input = 'test-input';

    stringToColor(input);

    expect(hashCodeSpy).toHaveBeenCalledWith(input);
    hashCodeSpy.mockRestore();
  });

  it('should generate well-distributed colors for similar inputs', () => {
    const extensions = ['stl', 'step', 'stp', 'stl-binary'];
    const colors = extensions.map((extension) => stringToColor(extension));
    const hues = colors.map((color) => {
      const hueRegex = /(\d+)deg/;
      const match = hueRegex.exec(color);
      return match?.[1] ? Number.parseInt(match[1], 10) : 0;
    });

    // Check that hues are reasonably distributed (not all clustered)
    const minHue = Math.min(...hues);
    const maxHue = Math.max(...hues);
    const hueRange = maxHue - minHue;

    // Should have some decent spread for different extensions
    expect(hueRange).toBeGreaterThan(50); // At least 50 degrees of spread
  });

  it('should provide consistent color mapping for file formats', () => {
    const formatColors = {
      stl: stringToColor('stl'),
      gltf: stringToColor('gltf'),
      obj: stringToColor('obj'),
      threeMf: stringToColor('3mf'),
    };

    // Same format should always give same color
    expect(stringToColor('stl')).toBe(formatColors.stl);
    expect(stringToColor('gltf')).toBe(formatColors.gltf);

    // All formats should have different colors
    const colorValues = Object.values(formatColors);
    const uniqueColors = new Set(colorValues);
    expect(uniqueColors.size).toBe(colorValues.length);
  });
});
