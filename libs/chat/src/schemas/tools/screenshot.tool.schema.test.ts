import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toProviderToolJsonSchema } from '#schemas/provider-tool-schemas.js';
import { arrangeWorkbenchInputSchema } from '#schemas/tools/arrange-workbench.tool.schema.js';
import {
  screenshotInputSchema,
  screenshotMcpOutputSchema,
  screenshotOutputSchema,
  screenshotSectionSchema,
} from '#schemas/tools/screenshot.tool.schema.js';

describe('screenshotInputSchema', () => {
  it('defaults an omitted mode to single and requires targetFile or workbenchView', () => {
    expect(screenshotInputSchema.parse({ targetFile: 'main.ts', view: 'model' }).mode).toBe('single');
    expect(screenshotInputSchema.parse({ workbenchView: 'front-cut' })).toStrictEqual({
      mode: 'single',
      workbenchView: 'front-cut',
    });
    expect(screenshotInputSchema.safeParse({ mode: 'single' })).toMatchObject({
      error: {
        issues: [
          {
            path: ['targetFile'],
            message: 'Give targetFile, or workbenchView to capture a view arrange_workbench saved.',
          },
        ],
      },
    });
  });

  it.each([
    [{ section: { plane: 'xy', offset: 0 } }, 'section'],
    [{ view: 'model' }, 'view'],
    [{ instance: 'sheet-1' }, 'instance'],
    [{ options: { detail: 1 } }, 'options'],
    [{ mode: 'multi_angle' }, 'mode'],
  ])('should refuse %j beside workbenchView, which carries its own', (extra, key) => {
    const result = screenshotInputSchema.safeParse({ workbenchView: 'front-cut', ...extra });
    expect(result.error?.issues.map(({ path }) => path)).toStrictEqual([[key]]);
  });

  it('should refuse a workbenchView that is not a view id', () => {
    expect(screenshotInputSchema.safeParse({ workbenchView: 'Front Cut' }).success).toBe(false);
  });

  it('declares the mode default on the wire and requires nothing', () => {
    const wire = toProviderToolJsonSchema(screenshotInputSchema);
    expect(wire['required'] ?? []).toEqual([]);
    expect(wire).toMatchObject({ properties: { mode: { default: 'single' }, workbenchView: { type: 'string' } } });
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

  it('should refuse the removed millimetre spelling offsetMm', () => {
    expect(screenshotSectionSchema.safeParse({ plane: 'xy', offsetMm: 6 }).success).toBe(false);
    expect(
      screenshotInputSchema.safeParse({ targetFile: 'main.ts', section: { plane: 'xy', offsetMm: 6 } }).success,
    ).toBe(false);
  });

  it.each([
    [{ plane: 'xyz', offset: 0 }],
    [{ plane: 'xy' }],
    [{ plane: 'xy', offset: 0, keep: 'below' }],
    [{ plane: 'xy', offsetMm: 0, offset: 0 }],
    [{ plane: 'xy', offsetMm: 6 }],
    [{ plane: 'xy', offset: 0, depth: 1 }],
    [{ plane: 'xy', offset: Number.POSITIVE_INFINITY }],
  ])('refuses the malformed section %j', (section) => {
    expect(screenshotInputSchema.safeParse({ targetFile: 'main.ts', section }).success).toBe(false);
  });

  it('refuses parameters that are not a JSON object', () => {
    expect(screenshotInputSchema.safeParse({ targetFile: 'main.ts', parameters: [1] }).success).toBe(false);
    expect(screenshotInputSchema.safeParse({ targetFile: 'main.ts', parameters: { size: Number.NaN } }).success).toBe(
      false,
    );
  });

  it('exposes section and parameters on the provider wire without requiring them', () => {
    const wire = toProviderToolJsonSchema(screenshotInputSchema);
    expect(wire['required'] ?? []).toEqual([]);
    expect(wire).toMatchObject({
      properties: {
        section: { properties: { plane: { enum: ['xy', 'xz', 'yz'] } }, required: ['plane', 'offset'] },
      },
    });
    expect(JSON.stringify(wire['properties'])).toContain('this call only');
  });

  it('should describe offset in metres in tau:root as arrange_workbench does, and offer no offsetMm', () => {
    expect(toProviderToolJsonSchema(screenshotInputSchema)).toMatchObject({
      properties: {
        section: {
          properties: {
            offset: {
              type: 'number',
              description: expect.stringContaining('Metres in tau:root: 0.006 is 6 mm.') as unknown,
            },
          },
          required: ['plane', 'offset'],
        },
      },
    });
    expect(toProviderToolJsonSchema(screenshotInputSchema)).not.toHaveProperty([
      'properties',
      'section',
      'properties',
      'offsetMm',
    ]);
    expect(JSON.stringify(toProviderToolJsonSchema(arrangeWorkbenchInputSchema))).toContain(
      "The plane's position along its axis. Metres in tau:root: 0.012 is 12 mm.",
    );
  });

  it("should convert with Zod's default output mode to the same section as its input", () => {
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
    expect(z.toJSONSchema(screenshotSectionSchema, { io: 'input' })).toStrictEqual(
      z.toJSONSchema(screenshotSectionSchema),
    );
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
    expect(wire['required'] ?? []).toEqual([]);
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

describe('screenshotInputSchema pose', () => {
  it('should take a pose to capture and publish it as optional on the wire', () => {
    expect(
      screenshotInputSchema.parse({ targetFile: 'main.ts', pose: { animation: { id: 'four-sun-turns', time: 2 } } }),
    ).toMatchObject({ pose: { animation: { id: 'four-sun-turns', time: 2 } } });
    const wire = z.toJSONSchema(screenshotInputSchema, { io: 'input' });
    expect(wire).toHaveProperty(['properties', 'pose']);
    expect(wire.required ?? []).not.toContain('pose');
  });
});

describe('screenshot projectRoot', () => {
  it('names the absolute project root on a capture and on its MCP result', () => {
    const capture = { images: [{ view: '3d', dataUrl: 'data:image/webp;base64,AQID' }], projectRoot: '/work/gear' };
    const filed = {
      images: [
        {
          view: '3d',
          path: `attachments/${'a'.repeat(64)}.webp`,
          absolutePath: `/tmp/tau-mcp/attachments/${'a'.repeat(64)}.webp`,
          mimeType: 'image/webp',
          byteLength: 1024,
          sha256: 'a'.repeat(64),
        },
      ],
      projectRoot: '/work/gear',
    };

    expect(screenshotOutputSchema.parse(capture)).toEqual(capture);
    expect(screenshotMcpOutputSchema.parse(filed)).toEqual(filed);
    expect(screenshotMcpOutputSchema.safeParse({ ...filed, projectRoot: '' }).success).toBe(false);
  });
});
