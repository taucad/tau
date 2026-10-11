import { describe, expect, it } from 'vitest';
import {
  describeGitHubImport,
  normalizeRepositoryFolder,
  parseGitHubUrl,
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

describe('parseGitHubUrl', () => {
  it('decodes folder segments and ignores file URLs', () => {
    expect(parseGitHubUrl('https://github.com/taucad/tau/tree/main/examples/my%20part')).toStrictEqual({
      owner: 'taucad',
      repo: 'tau',
      ref: 'main',
      path: 'examples/my part',
    });
    expect(parseGitHubUrl('https://github.com/taucad/tau.git')).toStrictEqual({
      owner: 'taucad',
      repo: 'tau',
      ref: undefined,
      path: '',
    });
    expect(parseGitHubUrl('https://github.com/taucad/tau/blob/main/README.md')).toMatchObject({ path: '' });
  });
});

describe('normalizeRepositoryFolder', () => {
  it('trims slashes and refuses relative segments', () => {
    expect(normalizeRepositoryFolder('//public//kcl-samples/')).toBe('public/kcl-samples');
    expect(normalizeRepositoryFolder('public/../secrets')).toBe('');
    expect(normalizeRepositoryFolder('')).toBe('');
  });
});

describe('describeGitHubImport', () => {
  it('names the repository without a redundant @main suffix', () => {
    expect(describeGitHubImport({ owner: 'taucad', repo: 'tau', ref: 'main', path: '', mainFile: '' })).toStrictEqual({
      title: 'Import taucad/tau  from GitHub into Tau',
      description: 'Get started with taucad/tau  by importing it into Tau.',
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
    ).toBe('Import KittyCAD/modeling-app/public/kcl-samples  from GitHub into Tau');
  });
});
