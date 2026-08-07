import { describe, it, expect } from 'vitest';
import { listDirectoryInputSchema } from '#schemas/tools/list-directory.tool.schema.js';

describe('listDirectoryInputSchema', () => {
  it('should allow path to be omitted and document the project-root default', () => {
    expect(listDirectoryInputSchema.safeParse({}).success).toBe(true);

    const description = listDirectoryInputSchema.shape.path.description ?? '';
    expect(description).toBe('The directory to list. Defaults to the project root.');
  });
});
