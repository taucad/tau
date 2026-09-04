import { describe, expect, it } from 'vitest';
import { kernelConfigurations } from '@taucad/types/constants';
import { getIconIdForFilename } from '#components/icons/file-extension-icon.js';

describe('getIconIdForFilename', () => {
  it('prefers a whole-filename match over the extension', () => {
    expect(getIconIdForFilename('tau.json')).toBe('tau');
    expect(getIconIdForFilename('package.json')).toBe('npm');
    expect(getIconIdForFilename('readme.md')).toBe('readme.md');
  });

  it('matches filenames inside a path by basename', () => {
    expect(getIconIdForFilename('nested/dir/tau.json')).toBe('tau');
    expect(getIconIdForFilename('packages/runtime/package.json')).toBe('npm');
  });

  it('matches filenames case-insensitively', () => {
    expect(getIconIdForFilename('README.md')).toBe('readme.md');
    expect(getIconIdForFilename('Tau.JSON')).toBe('tau');
  });

  it('does not match a filename rule on a partial or suffixed name', () => {
    expect(getIconIdForFilename('tau.jsonc')).toBeUndefined();
    expect(getIconIdForFilename('my-package.json')).toBeUndefined();
    expect(getIconIdForFilename('tsconfig.json')).toBeUndefined();
  });

  it('still resolves extensions through the existing chain', () => {
    expect(getIconIdForFilename('main.scad')).toBe('openscad');
    expect(getIconIdForFilename('main.kcl')).toBe('zoo');
    expect(getIconIdForFilename('main.ts')).toBe('typescript');
    expect(getIconIdForFilename('main.cs')).toBe('csharp');
    expect(getIconIdForFilename('main.py')).toBe('python');
    expect(getIconIdForFilename('kernel.wasm')).toBe('webassembly');
    expect(getIconIdForFilename('component.tsx')).toBe('react');
    expect(getIconIdForFilename('.gitignore')).toBe('git');
    expect(getIconIdForFilename('model.stp')).toBe('step');
    expect(getIconIdForFilename('model.step')).toBe('step');
  });

  it('returns undefined for unmapped files', () => {
    expect(getIconIdForFilename('notes.txt')).toBeUndefined();
    expect(getIconIdForFilename('no-extension')).toBeUndefined();
  });

  // Replaces the unreachable kernel-extension branch this module used to carry:
  // a new kernel whose mainFile extension is unmapped fails here instead of
  // silently rendering the generic file icon.
  it.each(kernelConfigurations.map((kernel) => [kernel.id, kernel.mainFile] as const))(
    'resolves an icon for the %s mainFile (%s)',
    (_id, mainFile) => {
      expect(getIconIdForFilename(mainFile)).toBeDefined();
    },
  );
});
