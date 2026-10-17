import { describe, it, expect } from 'vitest';
import { toolName } from '#constants/tool.constants.js';
import { toolDescriptions } from '#constants/tool-description.constants.js';
import { evaluateModelInputSchema, evaluateModelOutputSchema } from '#schemas/tools/evaluate-model.tool.schema.js';
import { screenshotInputSchema } from '#schemas/tools/screenshot.tool.schema.js';

describe('evaluateModelInputSchema', () => {
  it('rejects obsolete geometry and rendering request keys', () => {
    for (const request of [
      { targetFile: 'main.ts', format: 'gltf' },
      { targetFile: 'main.ts', renderOptions: { wireframe: true } },
    ]) {
      expect(evaluateModelInputSchema.safeParse(request).success).toBe(false);
    }
    expect(evaluateModelInputSchema.safeParse({ targetFile: 'main.ts', includeCapabilities: true }).success).toBe(true);
  });

  it('should validate default view options with the very schema screenshot uses', () => {
    expect(evaluateModelInputSchema.shape.options).toBe(screenshotInputSchema.shape.options);
    expect(evaluateModelInputSchema.parse({ targetFile: 'main.ts', options: { tessellation: 'low' } })).toEqual({
      targetFile: 'main.ts',
      options: { tessellation: 'low' },
    });
    expect(evaluateModelInputSchema.parse({ targetFile: 'main.ts' })).not.toHaveProperty('options');
    for (const options of ['low', ['low'], null, { tessellation: () => 'low' }]) {
      expect(evaluateModelInputSchema.safeParse({ targetFile: 'main.ts', options }).success).toBe(false);
      expect(screenshotInputSchema.safeParse({ targetFile: 'main.ts', options }).success).toBe(false);
    }
  });
});

describe('evaluateModelOutputSchema', () => {
  it('should admit only the two statuses a request-scoped evaluation can produce (I9)', () => {
    expect(evaluateModelOutputSchema.safeParse({ status: 'ready' }).success).toBe(true);
    expect(evaluateModelOutputSchema.safeParse({ status: 'error' }).success).toBe(true);
    expect(evaluateModelOutputSchema.safeParse({ status: 'pending' }).success).toBe(false);
  });

  it('should keep the effective tessellation resolution the kernel reported (I7)', () => {
    const tessellation = {
      triangles: 1308,
      vertices: 656,
      elapsed: 42,
      requested: 'high',
      linearTolerance: 0.05,
      angularTolerance: 16,
      downgraded: 1,
    };

    expect(evaluateModelOutputSchema.parse({ status: 'ready', tessellation })).toEqual({
      status: 'ready',
      tessellation,
    });
  });

  it('should reject a tessellation resolution the runtime cannot report', () => {
    const counts = { triangles: 12, vertices: 8, elapsed: 3 };
    for (const resolution of [
      { requested: 'coarse' },
      { linearTolerance: 0 },
      { angularTolerance: -1 },
      { downgraded: 0.5 },
    ]) {
      expect(
        evaluateModelOutputSchema.safeParse({ status: 'ready', tessellation: { ...counts, ...resolution } }).success,
      ).toBe(false);
    }
  });

  it('should not advertise a status the schema rejects (I9)', () => {
    const description = toolDescriptions[toolName.evaluateModel];
    expect(description).not.toContain('pending');
    expect(description).toContain('sourceRevision');
  });

  it('names its required targetFile up front, where agents that read only a prefix see it', () => {
    expect(toolDescriptions[toolName.evaluateModel].split('\n')[0]).toContain('`targetFile`');
    expect(toolDescriptions[toolName.exportModel]).toContain(
      'evaluate_model({ targetFile, includeCapabilities: true })',
    );
  });
});

describe('evaluateModelOutputSchema projectRoot', () => {
  it('should name the absolute project root its targetFile resolved against', () => {
    expect(evaluateModelOutputSchema.parse({ status: 'ready', projectRoot: '/work/gear' })).toEqual({
      status: 'ready',
      projectRoot: '/work/gear',
    });
    expect(evaluateModelOutputSchema.safeParse({ status: 'ready', projectRoot: '' }).success).toBe(false);
  });
});
