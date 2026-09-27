import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { allowedReleaseFiles, deriveRelease, releaseFiles } from '../../scripts/ci-release.mjs';
import {
  validateRequestedVersion,
  versionFromPlans,
  withoutNonHumanAuthors,
} from '../../scripts/prepare-release.mjs';

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
  it('publishes candidate tarballs through explicit relative paths', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    assert(workflow.includes('npm publish "./candidate/$filename" --access public --provenance'));
  });

  it('publishes one exact release commit on main', () => {
    assert.deepEqual(deriveRelease(stable), {
      kind: 'release',
      npmPublish: true,
      releaseTag: 'v0.1.0',
      version: '0.1.0',
    });
  });

  it('accepts a squash-merged release subject', () => {
    assert.equal(deriveRelease({ ...stable, subject: `${stable.subject} (#12)` }).kind, 'release');
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

  it('accepts a release commit with or without a lockfile change', () => {
    assert.equal(deriveRelease({ ...stable, changedFiles: [...stable.changedFiles, 'pnpm-lock.yaml'] }).kind, 'release');
    assert(!releaseFiles.includes('pnpm-lock.yaml'));
  });

  it('rejects a release commit that leaves a release file unchanged', () => {
    assert.throws(
      () => deriveRelease({ ...stable, changedFiles: stable.changedFiles.filter((file) => file !== 'CHANGELOG.md') }),
      /must change CHANGELOG\.md/u,
    );
  });

  it('rejects a release commit that consumes no Version Plan', () => {
    assert.throws(() => deriveRelease({ ...stable, changedFiles: releaseFiles }), /consume a Version Plan/u);
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

  it('runs a manual dispatch from any ref as evidence only', () => {
    assert.deepEqual(
      deriveRelease({ ...stable, event: 'workflow_dispatch', ref: 'refs/heads/topic', subject: 'fix: change' }),
      { kind: 'dispatch', npmPublish: false, version: '0.1.0' },
    );
  });

  it('never publishes a manual dispatch of a release commit on main', () => {
    assert.deepEqual(deriveRelease({ ...stable, event: 'workflow_dispatch' }), {
      kind: 'dispatch',
      npmPublish: false,
      version: '0.1.0',
    });
  });

  it('rejects a malformed release subject on main', () => {
    assert.throws(
      () => deriveRelease({ ...stable, subject: 'chore(release): @@CREATE_REPO_slug@@ v' }),
      /malformed release subject/u,
    );
  });
});

describe('release pull request staging', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/release-pr.yml', import.meta.url), 'utf8');
  const declaration = /^\s*allowed='([^']+)'$/mu.exec(workflow);
  const staged = /^\s*git add (.+)$/mu.exec(workflow);

  it('stages exactly the files the release policy admits', () => {
    assert(declaration && staged, 'release-pr.yml must declare its allowed pattern and stage files explicitly');
    const allowed = new RegExp(declaration[1], 'u');
    for (const file of allowedReleaseFiles) {
      assert(allowed.test(file), `release-pr.yml rejects the admitted release file ${file}`);
      assert(
        file.startsWith('npm/') ? staged[1].includes('platform_manifests') : staged[1].split(/\s+/u).includes(file),
        `release-pr.yml never stages ${file}`,
      );
    }
    assert(allowed.test('.nx/version-plans/first-release.md'));
    assert(allowed.test('npm/linux-x64-gnu/package.json'));
    assert(!allowed.test('src/index.ts'));
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

  it('rejects a requested version the plans did not produce', () => {
    assert.throws(
      () =>
        validateRequestedVersion({
          currentVersions: ['0.0.0'],
          optionalDependencyVersions: [],
          plannedVersions: ['0.1.0'],
          requestedVersion: '0.2.0',
        }),
      /does not match Version Plans/u,
    );
  });
});

describe('version derivation from plans', () => {
  it('returns the one version the pending plans dictate', () => {
    assert.equal(versionFromPlans(['0.4.0', '0.4.0']), '0.4.0');
  });

  it('rejects a release with no pending Version Plan', () => {
    assert.throws(() => versionFromPlans([undefined]), /no pending Version Plan/u);
    assert.throws(() => versionFromPlans([]), /no pending Version Plan/u);
  });
});

describe('changelog thank you section', () => {
  const entry = (authors) =>
    ['## 0.3.1 (2026-08-20)', '', '### 🩹 Fixes', '', '- a fix', '', '### ❤️ Thank You', '', ...authors, ''].join('\n');
  const published = ['## 0.3.0 (2026-08-19)', '', '### ❤️ Thank You', '', '- Claude', ''].join('\n');

  it('keeps people and drops assistants and bots', () => {
    const rendered = withoutNonHumanAuthors(
      `${entry(['- Claude', '- OpenAI Codex @oai-codex', '- Ada Lovelace @ada', '- dependabot[bot]'])}\n${published}`,
    );
    assert.match(rendered, /### ❤️ Thank You\n\n- Ada Lovelace @ada\n/u);
    assert.doesNotMatch(rendered.split('## 0.3.0')[0], /Claude|OpenAI Codex|\[bot\]/u);
    assert(rendered.endsWith(published), 'published entries stay untouched');
  });

  it('removes the heading when nobody is left to thank', () => {
    const rendered = withoutNonHumanAuthors(entry(['- tau-release-bot[bot]']));
    assert.doesNotMatch(rendered, /Thank You/u);
    assert.match(rendered, /- a fix\n$/u);
  });
});

describe('release preparation quality gate', () => {
  it('runs the gate once, outside nx release versioning', () => {
    const nxJson = JSON.parse(readFileSync(new URL('../../nx.json', import.meta.url), 'utf8'));
    const script = readFileSync(new URL('../../scripts/prepare-release.mjs', import.meta.url), 'utf8');
    assert.equal(nxJson.release.version.preVersionCommand, undefined);
    assert.equal(script.match(/:quality/gu)?.length, 1);
    assert.match(script, /execFileSync\([\s\S]*?:quality[\s\S]*?stdio: 'inherit'/u);
  });
});
