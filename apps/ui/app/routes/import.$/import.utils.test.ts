import { describe, expect, it } from 'vitest';
import { describeGitHubImport, resolveGitHubImportTarget } from '#routes/import.$/import.utils.js';

describe('resolveGitHubImportTarget', () => {
  it('reads owner, repo, ref, and main file out of the URL', () => {
    expect(resolveGitHubImportTarget('https://github.com/taucad/tau', '?ref=next&main=part.scad')).toStrictEqual({
      owner: 'taucad',
      repo: 'tau',
      ref: 'next',
      mainFile: 'part.scad',
    });
  });

  it('defaults the ref and main file', () => {
    expect(resolveGitHubImportTarget('github.com/taucad/tau', '')).toStrictEqual({
      owner: 'taucad',
      repo: 'tau',
      ref: 'main',
      mainFile: '',
    });
  });

  it('returns empty defaults for a bare /import', () => {
    expect(resolveGitHubImportTarget('', '?ref=next')).toStrictEqual({
      owner: '',
      repo: '',
      ref: 'main',
      mainFile: '',
    });
  });

  it('rejects a non-GitHub URL', () => {
    expect(resolveGitHubImportTarget('https://gitlab.com/taucad/tau', '')).toBeUndefined();
  });
});

describe('describeGitHubImport', () => {
  it('names the repository without a redundant @main suffix', () => {
    expect(describeGitHubImport({ owner: 'taucad', repo: 'tau', ref: 'main', mainFile: '' })).toStrictEqual({
      title: 'Import taucad/tau  from GitHub into Tau',
      description: 'Get started with taucad/tau  by importing it into Tau.',
    });
  });

  it('carries a non-default ref into the title', () => {
    expect(describeGitHubImport({ owner: 'taucad', repo: 'tau', ref: 'next', mainFile: '' }).title).toBe(
      'Import taucad/tau @ next from GitHub into Tau',
    );
  });
});
