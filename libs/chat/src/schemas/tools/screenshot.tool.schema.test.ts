import { describe, expect, it } from 'vitest';
import { toProviderToolJsonSchema } from '#schemas/provider-tool-schemas.js';
import { screenshotInputSchema } from '#schemas/tools/screenshot.tool.schema.js';

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
        section: { plane: 'xy', offsetMm: 194, keep: 'positive' },
        parameters: { part: 'Shade Print', voxelSize: 0.5 },
      }),
    ).toMatchObject({ section: { plane: 'xy', offsetMm: 194, keep: 'positive' }, parameters: { voxelSize: 0.5 } });
  });

  it.each([
    [{ plane: 'xyz', offsetMm: 0 }],
    [{ plane: 'xy' }],
    [{ plane: 'xy', offsetMm: 0, keep: 'below' }],
    [{ plane: 'xy', offsetMm: 0, offset: 1 }],
    [{ plane: 'xy', offsetMm: Number.POSITIVE_INFINITY }],
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
    expect(wire['required']).toEqual(['targetFile']);
    expect(wire).toMatchObject({
      properties: {
        section: { properties: { plane: { enum: ['xy', 'xz', 'yz'] } }, required: ['plane', 'offsetMm'] },
      },
    });
    expect(JSON.stringify(wire['properties'])).toContain('this call only');
  });
});
