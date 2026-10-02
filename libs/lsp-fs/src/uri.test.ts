import { describe, expect, it } from 'vitest';

import { monacoFileUriToWorkspaceRelative } from '#uri.js';

describe('uri', () => {
  it('monacoFileUriToWorkspaceRelative strips file scheme and leading slash', () => {
    expect(monacoFileUriToWorkspaceRelative('file:///src/a.ts')).toBe('src/a.ts');
    expect(monacoFileUriToWorkspaceRelative('file:///projects/x/y/z.ts')).toBe('projects/x/y/z.ts');
  });
});
