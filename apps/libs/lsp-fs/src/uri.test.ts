import { describe, expect, it } from 'vitest';

import { languageFileUriToWorkspaceRelative } from '#uri.js';

describe('uri', () => {
  it('should strip file scheme and leading slash', () => {
    expect(languageFileUriToWorkspaceRelative('file:///src/a.ts')).toBe('src/a.ts');
    expect(languageFileUriToWorkspaceRelative('file:///projects/x/y/z.ts')).toBe('projects/x/y/z.ts');
  });
  it.each(['file://remote/a.ts', 'file:///a.ts?version=1', 'file:///a.ts#fragment', 'https://example.com/a.ts'])(
    'should reject ambiguous language URI %s',
    (uri) => {
      expect(() => languageFileUriToWorkspaceRelative(uri)).toThrow(TypeError);
    },
  );
});
