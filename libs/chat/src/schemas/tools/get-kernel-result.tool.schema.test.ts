import { describe, it, expect } from 'vitest';
import { toolName } from '#constants/tool.constants.js';
import { toolDescriptions } from '#constants/tool-description.constants.js';
import { getKernelResultOutputSchema } from '#schemas/tools/get-kernel-result.tool.schema.js';

describe('getKernelResultOutputSchema', () => {
  it('should admit only the two statuses a request-scoped evaluation can produce (I9)', () => {
    expect(getKernelResultOutputSchema.safeParse({ status: 'ready' }).success).toBe(true);
    expect(getKernelResultOutputSchema.safeParse({ status: 'error' }).success).toBe(true);
    expect(getKernelResultOutputSchema.safeParse({ status: 'pending' }).success).toBe(false);
  });

  it('should not advertise a status the schema rejects (I9)', () => {
    const description = toolDescriptions[toolName.getKernelResult];
    expect(description).not.toContain('pending');
    expect(description).toContain('sourceRevision');
  });
});
