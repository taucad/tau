import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toProviderToolJsonSchema } from '#schemas/provider-tool-schemas.js';
import { arrangeWorkbenchInputSchema } from '#schemas/tools/arrange-workbench.tool.schema.js';
import {
  screenshotInputSchema,
  screenshotOutputSchema,
  screenshotSectionSchema,
} from '#schemas/tools/screenshot.tool.schema.js';

describe('screenshotInputSchema', () => {
  it('defaults an omitted mode to single and still requires targetFile', () => {
    expect(screenshotInputSchema.parse({ targetFile: 'main.ts', view: 'model' }).mode).toBe('single');
    expect(screenshotInputSchema.safeParse({ mode: 'single' }).success).toBe(false);
  });

  it('declares the mode default on the wire instead of requiring it', () => {
    const wire = toProviderToolJsonSchema(screenshotInputSchema);
    expect(wire['required']).toEqual(['targetFile']);
    expect(wire).toMatchObject({ properties: { mode: { default: 'single' } } });
  });
});

describe('screenshotInputSchema section and parameters', () => {
  it('accepts one axis-plane cut and per-call parameters', () => {
    expect(
      screenshotInputSchema.parse({
        targetFile: 'main.ts',
        section: { plane: 'xy', offset: 0.194, keep: 'positive' },
        parameters: { part: 'Shade Print', voxelSize: 0.5 },
      }),
    ).toMatchObject({ section: { plane: 'xy', offset: 0.194, keep: 'positive' }, parameters: { voxelSize: 0.5 } });
  });

  it('should parse the deprecated offsetMm into the same section in metres, and keep it on a second parse', () => {
    const parsed = screenshotInputSchema.parse({ targetFile: 'main.ts', section: { plane: 'xy', offsetMm: 6 } });
    expect(parsed.section).toStrictEqual({ plane: 'xy', offset: 0.006 });
    expect(parsed.section).toStrictEqual(screenshotSectionSchema.parse({ plane: 'xy', offset: 0.006 }));
    expect(screenshotInputSchema.parse(parsed)).toStrictEqual(parsed);
    expect(screenshotSectionSchema.parse({ plane: 'yz', offsetMm: 33.3, keep: 'negative' })).toStrictEqual({
      plane: 'yz',
      offset: 0.0333,
      keep: 'negative',
    });
  });

  it.each([
    [{ plane: 'xyz', offset: 0 }],
    [{ plane: 'xy' }],
    [{ plane: 'xy', offset: 0, keep: 'below' }],
    [{ plane: 'xy', offsetMm: 0, offset: 0 }],
    [{ plane: 'xy', offset: 0, depth: 1 }],
    [{ plane: 'xy', offset: Number.POSITIVE_INFINITY }],
    [{ plane: 'xy', offsetMm: Number.POSITIVE_INFINITY }],
  ])('refuses the malformed section %j', (section) => {
    expect(screenshotInputSchema.safeParse({ targetFile: 'main.ts', section }).success).toBe(false);
  });

  it('should name the missing offset, and the alias given beside it, in metres', () => {
    const issuesOf = (section: unknown) => {
      const result = screenshotSectionSchema.safeParse(section);
      return result.success ? [] : result.error.issues.map(({ path, message }) => ({ path, message }));
    };
    expect(issuesOf({ plane: 'xy' })).toStrictEqual([
      {
        path: ['offset'],
        message: "Give offset, the plane's position along its normal axis in metres (0.006 is 6 mm).",
      },
    ]);
    expect(issuesOf({ plane: 'xy', offset: 0.006, offsetMm: 6 })).toStrictEqual([
      { path: ['offsetMm'], message: 'Give offset alone; offsetMm is its deprecated millimetre spelling.' },
    ]);
  });

  it('refuses parameters that are not a JSON object', () => {
    expect(screenshotInputSchema.safeParse({ targetFile: 'main.ts', parameters: [1] }).success).toBe(false);
    expect(screenshotInputSchema.safeParse({ targetFile: 'main.ts', parameters: { size: Number.NaN } }).success).toBe(
      false,
    );
  });

  it('exposes section and parameters on the provider wire without requiring them', () => {
    const wire = toProviderToolJsonSchema(screenshotInputSchema);
    expect(wire['required']).toEqual(['targetFile']);
    expect(wire).toMatchObject({
      properties: {
        section: { properties: { plane: { enum: ['xy', 'xz', 'yz'] } }, required: ['plane'] },
      },
    });
    expect(JSON.stringify(wire['properties'])).toContain('this call only');
  });

  it('should describe offset in metres in tau:root as arrange_workbench does, and offsetMm as deprecated for one release', () => {
    expect(toProviderToolJsonSchema(screenshotInputSchema)).toMatchObject({
      properties: {
        section: {
          properties: {
            offset: {
              type: 'number',
              description: expect.stringContaining('Metres in tau:root: 0.006 is 6 mm.') as unknown,
            },
            offsetMm: {
              type: 'number',
              description: expect.stringMatching(/^Deprecated, kept for one release:/u) as unknown,
            },
          },
        },
      },
    });
    expect(JSON.stringify(toProviderToolJsonSchema(arrangeWorkbenchInputSchema))).toContain(
      "The plane's position along its axis. Metres in tau:root: 0.012 is 12 mm.",
    );
  });

  it("should convert with Zod's default output mode to the parsed section, which has offset and no offsetMm", () => {
    const output = z.toJSONSchema(screenshotInputSchema);
    expect(output).toMatchObject({
      properties: {
        section: {
          type: 'object',
          properties: {
            plane: { enum: ['xy', 'xz', 'yz'] },
            offset: { type: 'number', description: expect.stringContaining('Metres in tau:root') as unknown },
            keep: { enum: ['negative', 'positive'] },
          },
          required: ['plane', 'offset'],
          additionalProperties: false,
        },
      },
    });
    expect(output).not.toHaveProperty(['properties', 'section', 'properties', 'offsetMm']);
    expect(z.toJSONSchema(screenshotSectionSchema, { io: 'input' })).toMatchObject({ required: ['plane'] });
    expect(z.toJSONSchema(screenshotSectionSchema, { io: 'input' })).toHaveProperty(['properties', 'offsetMm']);
  });
});

