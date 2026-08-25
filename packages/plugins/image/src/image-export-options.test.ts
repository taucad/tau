import { describe, it, expect } from 'vitest';
import { imageEdgeSchemas } from '#image-export-options.js';

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
        axes: false,
        scaleBar: false,
        mode: 'single',
      });
    });

    it('should leave the png/webp background transparent by default', () => {
      expect(imageEdgeSchemas.png.parse({}).background).toBeUndefined();
      expect(imageEdgeSchemas.webp.parse({}).background).toBeUndefined();
    });

    it('should default webp to lossless quality', () => {
      expect(imageEdgeSchemas.webp.parse({}).quality).toBe(1);
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

    it('should accept webp quality and reject quality outside 0–1', () => {
      expect(imageEdgeSchemas.webp.parse({ quality: 0 }).quality).toBe(0);
      expect(imageEdgeSchemas.webp.parse({ quality: 0.9 }).quality).toBe(0.9);
      expect(imageEdgeSchemas.webp.parse({ quality: 1 }).quality).toBe(1);
      expect(() => imageEdgeSchemas.webp.parse({ quality: -0.1 })).toThrow();
      expect(() => imageEdgeSchemas.webp.parse({ quality: 1.1 })).toThrow();
      expect(() => imageEdgeSchemas.jpeg.parse({ quality: 1.5 })).toThrow();
      expect(() => imageEdgeSchemas.png.parse({ quality: 0.5 })).toThrow();
    });

    it('should reject an invalid background string', () => {
      expect(() => imageEdgeSchemas.jpeg.parse({ background: '#fff' })).toThrow();
    });

    it('should accept a caller-supplied opaque background for png', () => {
      expect(imageEdgeSchemas.png.parse({ background: '#FFFFFFFF' }).background).toBe('#FFFFFFFF');
    });

    it('should treat a supported label as its own switch and reject unsupported characters', () => {
      expect(imageEdgeSchemas.webp.parse({ label: 'Front — View From +Z' })).toMatchObject({
        label: 'Front — View From +Z',
      });
      expect(imageEdgeSchemas.webp.safeParse({ label: 'snowman ☃' }).success).toBe(false);
      expect(imageEdgeSchemas.webp.safeParse({ includeLabel: true, label: 'Front' }).success).toBe(false);
    });

    it('should accept independently labeled batch views', () => {
      expect(
        imageEdgeSchemas.webp.safeParse({
          mode: 'batch',
          views: [
            { id: 'front', label: 'Front', phi: 90, theta: 0 },
            { id: 'top', phi: 0, theta: 0 },
          ],
        }).success,
      ).toBe(true);
    });

    it('should validate format-aware per-view output overrides', () => {
      const webp = imageEdgeSchemas.webp.parse({
        mode: 'batch',
        views: [{ id: 'small', phi: 60, theta: -45, width: 256, height: 192, quality: 0.9 }],
      });
      if (webp.mode !== 'batch') {
        throw new Error('Expected batch WebP options');
      }
      expect(webp.views[0]).toMatchObject({ width: 256, height: 192, quality: 0.9 });
      expect(
        imageEdgeSchemas.jpeg.safeParse({
          mode: 'batch',
          views: [{ id: 'small', phi: 60, theta: -45, quality: 0.8 }],
        }).success,
      ).toBe(true);
      expect(
        imageEdgeSchemas.png.safeParse({
          mode: 'batch',
          views: [{ id: 'small', phi: 60, theta: -45, quality: 0.8 }],
        }).success,
      ).toBe(false);
      expect(
        imageEdgeSchemas.webp.safeParse({
          mode: 'batch',
          views: [{ id: 'small', phi: 60, theta: -45, format: 'png' }],
        }).success,
      ).toBe(false);
      expect(
        imageEdgeSchemas.webp.safeParse({
          mode: 'batch',
          views: [{ id: 'small', phi: 60, theta: -45, width: 8 }],
        }).success,
      ).toBe(false);
    });

    it('should require annotated dimensions whenever any annotation is drawn', () => {
      for (const annotated of [{ axes: true }, { scaleBar: true }, { label: 'Front' }]) {
        const tooSmall = imageEdgeSchemas.webp.safeParse({ ...annotated, width: 191 });
        expect(tooSmall.success).toBe(false);
        if (!tooSmall.success) {
          expect(tooSmall.error.issues[0]).toMatchObject({ path: ['width'] });
        }
      }

      const batch = imageEdgeSchemas.webp.safeParse({
        mode: 'batch',
        height: 191,
        views: [{ id: 'front', label: 'Front', phi: 90, theta: 0 }],
      });
      expect(batch.success).toBe(false);
      if (!batch.success) {
        expect(batch.error.issues[0]).toMatchObject({ path: ['views', 0, 'height'] });
      }

      expect(imageEdgeSchemas.webp.safeParse({ width: 191, height: 191 }).success).toBe(true);
      expect(
        imageEdgeSchemas.webp.safeParse({ mode: 'batch', height: 191, views: [{ id: 'front', phi: 90, theta: 0 }] })
          .success,
      ).toBe(true);

      const labeledOverride = imageEdgeSchemas.webp.safeParse({
        mode: 'batch',
        views: [{ id: 'front', label: 'Front', phi: 90, theta: 0, width: 191 }],
      });
      expect(labeledOverride.success).toBe(false);
      if (!labeledOverride.success) {
        expect(labeledOverride.error.issues[0]).toMatchObject({ path: ['views', 0, 'width'] });
      }

      expect(
        imageEdgeSchemas.webp.safeParse({
          mode: 'batch',
          width: 191,
          height: 191,
          axes: true,
          views: [{ id: 'front', phi: 90, theta: 0, width: 192, height: 192 }],
        }).success,
      ).toBe(true);
      expect(
        imageEdgeSchemas.webp.safeParse({
          mode: 'batch',
          axes: true,
          views: [{ id: 'front', phi: 90, theta: 0, width: 191 }],
        }).success,
      ).toBe(false);
    });
  });
});
