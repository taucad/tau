import { describe, expect, it } from 'vitest';
import type { RenderImageOptions } from '#options.js';
import { imageFileName, imageViewFileName, toImageRequestJson, toImagesRequestJson } from '#options.js';

const parse = (json: string): Record<string, unknown> => JSON.parse(json) as Record<string, unknown>;

describe('image request serialization', () => {
  it('should omit undefined fields and serialize includeAxes', () => {
    expect(parse(toImageRequestJson({ format: 'webp', includeAxes: false }))).toEqual({
      format: 'webp',
      includeAxes: false,
    });
  });

  it('should serialize every singular option and normalize a hex background', () => {
    const options: RenderImageOptions = {
      format: 'jpeg',
      width: 1920,
      height: 1080,
      quality: 0.8,
      phi: 45,
      theta: 90,
      margin: 0.25,
      up: 'z',
      projection: 'orthographic',
      background: '#FF800040',
      includeAxes: true,
    };

    expect(parse(toImageRequestJson(options))).toEqual({
      format: 'jpeg',
      width: 1920,
      height: 1080,
      quality: 0.8,
      phi: 45,
      theta: 90,
      margin: 0.25,
      up: 'z',
      projection: 'orthographic',
      background: [1, 128 / 255, 0, 64 / 255],
      includeAxes: true,
    });
  });

  it('should serialize ordered plural views and shared settings', () => {
    expect(
      parse(
        toImagesRequestJson({
          format: 'png',
          projection: 'orthographic',
          views: [
            { id: 'front', phi: 90, theta: 0 },
            { id: 'top', phi: 0, theta: 0 },
          ],
        }),
      ),
    ).toEqual({
      format: 'png',
      projection: 'orthographic',
      views: [
        { id: 'front', phi: 90, theta: 0 },
        { id: 'top', phi: 0, theta: 0 },
      ],
    });
  });

  it('should reject invalid values and unknown keys', () => {
    const invalid: unknown[] = [
      { format: 'png', width: 15 },
      { format: 'png', phi: Number.NaN },
      { format: 'png', background: '#fff' },
      { format: 'png', includeAxes: 'yes' },
      { format: 'png', extra: true },
    ];
    for (const options of invalid) {
      expect(() => toImageRequestJson(options as RenderImageOptions)).toThrow(TypeError);
    }
  });

  it('should reject invalid plural views', () => {
    const invalid = [
      [],
      [{ id: '../front', phi: 90, theta: 0 }],
      [
        { id: 'front', phi: 90, theta: 0 },
        { id: 'front', phi: 0, theta: 0 },
      ],
      [{ id: 'front', phi: Number.POSITIVE_INFINITY, theta: 0 }],
      [{ id: 'front', phi: 90, theta: 0, format: 'png' }],
    ];
    for (const views of invalid) {
      expect(() => toImagesRequestJson({ format: 'png', views })).toThrow(TypeError);
    }
  });
});

describe('image filenames', () => {
  it('should derive singular and identified names', () => {
    expect(imageFileName('webp')).toBe('thumbnail.webp');
    expect(imageViewFileName('front', 'png')).toBe('thumbnail-front.png');
  });
});
