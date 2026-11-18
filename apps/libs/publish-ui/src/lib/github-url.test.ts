import { describe, expect, it } from 'vitest';
import { normalizeRepositoryFolder, parseGitHubUrl } from '#lib/github-url.js';

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
