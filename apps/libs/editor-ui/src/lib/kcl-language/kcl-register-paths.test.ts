import { describe, it, expect } from 'vitest';
import {
  kclUriToWorkspacePath,
  parentDirectoryOfWorkspacePath,
  resolveKclImportToUri,
} from '#lib/kcl-language/kcl-register-paths.js';

/**
 * Regression for LSP import resolution: paths passed to ActivationContext.fileManager
 * must be project-relative (no leading slash), matching `openImportedFiles` behavior.
 */
describe('kcl-register-paths', () => {
  it('maps a sibling import to the workspace path the file manager sees', () => {
    const mainUri = 'file:///public/kcl-samples/axial-fan/main.kcl';
    const importUri = resolveKclImportToUri(mainUri, 'fan-housing.kcl');
    expect(importUri).toBe('file:///public/kcl-samples/axial-fan/fan-housing.kcl');
    expect(kclUriToWorkspacePath(importUri)).toBe('public/kcl-samples/axial-fan/fan-housing.kcl');
  });

  it('rejects non-file, authority-bearing, and escaping URIs', () => {
    expect(() => kclUriToWorkspacePath('https://example.com/main.kcl')).toThrow('Invalid virtual path.');
    expect(() => kclUriToWorkspacePath('file://server/main.kcl')).toThrow('Invalid virtual path.');
    expect(() => kclUriToWorkspacePath('file:///../main.kcl')).toThrow('escapes the filesystem root');
  });

  describe('parentDirectoryOfWorkspacePath', () => {
    it('returns the parent segment for nested paths', () => {
      expect(parentDirectoryOfWorkspacePath('public/kcl-samples/axial-fan/main.kcl')).toBe(
        'public/kcl-samples/axial-fan',
      );
    });

    it('returns empty string when there is no directory segment', () => {
      expect(parentDirectoryOfWorkspacePath('main.kcl')).toBe('');
    });

    it('strips a trailing slash before computing parent', () => {
      expect(parentDirectoryOfWorkspacePath('public/kcl-samples/axial-fan/')).toBe('public/kcl-samples');
    });
  });
});
