import { describe, expect, it, vi } from 'vitest';
import { cadmpegKernel } from '@taucad/cadmpeg';
import {
  describeGitHubImport,
  findMainFile,
  handOverHostGrants,
  importFileAcceptString,
  isMainFileCandidate,
  nativeCadExtensions,
  resolveGitHubImportTarget,
} from '#routes/import.$/import.utils.js';

describe('resolveGitHubImportTarget', () => {
  it('reads owner, repo, ref, and main file out of the URL', () => {
    expect(resolveGitHubImportTarget('https://github.com/taucad/tau', '?ref=next&main=part.scad')).toStrictEqual({
      owner: 'taucad',
      repo: 'tau',
      ref: 'next',
      path: '',
      mainFile: 'part.scad',
    });
  });

  it('defaults the ref, folder and main file', () => {
    expect(resolveGitHubImportTarget('github.com/taucad/tau', '')).toStrictEqual({
      owner: 'taucad',
      repo: 'tau',
      ref: 'main',
      path: '',
      mainFile: '',
    });
  });

  it('reads the folder from ?path=', () => {
    expect(
      resolveGitHubImportTarget('github.com/KittyCAD/modeling-app', '?path=/public/kcl-samples/&main=gear/main.kcl'),
    ).toStrictEqual({
      owner: 'KittyCAD',
      repo: 'modeling-app',
      ref: 'main',
      path: 'public/kcl-samples',
      mainFile: 'gear/main.kcl',
    });
  });

  it('reads the ref and folder from a pasted GitHub folder URL', () => {
    expect(
      resolveGitHubImportTarget('https://github.com/KittyCAD/modeling-app/tree/next/public/kcl-samples', ''),
    ).toStrictEqual({
      owner: 'KittyCAD',
      repo: 'modeling-app',
      ref: 'next',
      path: 'public/kcl-samples',
      mainFile: '',
    });
  });

  it('lets ?ref= and ?path= override a folder URL', () => {
    expect(
      resolveGitHubImportTarget('https://github.com/KittyCAD/modeling-app/tree/next/public', '?ref=main&path=src'),
    ).toMatchObject({ ref: 'main', path: 'src' });
  });

  it('returns empty defaults for a bare /import', () => {
    expect(resolveGitHubImportTarget('', '?ref=next')).toStrictEqual({
      owner: '',
      repo: '',
      ref: 'main',
      path: '',
      mainFile: '',
    });
  });

  it('rejects a non-GitHub URL', () => {
    expect(resolveGitHubImportTarget('https://gitlab.com/taucad/tau', '')).toBeUndefined();
  });
});

describe('describeGitHubImport', () => {
  it('names the repository without a redundant @main suffix', () => {
    expect(describeGitHubImport({ owner: 'taucad', repo: 'tau', ref: 'main', path: '', mainFile: '' })).toStrictEqual({
      title: 'Import taucad/tau from GitHub into Tau',
      description: 'Import taucad/tau from GitHub and open it as a Tau project.',
    });
  });

  it('carries a non-default ref into the title', () => {
    expect(describeGitHubImport({ owner: 'taucad', repo: 'tau', ref: 'next', path: '', mainFile: '' }).title).toBe(
      'Import taucad/tau @ next from GitHub into Tau',
    );
  });

  it('names the folder being imported', () => {
    expect(
      describeGitHubImport({
        owner: 'KittyCAD',
        repo: 'modeling-app',
        ref: 'main',
        path: 'public/kcl-samples',
        mainFile: '',
      }).title,
    ).toBe('Import KittyCAD/modeling-app/public/kcl-samples from GitHub into Tau');
  });
});

describe('handOverHostGrants', () => {
  it('releases the previous hold when the machine starts the new host import', () => {
    const release = vi.fn();
    const held = ['folder-a'];

    expect(handOverHostGrants({ accepted: true, incoming: ['file-b'], held, release })).toBe(true);
    expect(held).toStrictEqual(['file-b']);
    expect(release).toHaveBeenCalledExactlyOnceWith(['folder-a']);
  });

  it('keeps the import in progress holding its grants when a new pick is refused', () => {
    const release = vi.fn();
    const held = ['folder-a'];

    expect(handOverHostGrants({ accepted: false, incoming: ['file-b'], held, release })).toBe(false);
    expect(held).toStrictEqual(['folder-a']);
    expect(release).toHaveBeenCalledExactlyOnceWith(['file-b']);
  });
});

describe('native CAD files', () => {
  it('accepts exactly the extensions the cadmpeg kernel opens', () => {
    expect(nativeCadExtensions).toStrictEqual(cadmpegKernel().extensions.map((extension) => `.${extension}`));
    for (const extension of nativeCadExtensions) {
      expect(importFileAcceptString.split(',')).toContain(extension);
    }
  });

  it('lets a native CAD file be the main file, whatever its case', () => {
    expect(isMainFileCandidate('parts/BRACKET.SLDPRT')).toBe(true);
    expect(isMainFileCandidate('notes.md')).toBe(false);
    expect(findMainFile(['notes.md', 'parts/BRACKET.SLDPRT'])).toBe('parts/BRACKET.SLDPRT');
  });

  it('prefers a kernel source over a native CAD file', () => {
    expect(findMainFile(['bracket.sldprt', 'bracket.scad'])).toBe('bracket.scad');
  });
});
