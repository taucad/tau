import { describe, it, expect } from 'vitest';
import { toolName } from '#constants/tool.constants.js';
import { toolDescriptions } from '#constants/tool-description.constants.js';
import { evaluateModelOutputSchema } from '#schemas/tools/evaluate-model.tool.schema.js';

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
});
