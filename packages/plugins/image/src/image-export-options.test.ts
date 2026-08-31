import { describe, it, expect } from 'vitest';
import { toJSONSchema } from 'zod';
import type { JSONSchema7, JSONSchema7Definition } from '@taucad/json-schema';
import { imageEdgeSchemas } from '#image-export-options.js';

const requireSchema = (value: JSONSchema7Definition | undefined, message: string): JSONSchema7 => {
  if (value === undefined || typeof value === 'boolean') {
    throw new TypeError(message);
  }
  return value;
};

describe('imageEdgeSchemas', () => {
  it('should expose every route option as JSON Schema', () => {
    for (const edgeSchema of Object.values(imageEdgeSchemas)) {
      const schema = toJSONSchema(edgeSchema, { target: 'draft-7' });
      for (const branch of schema.anyOf ?? []) {
        expect(branch).not.toBe(false);
        expect(branch).not.toBe(true);
        if (typeof branch === 'object') {
          expect(branch.properties).toHaveProperty('width');
          expect(branch.properties).toHaveProperty('sections');
        }
      }
    }
  });

  describe('defaults', () => {
    it('should apply the thumbnail preset defaults for png with an empty input', () => {
      expect(imageEdgeSchemas.png.parse({})).toEqual({
        width: 768,
        height: 432,
        lineWidth: 3,
        surfaces: true,
        lines: true,
        axes: false,
        scaleBar: false,
        world: { up: '+z', forward: '-y', unit: 'meter' },
        mode: 'single',
        camera: {
          framing: 'fit',
          direction: [0.612_372_435_7, -0.612_372_435_7, 0.5],
          up: [0, 0, 1],
          margin: 0.1,
          projection: { kind: 'perspective', verticalFieldOfView: 45 },
        },
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

    it('should create valid batch, fixed-camera, and section-plane states', () => {
      expect(imageEdgeSchemas.png.parse({ mode: 'batch' })).toMatchObject({
        mode: 'batch',
        views: [{ id: 'view-1', camera: { framing: 'fit' } }],
      });
      expect(imageEdgeSchemas.png.parse({ camera: { framing: 'fixed' } })).toMatchObject({
        camera: {
          framing: 'fixed',
          position: [3, -3, 2],
          target: [0, 0, 0],
          up: [0, 0, 1],
        },
      });
      expect(imageEdgeSchemas.png.parse({ camera: { framing: 'bounds' } })).toMatchObject({
        camera: {
          framing: 'bounds',
          direction: [0.612_372_435_7, -0.612_372_435_7, 0.5],
          up: [0, 0, 1],
          margin: 0.1,
          projection: { kind: 'perspective', verticalFieldOfView: 45 },
        },
      });
      expect(imageEdgeSchemas.png.parse({ sections: { planes: [{}] } })).toMatchObject({
        sections: {
          planes: [{ point: [0, 0, 0], normal: [0, 0, 1] }],
        },
      });
    });

    it('should emit editable camera and section vectors in JSON Schema', () => {
      const schema = toJSONSchema(imageEdgeSchemas.png, { target: 'draft-7', io: 'input' });
      expect(JSON.stringify(schema)).not.toContain('"readOnly":true');
    });

    it('should create a complete visible-primitive reference and publish its defaults', () => {
      expect(imageEdgeSchemas.png.parse({ visiblePrimitives: [{}] })).toMatchObject({
        visiblePrimitives: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
      });

      const schema = toJSONSchema(imageEdgeSchemas.png, { target: 'draft-7', io: 'input' }) as JSONSchema7;
      const single = (schema.anyOf ?? [])
        .map((branch) => requireSchema(branch, 'Expected an object branch'))
        .find((branch) => branch.title === 'Single');
      const visiblePrimitives = requireSchema(
        single?.properties?.['visiblePrimitives'],
        'Expected the visible-primitives schema',
      );
      if (Array.isArray(visiblePrimitives.items)) {
        throw new TypeError('Expected one visible-primitives item schema');
      }
      const item = requireSchema(visiblePrimitives.items, 'Expected the visible-primitives item schema');

      expect(item.properties).toMatchObject({
        nodeIndex: { default: 0 },
        meshIndex: { default: 0 },
        primitiveIndex: { default: 0 },
      });
      expect(item.default).toEqual({ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 });
      expect(item.required).toEqual(['nodeIndex', 'meshIndex', 'primitiveIndex']);
    });

    it('should publish semantic camera and projection branch titles', () => {
      const schema = toJSONSchema(imageEdgeSchemas.png, { target: 'draft-7', io: 'input' }) as JSONSchema7;
      const single = (schema.anyOf ?? [])
        .map((branch) => requireSchema(branch, 'Expected an object branch'))
        .find((branch) => branch.title === 'Single');
      const camera = requireSchema(single?.properties?.['camera'], 'Expected the camera JSON Schema');

      const cameraBranches = (camera.oneOf ?? []).map((branch) => requireSchema(branch, 'Expected a camera branch'));
      expect(cameraBranches.map((branch) => branch.title)).toEqual(['Fit', 'Bounds', 'Fixed']);
      for (const branch of cameraBranches) {
        const projection = requireSchema(branch.properties?.['projection'], 'Expected a projection JSON Schema');
        expect(
          (projection.oneOf ?? []).map((option) => requireSchema(option, 'Expected a projection branch').title),
        ).toEqual(['Perspective', 'Orthographic']);
      }
    });
  });

  describe('validation', () => {
    it('should reject a dimension outside 16–4096', () => {
      expect(() => imageEdgeSchemas.png.parse({ width: 8 })).toThrow();
      expect(() => imageEdgeSchemas.png.parse({ height: 5000 })).toThrow();
    });

    it('should reject a margin outside 0–0.5', () => {
      expect(() => imageEdgeSchemas.png.parse({ camera: { framing: 'fit', margin: 0.75 } })).toThrow();
    });

    it('should accept only right-handed caller worlds', () => {
      expect(imageEdgeSchemas.png.parse({}).world).toEqual({ up: '+z', forward: '-y', unit: 'meter' });
      expect(imageEdgeSchemas.png.safeParse({ world: { up: '+z', forward: '+y', unit: 'meter' } }).success).toBe(false);
    });

    it('should validate fixed placement, roll, projection, zoom, and clipping as one camera', () => {
      const camera = {
        framing: 'fixed',
        position: [8, -6, 4],
        target: [1, 2, 3],
        up: [0.1, 0.2, 0.97],
        projection: { kind: 'perspective', verticalFieldOfView: 52, zoom: 1.4 },
        clipping: { near: 0.2, far: 900 },
      } as const;
      const parsed = imageEdgeSchemas.png.parse({ camera });
      if (parsed.mode !== 'single') {
        throw new Error('Expected single-image options');
      }
      expect(parsed.camera).toEqual(camera);
      expect(imageEdgeSchemas.png.safeParse({ camera: { ...camera, position: camera.target } }).success).toBe(false);
      expect(imageEdgeSchemas.png.safeParse({ camera: { ...camera, up: [7, -8, 1] } }).success).toBe(false);
      expect(imageEdgeSchemas.png.safeParse({ camera: { ...camera, clipping: { near: 1, far: 0.5 } } }).success).toBe(
        false,
      );
    });

    it('should validate presentation state at the renderer boundary', () => {
      const presentation = {
        surfaces: false,
        lines: true,
        visiblePrimitives: [
          { nodeIndex: 0, meshIndex: 1, primitiveIndex: 2 },
          { nodeIndex: 3, meshIndex: 1, primitiveIndex: 2 },
        ],
        sections: {
          planes: [
            { point: [0, 0, 0], normal: [0, 0, 1] },
            { point: [1, 2, 3], normal: [1, 0, 0] },
          ],
          clipSurfaces: true,
          clipLines: false,
        },
      } as const;

      expect(imageEdgeSchemas.png.parse(presentation)).toMatchObject(presentation);
      expect(
        imageEdgeSchemas.png.safeParse({
          visiblePrimitives: [
            { nodeIndex: 0, meshIndex: 1, primitiveIndex: 2 },
            { nodeIndex: 0, meshIndex: 1, primitiveIndex: 2 },
          ],
        }).success,
      ).toBe(false);
      expect(imageEdgeSchemas.png.safeParse({ sections: { planes: [] } }).success).toBe(false);
      expect(
        imageEdgeSchemas.png.safeParse({ sections: { planes: [{ point: [0, 0, 0], normal: [0, 0, 0] }] } }).success,
      ).toBe(false);
      expect(
        imageEdgeSchemas.png.safeParse({
          visiblePrimitives: [{ nodeIndex: 0, meshIndex: 1, primitiveIndex: 2, componentId: 'private' }],
        }).success,
      ).toBe(false);
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
          views: [{ id: 'front', label: 'Front' }, { id: 'top' }],
        }).success,
      ).toBe(true);
    });

    it('should validate format-aware per-view output overrides', () => {
      const webp = imageEdgeSchemas.webp.parse({
        mode: 'batch',
        views: [{ id: 'small', width: 256, height: 192, quality: 0.9 }],
      });
      if (webp.mode !== 'batch') {
        throw new Error('Expected batch WebP options');
      }
      expect(webp.views[0]).toMatchObject({ width: 256, height: 192, quality: 0.9 });
      expect(
        imageEdgeSchemas.jpeg.safeParse({
          mode: 'batch',
          views: [{ id: 'small', quality: 0.8 }],
        }).success,
      ).toBe(true);
      expect(
        imageEdgeSchemas.png.safeParse({
          mode: 'batch',
          views: [{ id: 'small', quality: 0.8 }],
        }).success,
      ).toBe(false);
      expect(
        imageEdgeSchemas.webp.safeParse({
          mode: 'batch',
          views: [{ id: 'small', format: 'png' }],
        }).success,
      ).toBe(false);
      expect(
        imageEdgeSchemas.webp.safeParse({
          mode: 'batch',
          views: [{ id: 'small', width: 8 }],
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
        views: [{ id: 'front', label: 'Front' }],
      });
      expect(batch.success).toBe(false);
      if (!batch.success) {
        expect(batch.error.issues[0]).toMatchObject({ path: ['views', 0, 'height'] });
      }

      expect(imageEdgeSchemas.webp.safeParse({ width: 191, height: 191 }).success).toBe(true);
      expect(imageEdgeSchemas.webp.safeParse({ mode: 'batch', height: 191, views: [{ id: 'front' }] }).success).toBe(
        true,
      );

      const labeledOverride = imageEdgeSchemas.webp.safeParse({
        mode: 'batch',
        views: [{ id: 'front', label: 'Front', width: 191 }],
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
          views: [{ id: 'front', width: 192, height: 192 }],
        }).success,
      ).toBe(true);
      expect(
        imageEdgeSchemas.webp.safeParse({
          mode: 'batch',
          axes: true,
          views: [{ id: 'front', width: 191 }],
        }).success,
      ).toBe(false);
    });
  });
});