describe('screenshotInputSchema includeEdges', () => {
  it('accepts a per-call edge request in either direction and leaves it absent when omitted', () => {
    expect(screenshotInputSchema.parse({ targetFile: 'main.ts', includeEdges: false })).toMatchObject({
      includeEdges: false,
    });
    expect(screenshotInputSchema.parse({ targetFile: 'main.ts', includeEdges: true })).toMatchObject({
      includeEdges: true,
    });
    expect(screenshotInputSchema.parse({ targetFile: 'main.ts' })).not.toHaveProperty('includeEdges');
  });

  it('refuses a non-boolean edge request', () => {
    expect(screenshotInputSchema.safeParse({ targetFile: 'main.ts', includeEdges: 'false' }).success).toBe(false);
  });

  it('publishes includeEdges as an optional boolean on the wire', () => {
    const wire = toProviderToolJsonSchema(screenshotInputSchema);
    expect(wire['required']).toEqual(['targetFile']);
    expect(wire).toMatchObject({ properties: { includeEdges: { type: 'boolean' } } });
  });
});

describe('screenshotOutputSchema stored captures (D-UI-04)', () => {
  const stored = {
    view: '3d',
    angle: 'isometric',
    path: `attachments/${'a'.repeat(64)}.webp`,
    mimeType: 'image/webp',
    byteLength: 1024,
    sha256: 'a'.repeat(64),
  };

  it('accepts a capture the host stored as a chat attachment, without inline bytes', () => {
    expect(screenshotOutputSchema.parse({ images: [stored] }).images).toEqual([stored]);
  });

  it('still refuses a stored capture with inline bytes beside its reference', () => {
    expect(
      screenshotOutputSchema.safeParse({ images: [{ ...stored, dataUrl: 'data:image/webp;base64,AQID' }] }).success,
    ).toBe(false);
  });
});
