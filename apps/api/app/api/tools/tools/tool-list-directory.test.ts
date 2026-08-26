import { describe, expect, it } from 'vitest';
import { listDirectoryToolDefinition } from '#api/tools/tools/tool-list-directory.js';

describe('listDirectoryToolDefinition', () => {
  it('should advertise omission as the only project-root behavior', () => {
    expect(listDirectoryToolDefinition.description).toContain('Omit the path to list the project root.');
    expect(listDirectoryToolDefinition.description).not.toContain('empty string');
  });
});
