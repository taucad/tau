import { describe, expect, it } from 'vitest';
import { workspaceDirectoryCopy } from '#constants/workspace-directory-copy.constants.js';

describe('workspaceDirectoryCopy', () => {
  it('should give every folder state a label and a description', () => {
    expect(Object.keys(workspaceDirectoryCopy).toSorted()).toEqual(
      [
        'connected',
        'notFound',
        'unreachable',
        'permission',
        'conflict',
        'error',
        'disconnected',
        'none',
        'unsupported',
      ].toSorted(),
    );
    for (const copy of Object.values(workspaceDirectoryCopy)) {
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.description.length).toBeGreaterThan(0);
    }
  });

  it('should say a folder that is not found left its files unchanged', () => {
    expect(workspaceDirectoryCopy.notFound.title).toBe('Folder not found');
    expect(workspaceDirectoryCopy.notFound.description).toMatch(/files weren.t changed/);
  });

  it('should not keep the ambiguous missing state', () => {
    expect(workspaceDirectoryCopy).not.toHaveProperty('missing');
  });
});
