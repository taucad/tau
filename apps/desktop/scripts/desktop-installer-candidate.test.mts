/** Behavioral source-run and archive admission checks with inert asar fixtures; no signing or external service mutations. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPackage } from '@electron/asar';
import { desktopArtifactKinds, desktopArtifactName } from '#shared/desktop-release.js';
/* eslint-disable @typescript-eslint/naming-convention -- Tests exercise exact external GitHub wire fields and process environment keys. */
const main = async (): Promise<void> => {
  assert.notEqual(process.platform, 'win32', 'Source-run command stubs use a POSIX test host');
  const root = await mkdtemp(join(tmpdir(), 'tau-candidate-'));
  try {
    const tools = join(root, 'tools');
    await mkdir(tools);
    const gh = join(tools, 'gh');
    const git = join(tools, 'git');
    await writeFile(
      gh,
      '#!/usr/bin/env node\nconsole.log(process.argv.some(arg => arg.includes("/jobs?")) ? process.env.TEST_JOBS : process.env.TEST_RUN);\n',
    );
    await writeFile(
      git,
      '#!/usr/bin/env node\nif(process.argv[2]==="rev-parse") console.log(process.env.TEST_SOURCE);\n',
    );
    await Promise.all([chmod(gh, 0o755), chmod(git, 0o755)]);
    const source = 'a'.repeat(40);
    const tag = 'desktop@0.2.0';
    const successful = {
      head_sha: source,
      path: '.github/workflows/release-build.yml',
      event: 'push',
      conclusion: 'success',
      status: 'completed',
      head_repository: { full_name: 'taucad/tau' },
      repository: { full_name: 'taucad/tau' },
    };
    const environment = {
      ...process.env,
      PATH: `${tools}:${process.env['PATH'] ?? ''}`,
      GITHUB_REF: 'refs/heads/main',
      GITHUB_REPOSITORY: 'taucad/tau',
      GITHUB_OUTPUT: join(root, 'outputs'),
      DESKTOP_RELEASE_TAG: tag,
      DESKTOP_RELEASE_RUN_ID: '123',
      TAU_DESKTOP_SOURCE_SHA: source,
      TEST_SOURCE: source,
      TEST_RUN: JSON.stringify(successful),
    };
    const run = (operation: string, changes: Record<string, string> = {}) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          '@oxc-node/core/register',
          resolve('apps/desktop/scripts/desktop-installer-candidate.mts'),
          operation,
        ],
        { env: { ...environment, ...changes }, encoding: 'utf8' },
      );
    assert.equal(run('resolve').status, 0, run('resolve').stderr);
    for (const change of [
      { head_sha: 'b'.repeat(40) },
      { path: '.github/workflows/other.yml' },
      { event: 'pull_request' },
      { conclusion: 'failure' },
      { head_repository: { full_name: 'attacker/tau' } },
    ]) {
      assert.equal(run('resolve', { TEST_RUN: JSON.stringify({ ...successful, ...change }) }).status, 1);
    }
    assert.equal(run('resolve', { GITHUB_REF: 'refs/heads/untrusted' }).status, 1);
    const linuxTag = 'desktop-staging@0.2.0-staging.3';
    const linuxJobs = [
      'resolve',
      `Verify ${linuxTag}`,
      'Package linux-x64 (unsigned)',
      'Attach immutable candidate assets',
    ].map((name) => ({ name, head_sha: source, run_id: 123, status: 'completed', conclusion: 'success' }));
    const linuxResolve = {
      DESKTOP_RELEASE_TAG: linuxTag,
      TAU_DESKTOP_QUALIFICATION_SCOPE: 'linux',
      TEST_JOBS: JSON.stringify([{ jobs: linuxJobs }]),
      TEST_RUN: JSON.stringify({ ...successful, conclusion: 'failure' }),
    };
    const admitted = run('resolve', linuxResolve);
    assert.equal(admitted.status, 0, admitted.stderr);
    assert.equal(run('resolve', { ...linuxResolve, TAU_DESKTOP_QUALIFICATION_SCOPE: 'all' }).status, 1);
    for (const conclusion of ['cancelled', 'timed_out']) {
      assert.equal(
        run('resolve', { ...linuxResolve, TEST_RUN: JSON.stringify({ ...successful, conclusion }) }).status,
        1,
      );
    }
    for (const index of [0, 1, 2, 3]) {
      for (const change of [
        { conclusion: 'failure' },
        { conclusion: 'skipped' },
        { status: 'in_progress' },
        { head_sha: 'b'.repeat(40) },
        { run_id: 456 },
      ]) {
        const jobs = linuxJobs.map((job, jobIndex) => (jobIndex === index ? { ...job, ...change } : job));
        assert.equal(run('resolve', { ...linuxResolve, TEST_JOBS: JSON.stringify([{ jobs }]) }).status, 1);
      }
      assert.equal(
        run('resolve', {
          ...linuxResolve,
          TEST_JOBS: JSON.stringify([{ jobs: linuxJobs.filter((_, jobIndex) => jobIndex !== index) }]),
        }).status,
        1,
      );
    }
    assert.equal(
      run('resolve', { ...linuxResolve, TEST_JOBS: JSON.stringify([{ jobs: [...linuxJobs, linuxJobs[0]] }]) }).status,
      1,
    );
    assert.equal(
      run('resolve', {
        ...linuxResolve,
        TEST_JOBS: JSON.stringify([{ jobs: linuxJobs.slice(0, 2) }, { jobs: linuxJobs.slice(2) }]),
      }).status,
      0,
    );
    // Mac-only staging admits a failed whole run only when its own exact Mac prerequisite jobs succeeded.
    const macJobs = [
      'resolve',
      `Verify ${linuxTag}`,
      'Package macOS arm64 (signed)',
      'Package macOS x64 (signed)',
      'Verify native macOS arm64 OTA replacement',
      'Verify native macOS x64 OTA replacement',
      'Attach immutable candidate assets',
    ].map((name) => ({ name, head_sha: source, run_id: 123, status: 'completed', conclusion: 'success' }));
    const macResolve = {
      ...linuxResolve,
      TAU_DESKTOP_QUALIFICATION_SCOPE: 'macos',
      TEST_JOBS: JSON.stringify([{ jobs: macJobs }]),
    };
    const macAdmitted = run('resolve', macResolve);
    assert.equal(macAdmitted.status, 0, macAdmitted.stderr);
    assert.equal(run('resolve', { ...macResolve, TEST_RUN: JSON.stringify(successful) }).status, 0);
    // Linux prerequisites never satisfy a Mac-only candidate, and production has no Mac-only scope.
    assert.equal(run('resolve', { ...macResolve, TEST_JOBS: JSON.stringify([{ jobs: linuxJobs }]) }).status, 1);
    assert.equal(run('resolve', { ...macResolve, DESKTOP_RELEASE_TAG: tag }).status, 1);
    assert.equal(
      run('resolve', { ...macResolve, TEST_RUN: JSON.stringify({ ...successful, conclusion: 'cancelled' }) }).status,
      1,
    );
    for (const index of macJobs.keys()) {
      for (const change of [{ conclusion: 'failure' }, { head_sha: 'b'.repeat(40) }, { run_id: 456 }]) {
        const jobs = macJobs.map((job, jobIndex) => (jobIndex === index ? { ...job, ...change } : job));
        assert.equal(run('resolve', { ...macResolve, TEST_JOBS: JSON.stringify([{ jobs }]) }).status, 1);
      }
      assert.equal(
        run('resolve', {
          ...macResolve,
          TEST_JOBS: JSON.stringify([{ jobs: macJobs.filter((_, jobIndex) => jobIndex !== index) }]),
        }).status,
        1,
      );
    }
    const archives = join(root, 'archives');
    await mkdir(archives);
    const app = join(root, 'Tau-linux-x64');
    await mkdir(join(app, 'resources'), { recursive: true });
    const content = join(root, 'content');
    await mkdir(content);
    await writeFile(
      join(content, 'package.json'),
      JSON.stringify({ version: '0.2.0', tauDesktop: { sourceCommit: source, channel: 'production' } }),
    );
    await createPackage(content, join(app, 'resources/app.asar'));
    const archive = join(archives, 'Tau-linux-x64.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', root, 'Tau-linux-x64']);
    const data = await readFile(archive);
    const metadata = {
      tag,
      version: '0.2.0',
      channel: 'production',
      sourceCommit: source,
      assets: {
        'linux-x64': {
          url: 'https://downloads.tau.new/releases/desktop%400.2.0/Tau-linux-x64.tar.gz',
          sha256: createHash('sha256').update(data).digest('hex'),
          size: data.length,
        },
      },
    };
    await writeFile(join(archives, 'download.json'), JSON.stringify(metadata));
    const preflight = { DESKTOP_CANDIDATE_ARCHIVES: archives };
    const partial = run('preflight', preflight);
    assert.equal(partial.status, 1);
    assert.match(partial.stderr, /Intel Mac enabled and notarization enabled/u);
    assert.equal(run('resolve', { TAU_DESKTOP_QUALIFICATION_SCOPE: 'linux' }).status, 1);
    assert.equal(run('resolve', { TAU_DESKTOP_QUALIFICATION_SCOPE: 'unknown' }).status, 1);
    const linuxMetadata = { ...metadata, tag: 'desktop-staging@0.2.0-staging.3', version: '1.0.3', channel: 'staging' };
    await writeFile(join(archives, 'download.json'), JSON.stringify(linuxMetadata));
    const linuxPreflight = {
      ...preflight,
      DESKTOP_RELEASE_TAG: linuxMetadata.tag,
      TAU_DESKTOP_QUALIFICATION_SCOPE: 'linux',
    };
    const linuxOnly = run('preflight', linuxPreflight);
    assert.equal(linuxOnly.status, 0, linuxOnly.stderr);
    assert.equal(run('preflight', { ...linuxPreflight, TAU_DESKTOP_QUALIFICATION_SCOPE: 'all' }).status, 1);
    await writeFile(join(archives, 'download.json'), JSON.stringify({ ...linuxMetadata, assets: {} }));
    assert.equal(run('preflight', linuxPreflight).status, 1);
    await writeFile(join(archives, 'download.json'), JSON.stringify(metadata));

    const full = {
      ...metadata,
      assets: {
        ...metadata.assets,
        'darwin-arm64': {
          ...metadata.assets['linux-x64'],
          url: metadata.assets['linux-x64'].url.replace('Tau-linux-x64.tar.gz', 'Tau-macos-arm64.zip'),
        },
        'darwin-x64': {
          ...metadata.assets['linux-x64'],
          url: metadata.assets['linux-x64'].url.replace('Tau-linux-x64.tar.gz', 'Tau-macos-x64.zip'),
        },
        'win32-x64': {
          ...metadata.assets['linux-x64'],
          url: metadata.assets['linux-x64'].url.replace('Tau-linux-x64.tar.gz', 'Tau-win32-x64.zip'),
        },
      },
    };
    await writeFile(join(archives, 'download.json'), JSON.stringify(full));
    assert.equal(run('preflight', preflight).status, 0);
    // Mac-only preflight needs exactly both Mac archives, never Windows or Linux ones.
    const macPreflight = { ...linuxPreflight, TAU_DESKTOP_QUALIFICATION_SCOPE: 'macos' };
    const macAssets = {
      'darwin-arm64': {
        ...metadata.assets['linux-x64'],
        url: 'https://downloads.taucad.dev/releases/desktop-staging%400.2.0-staging.3/Tau-macos-arm64.zip',
      },
      'darwin-x64': {
        ...metadata.assets['linux-x64'],
        url: 'https://downloads.taucad.dev/releases/desktop-staging%400.2.0-staging.3/Tau-macos-x64.zip',
      },
    };
    await writeFile(join(archives, 'download.json'), JSON.stringify({ ...linuxMetadata, assets: macAssets }));
    const macOnly = run('preflight', macPreflight);
    assert.equal(macOnly.status, 0, macOnly.stderr);
    assert.equal(run('preflight', linuxPreflight).status, 1);
    assert.equal(run('preflight', { ...macPreflight, TAU_DESKTOP_QUALIFICATION_SCOPE: 'all' }).status, 1);
    await writeFile(
      join(archives, 'download.json'),
      JSON.stringify({ ...linuxMetadata, assets: { 'darwin-arm64': macAssets['darwin-arm64'] } }),
    );
    const singleArchitecture = run('preflight', macPreflight);
    assert.equal(singleArchitecture.status, 1);
    assert.match(singleArchitecture.stderr, /both Mac archives/u);
    await writeFile(join(archives, 'download.json'), JSON.stringify(linuxMetadata));
    assert.equal(run('preflight', macPreflight).status, 1);
    assert.equal(run('preflight', { ...macPreflight, DESKTOP_RELEASE_TAG: tag }).status, 1);
    // A Mac-only candidate cannot stage another platform's archive.
    for (const target of ['linux-x64', 'win32-x64']) {
      const refused = run('stage', {
        ...macPreflight,
        DESKTOP_CANDIDATE_TARGET: target,
        DESKTOP_CANDIDATE_STAGE: join(root, `mac-${target}`),
      });
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /cannot stage another platform/u);
    }
    // The assembled Mac-only manifest must be exactly both ZIP/DMG pairs from this tag and source.
    const assets = join(root, 'assets');
    await mkdir(assets);
    const macArtifacts = (['arm64', 'x64'] as const).flatMap((arch) =>
      (['macos-zip', 'macos-dmg'] as const).map((kind, index) => ({
        kind,
        target: `darwin-${arch}`,
        format: desktopArtifactKinds[kind].format,
        roles: [...desktopArtifactKinds[kind].roles],
        name: desktopArtifactName({ kind, channel: 'staging', version: '1.0.3', arch }),
        size: 10,
        sha256: String(index + 1).repeat(64),
        sha512: Buffer.alloc(64, index + 1).toString('base64'),
      })),
    );
    const macManifest = {
      schemaVersion: 1,
      tag: linuxMetadata.tag,
      channel: 'staging',
      version: '1.0.3',
      sourceCommit: source,
      artifacts: macArtifacts,
    };
    let admission = 0;
    const admitScope = async (manifest: unknown, changes: Record<string, string> = {}): Promise<number | undefined> => {
      const directory = join(assets, String(++admission));
      await mkdir(directory);
      await writeFile(join(directory, 'desktop-artifacts.json'), JSON.stringify(manifest));
      const result = run('admit-scope', { ...macPreflight, DESKTOP_ASSETS_DIR: directory, ...changes });
      return result.status ?? undefined;
    };
    const scoped = await admitScope(macManifest);
    assert.equal(scoped, 0);
    const refusedManifests = [
      { ...macManifest, artifacts: macArtifacts.filter((artifact) => artifact.target === 'darwin-arm64') },
      { ...macManifest, artifacts: macArtifacts.filter((artifact) => artifact.kind === 'macos-zip') },
      { ...macManifest, sourceCommit: 'b'.repeat(40) },
      {
        ...macManifest,
        artifacts: [
          ...macArtifacts,
          {
            kind: 'windows-nsis',
            target: 'win32-x64',
            format: desktopArtifactKinds['windows-nsis'].format,
            roles: [...desktopArtifactKinds['windows-nsis'].roles],
            name: desktopArtifactName({ kind: 'windows-nsis', channel: 'staging', version: '1.0.3', arch: 'x64' }),
            size: 10,
            sha256: '9'.repeat(64),
            sha512: Buffer.alloc(64, 9).toString('base64'),
          },
        ],
      },
    ];
    const refusals = await Promise.all([
      ...refusedManifests.map(async (manifest) => admitScope(manifest)),
      admitScope(macManifest, { TAU_DESKTOP_QUALIFICATION_SCOPE: 'linux' }),
    ]);
    assert.deepEqual(
      refusals,
      refusals.map(() => 1),
    );
    await writeFile(join(archives, 'download.json'), JSON.stringify(metadata));

    const staging = {
      DESKTOP_CANDIDATE_ARCHIVES: archives,
      DESKTOP_CANDIDATE_TARGET: 'linux-x64',
      DESKTOP_CANDIDATE_STAGE: join(root, 'stage'),
    };
    const valid = run('stage', staging);
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(run('stage', { ...staging, TAU_DESKTOP_SOURCE_SHA: 'b'.repeat(40) }).status, 1);
    await writeFile(archive, 'tampered');
    assert.equal(run('stage', { ...staging, DESKTOP_CANDIDATE_STAGE: join(root, 'tamper-stage') }).status, 1);

    // Exercise the actual fetch executable: Windows consumers fetch the existing all-platform archive.
    const fetchedName = 'inert-candidate.txt';
    await writeFile(join(root, fetchedName), 'authenticated fixture bytes');
    const fetchArchive = join(root, 'fetch.zip');
    execFileSync('zip', ['-q', fetchArchive, fetchedName], { cwd: root });
    const archiveDigest = `sha256:${createHash('sha256')
      .update(await readFile(fetchArchive))
      .digest('hex')}`;
    await writeFile(
      gh,
      '#!/usr/bin/env node\nimport fs from "node:fs";\nconst path=process.argv[3];\nif(path.endsWith("/zip")) process.stdout.write(fs.readFileSync(process.env.TEST_ARCHIVE));\nelse console.log(path.includes("/artifacts?") ? process.env.TEST_ARTIFACTS : process.env.TEST_RUN);\n',
    );
    const candidateRun = {
      ...successful,
      id: 123,
      path: '.github/workflows/desktop-installer-candidate.yml',
      head_branch: 'main',
      event: 'workflow_dispatch',
    };
    const candidateArtifact = {
      id: 456,
      name: 'desktop-installer-candidate',
      expired: false,
      digest: archiveDigest,
      workflow_run: { id: 123, head_sha: source },
    };
    let fetchAttempt = 0;
    const fetchCandidate = (scope: string, changes: Record<string, unknown> = {}) => {
      const directory = join(root, `fetch-${fetchAttempt++}`);
      const result = spawnSync(
        process.execPath,
        ['--import', '@oxc-node/core/register', resolve('apps/desktop/scripts/fetch-desktop-installer-candidate.mts')],
        {
          env: {
            ...environment,
            TAU_INSTALLER_CANDIDATE_RUN_ID: '123',
            GITHUB_SHA: source,
            DESKTOP_ASSETS_DIR: directory,
            TAU_DESKTOP_QUALIFICATION_SCOPE: scope,
            TEST_RUN: JSON.stringify(candidateRun),
            TEST_ARTIFACTS: JSON.stringify({ artifacts: [{ ...candidateArtifact, ...changes }] }),
            TEST_ARCHIVE: fetchArchive,
          },
          encoding: 'utf8',
        },
      );
      return { result, directory };
    };
    for (const [scope, name] of [
      ['all', 'desktop-installer-candidate'],
      ['windows', 'desktop-installer-candidate'],
      ['macos', 'desktop-macos-installer-candidate'],
      ['linux', 'desktop-linux-installer-candidate'],
    ]) {
      const fetched = fetchCandidate(scope!, { name });
      assert.equal(fetched.result.status, 0, fetched.result.stderr);
      // oxlint-disable-next-line no-await-in-loop -- Verify each subprocess's extracted bytes before advancing scopes.
      assert.equal(await readFile(join(fetched.directory, fetchedName), 'utf8'), 'authenticated fixture bytes');
    }
    for (const changes of [
      { name: 'desktop-windows-installer-candidate' },
      { name: 'desktop-linux-installer-candidate' },
      { name: 'desktop-macos-installer-candidate' },
      { expired: true },
      { digest: `sha256:${'f'.repeat(64)}` },
      { workflow_run: { id: 999, head_sha: source } },
    ]) {
      const fetched = fetchCandidate('windows', changes);
      assert.equal(fetched.result.status, 1);
      assert.match(fetched.result.stderr, /Candidate artifact provenance refused|Candidate archive digest differs/u);
    }
    assert.equal(fetchCandidate('windows-ci').result.status, 1);
    console.log(
      'Passed candidate source-run, Linux and Mac prerequisite, Mac-only scope and exact archive admission scenarios.',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

/* eslint-enable @typescript-eslint/naming-convention -- End external protocol fixtures. */
