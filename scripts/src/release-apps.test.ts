import { describe, expect, it } from 'vitest';
import type { AppRelease, Commit } from '#release-apps.js';
import {
  bumpFor,
  changelogNotes,
  changelogSection,
  increment,
  planRelease,
  prependChangelog,
  releaseCommitSubject,
  selectRelease,
  setManifestVersion,
} from '#release-apps.js';

const commit = (subject: string, body = ''): Commit => ({ hash: 'abcdef0123456789', subject, body });
const app = { name: 'ui', root: 'apps/ui' };

describe('bumpFor', () => {
  it('patches for fixes and chores, and takes a minor bump for a feature', () => {
    expect(bumpFor([commit('fix(ui): Close the dialog'), commit('chore(root): Refresh')], '1.2.3')).toBe('patch');
    expect(bumpFor([commit('fix(ui): Close the dialog'), commit('feat(api): Add exports')], '1.2.3')).toBe('minor');
  });

  it('takes a major bump for a breaking change, which is a minor bump below 1.0.0', () => {
    expect(bumpFor([commit('fix(runtime)!: Drop the old loader')], '1.2.3')).toBe('major');
    expect(bumpFor([commit('refactor(ui): Move', 'BREAKING CHANGE: routes moved')], '1.2.3')).toBe('major');
    expect(bumpFor([commit('fix(runtime)!: Drop the old loader')], '0.4.1')).toBe('minor');
  });
});

describe('increment', () => {
  it('resets the lower components', () => {
    expect(increment('1.2.3', 'major')).toBe('2.0.0');
    expect(increment('1.2.3', 'minor')).toBe('1.3.0');
    expect(increment('1.2.3', 'patch')).toBe('1.2.4');
  });

  it('rejects a prerelease or malformed version', () => {
    expect(() => increment('1.2.3-beta.1', 'patch')).toThrow(/not a release version/u);
  });
});

describe('planRelease', () => {
  it('releases nothing when no shipped commit touched the application', () => {
    expect(planRelease({ app, currentVersion: '0.2.0', previousTag: 'ui@0.2.0', commits: [] })).toBeUndefined();
    expect(
      planRelease({
        app,
        currentVersion: '0.2.0',
        previousTag: 'ui@0.2.0',
        commits: [commit('chore(release): ui v0.2.0')],
      }),
    ).toBeUndefined();
  });

  it('bumps from the manifest version and tags the result', () => {
    const release = planRelease({
      app,
      currentVersion: '0.2.0',
      previousTag: 'ui@0.2.0',
      commits: [commit('feat(ui): Add a deploy centre')],
    });
    expect(release).toMatchObject({ nextVersion: '0.3.0', tag: 'ui@0.3.0', bump: 'minor', previousTag: 'ui@0.2.0' });
  });

  it('starts an untagged application at 0.1.0 without listing its whole history', () => {
    expect(planRelease({ app, currentVersion: '0.0.1', previousTag: undefined, commits: [] })).toMatchObject({
      nextVersion: '0.1.0',
      tag: 'ui@0.1.0',
      bump: 'first',
      commits: [],
    });
    expect(planRelease({ app, currentVersion: '1.4.0', previousTag: undefined, commits: [] })).toMatchObject({
      nextVersion: '1.4.0',
      tag: 'ui@1.4.0',
    });
  });
});

describe('changelogs', () => {
  const release: AppRelease = {
    ...app,
    currentVersion: '0.2.0',
    nextVersion: '0.3.0',
    previousTag: 'ui@0.2.0',
    tag: 'ui@0.3.0',
    bump: 'minor',
    commits: [commit('feat(ui): Add a deploy centre'), commit('fix(ui): Close the dialog'), commit('build(ui): Pin')],
  };

  it('groups commits by conventional type', () => {
    expect(changelogSection(release, '2026-10-02')).toBe(
      [
        '## 0.3.0 (2026-10-02)',
        '',
        '### Features',
        '',
        '- feat(ui): Add a deploy centre (abcdef012)',
        '',
        '### Fixes',
        '',
        '- fix(ui): Close the dialog (abcdef012)',
        '',
        '### Other changes',
        '',
        '- build(ui): Pin (abcdef012)',
        '',
      ].join('\n'),
    );
  });

  it('prepends below the title and reads one version back as release notes', () => {
    const first = prependChangelog(undefined, 'Changelog', '## 0.1.0 (2026-10-01)\n\nFirst.\n');
    const second = prependChangelog(first, 'Changelog', changelogSection(release, '2026-10-02'));
    expect(second.startsWith('# Changelog\n\n## 0.3.0 (2026-10-02)\n')).toBe(true);
    expect(changelogNotes(second, '0.1.0')).toBe('First.');
    expect(changelogNotes(second, '0.3.0')).toContain('- fix(ui): Close the dialog (abcdef012)');
    expect(changelogNotes(second, '9.9.9')).toBe('');
  });

  it('names every application in the release commit subject', () => {
    expect(releaseCommitSubject([release, { ...release, name: 'api', nextVersion: '1.0.1' }])).toBe(
      'chore(release): ui v0.3.0, api v1.0.1',
    );
  });
});

describe('selectRelease', () => {
  const apps = [{ name: 'api' }, { name: 'desktop' }, { name: 'ui' }];
  const pending = (name: string): AppRelease => ({
    name,
    root: `apps/${name}`,
    currentVersion: '0.1.0',
    nextVersion: '0.2.0',
    previousTag: `${name}@0.1.0`,
    tag: `${name}@0.2.0`,
    bump: 'minor',
    commits: [commit(`feat(${name}): Add`)],
  });

  it('keeps only the named application, so one release commit versions one application', () => {
    expect(selectRelease([pending('api'), pending('ui')], apps, 'ui').map(({ name }) => name)).toEqual(['ui']);
    expect(releaseCommitSubject(selectRelease([pending('api'), pending('ui')], apps, 'api'))).toBe(
      'chore(release): api v0.2.0',
    );
  });

  it('returns nothing for an application with no pending release', () => {
    expect(selectRelease([pending('api')], apps, 'desktop')).toEqual([]);
  });

  it('rejects a name that is not an application', () => {
    expect(() => selectRelease([], apps, 'docs')).toThrow(
      '"docs" is not an application; expected one of api, desktop, ui',
    );
    expect(() => selectRelease([], apps, undefined)).toThrow('is not an application');
  });
});

describe('setManifestVersion', () => {
  it('rewrites only the top-level version', () => {
    const manifest =
      '{\n  "name": "@taucad/ui",\n  "version": "0.0.1",\n  "dependencies": {\n    "x": "1.0.0"\n  }\n}\n';
    expect(setManifestVersion(manifest, '0.1.0')).toBe(manifest.replace('"0.0.1"', '"0.1.0"'));
    expect(() => setManifestVersion('{}', '0.1.0')).toThrow(/no top-level/u);
  });
});
