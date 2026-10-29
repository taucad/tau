import { expect, it } from 'vitest';
import { URI } from 'vscode-uri';
import { workspacePathFromFileUri } from '#lib/editor-workspace-fs/editor-workspace-fs.js';

it('preserves canonical escaped workspace paths and refuses nonlocal or decorated URIs', () => {
  expect(workspacePathFromFileUri(URI.file('/src/測定 file.ts'))).toBe('src/測定 file.ts');
  for (const uri of [
    URI.file('/../escape.ts'),
    URI.from({ scheme: 'https', path: '/src/main.ts' }),
    URI.from({ scheme: 'file', authority: 'host', path: '/src/main.ts' }),
    URI.from({ scheme: 'file', path: '/src/main.ts', query: 'revision=old' }),
    URI.from({ scheme: 'file', path: '/src/main.ts', fragment: 'line=2' }),
  ]) {
    expect(() => workspacePathFromFileUri(uri)).toThrow();
  }
});
