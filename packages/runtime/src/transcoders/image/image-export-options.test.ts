import { describe, it, expect } from 'vitest';
import { imageEdgeSchemas } from '#transcoders/image/image-export-options.js';

describe('imageEdgeSchemas', () => {
  describe('defaults', () => {
    it('should apply the thumbnail preset defaults for png with an empty input', () => {
      expect(imageEdgeSchemas.png.parse({})).toEqual({
        width: 768,
        height: 432,
        phi: 60,
        theta: -45,
        margin: 0.1,
        projection: 'perspective',
        includeAxes: false,
        includeLabel: false,
        includeScale: false,
        mode: 'single',
      });
    });

    it('should leave the png/webp background transparent by default', () => {
      expect(imageEdgeSchemas.png.parse({}).background).toBeUndefined();
      expect(imageEdgeSchemas.webp.parse({}).background).toBeUndefined();
    });

    it('should default the jpeg background to opaque white', () => {
      expect(imageEdgeSchemas.jpeg.parse({})).toMatchObject({ background: '#FFFFFF', quality: 0.92 });
    });
  });

  describe('validation', () => {
    it('should reject a dimension outside 16–4096', () => {
      expect(() => imageEdgeSchemas.png.parse({ width: 8 })).toThrow();
      expect(() => imageEdgeSchemas.png.parse({ height: 5000 })).toThrow();
    });

    it('should reject a margin outside 0–0.5', () => {
      expect(() => imageEdgeSchemas.png.parse({ margin: 0.75 })).toThrow();
    });

    it('should reject a quality outside 0–1', () => {
      expect(() => imageEdgeSchemas.jpeg.parse({ quality: 1.5 })).toThrow();
      expect(() => imageEdgeSchemas.png.parse({ quality: 0.5 })).toThrow();
    });

    it('should reject an invalid background string', () => {
      expect(() => imageEdgeSchemas.jpeg.parse({ background: '#fff' })).toThrow();
    });

    it('should accept a caller-supplied opaque background for png', () => {
      expect(imageEdgeSchemas.png.parse({ background: '#FFFFFFFF' }).background).toBe('#FFFFFFFF');
    });

    it('should require supported labels when label output is enabled', () => {
      const missing = imageEdgeSchemas.webp.safeParse({ includeLabel: true });
      expect(missing.success).toBe(false);
      if (!missing.success) {
        expect(missing.error.issues[0]).toMatchObject({ path: ['label'] });
      }

      expect(imageEdgeSchemas.webp.parse({ includeLabel: true, label: 'Front — View From +Z' })).toMatchObject({
        includeLabel: true,
        label: 'Front — View From +Z',
      });
      expect(imageEdgeSchemas.webp.safeParse({ label: 'snowman ☃' }).success).toBe(false);
    });

    it('should require every batch view label and annotated dimensions', () => {
      const missing = imageEdgeSchemas.webp.safeParse({
        mode: 'batch',
        includeLabel: true,
        views: [{ id: 'front', phi: 90, theta: 0 }],
      });
      expect(missing.success).toBe(false);
      if (!missing.success) {
        expect(missing.error.issues[0]).toMatchObject({ path: ['views', 0, 'label'] });
      }

      const tooSmall = imageEdgeSchemas.webp.safeParse({ includeAxes: true, width: 191 });
      expect(tooSmall.success).toBe(false);
      if (!tooSmall.success) {
        expect(tooSmall.error.issues[0]).toMatchObject({ path: ['width'] });
      }
    });
  });
});
