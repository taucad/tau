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
