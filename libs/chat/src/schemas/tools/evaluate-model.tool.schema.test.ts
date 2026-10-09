import { describe, it, expect } from 'vitest';
import { toolName } from '#constants/tool.constants.js';
import { toolDescriptions } from '#constants/tool-description.constants.js';
import { evaluateModelInputSchema, evaluateModelOutputSchema } from '#schemas/tools/evaluate-model.tool.schema.js';

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
});

describe('evaluateModelOutputSchema', () => {
  it('should admit only the two statuses a request-scoped evaluation can produce (I9)', () => {
    expect(evaluateModelOutputSchema.safeParse({ status: 'ready' }).success).toBe(true);
    expect(evaluateModelOutputSchema.safeParse({ status: 'error' }).success).toBe(true);
    expect(evaluateModelOutputSchema.safeParse({ status: 'pending' }).success).toBe(false);
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
