import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveRelease, releaseFiles } from '../../scripts/ci-release.mjs';
import { validateRequestedVersion } from '../../scripts/prepare-release.mjs';

const SHA = 'a'.repeat(40);
const stable = {
  event: 'push',
  ref: 'refs/heads/main',
  sha: SHA,
  packageVersion: '0.1.0',
  subject: 'chore(release): @@CREATE_REPO_slug@@ v0.1.0',
  changedFiles: ['.nx/version-plans/first.md', ...releaseFiles],
  changelog: '## 0.1.0\n',
};

describe('CI release policy', () => {
  it('publishes one exact release commit on main', () => {
    assert.deepEqual(deriveRelease(stable), {
      kind: 'release',
      npmPublish: true,
      releaseTag: 'v0.1.0',
      version: '0.1.0',
    });
  });

  it('validates but never publishes a release pull request', () => {
    assert.deepEqual(deriveRelease({ ...stable, event: 'pull_request', ref: 'refs/pull/1/merge' }), {
      kind: 'release-pull-request',
      npmPublish: false,
      version: '0.1.0',
    });
  });

  it('does not publish an ordinary main commit', () => {
    assert.deepEqual(deriveRelease({ ...stable, subject: 'fix: ordinary change', changedFiles: ['src/index.ts'] }), {
      kind: 'main',
      npmPublish: false,
      version: '0.1.0',
    });
  });

  it('rejects extra release files', () => {
    assert.throws(
      () => deriveRelease({ ...stable, changedFiles: [...stable.changedFiles, 'src/index.ts'] }),
      /unexpected files/u,
    );
  });

  it('rejects publication from an unprotected ref', () => {
    assert.throws(() => deriveRelease({ ...stable, ref: 'refs/heads/release' }), /protected main/u);
  });
});

describe('fixed release version validation', () => {
  it('accepts one planned stable version across the release group', () => {
    assert.equal(
      validateRequestedVersion({
        currentVersions: ['0.0.0'],
        optionalDependencyVersions: [],
        plannedVersions: ['0.1.0'],
        requestedVersion: '0.1.0',
      }),
      '0.1.0',
    );
  });

  it('rejects version drift inside the release group', () => {
    assert.throws(
      () =>
        validateRequestedVersion({
          currentVersions: ['0.0.0', '0.0.1'],
          optionalDependencyVersions: ['0.0.0'],
          plannedVersions: ['0.1.0', '0.1.0'],
          requestedVersion: '0.1.0',
        }),
      /different versions/u,
    );
  });
});
