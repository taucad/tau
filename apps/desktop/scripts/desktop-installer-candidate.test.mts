/** Behavioral source-run and archive admission checks with inert asar fixtures; no signing or external service mutations. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPackage } from '@electron/asar';
import { z } from 'zod';
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
      '#!/usr/bin/env node\nimport fs from "node:fs";\nconst has = (part) => process.argv.some(arg => arg.includes(part));\nif (has("/zip")) process.stdout.write(fs.readFileSync(process.env.TEST_ARCHIVE));\nelse console.log(has("/jobs?") ? process.env.TEST_JOBS : has("/artifacts?") ? process.env.TEST_ARTIFACTS : process.env.TEST_RUN);\n',
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
    // A Linux-only candidate needs only its own jobs: release attachment waits for macOS signing and notarization.
    const linuxJobs = ['resolve', `Verify ${linuxTag}`, 'Package linux-x64 (unsigned)'].map((name) => ({
      name,
      head_sha: source,
      run_id: 123,
      status: 'completed',
      conclusion: 'success',
    }));
    const linuxArtifact = {
      id: 789,
      name: 'desktop-linux-x64',
      expired: false,
      digest: `sha256:${'c'.repeat(64)}`,
      workflow_run: { id: 123, head_sha: source },
    };
    const linuxResolve = {
      DESKTOP_RELEASE_TAG: linuxTag,
      TAU_DESKTOP_QUALIFICATION_SCOPE: 'linux',
      TEST_JOBS: JSON.stringify([{ jobs: linuxJobs }]),
      TEST_RUN: JSON.stringify({ ...successful, conclusion: 'failure' }),
      TEST_ARTIFACTS: JSON.stringify({ artifacts: [linuxArtifact] }),
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
    // The release run may still be packaging, signing or notarizing macOS; only a Linux candidate may start then.
    const inProgress = JSON.stringify({ ...successful, status: 'in_progress', conclusion: null });
    const early = run('resolve', { ...linuxResolve, TEST_RUN: inProgress });
    assert.equal(early.status, 0, early.stderr);
    const attachQueued = { ...linuxJobs[0]!, name: 'Attach immutable candidate assets', status: 'queued' };
    const queuedJobs = JSON.stringify([{ jobs: [...linuxJobs, attachQueued] }]);
    assert.equal(run('resolve', { ...linuxResolve, TEST_RUN: inProgress, TEST_JOBS: queuedJobs }).status, 0);
    assert.equal(run('resolve', { TEST_RUN: inProgress }).status, 1);
    // The archive artifact must be exactly one unexpired output of the exact run and source with a recorded digest.
    for (const artifacts of [
      [],
      [linuxArtifact, { ...linuxArtifact, id: 790 }],
      [{ ...linuxArtifact, expired: true }],
      [{ ...linuxArtifact, digest: null }],
      [{ ...linuxArtifact, digest: 'md5:abc' }],
      [{ ...linuxArtifact, workflow_run: { id: 456, head_sha: source } }],
      [{ ...linuxArtifact, workflow_run: { id: 123, head_sha: 'b'.repeat(40) } }],
      [{ ...linuxArtifact, name: 'desktop-win32-x64' }],
    ]) {
      assert.equal(run('resolve', { ...linuxResolve, TEST_ARTIFACTS: JSON.stringify({ artifacts }) }).status, 1);
    }
    for (const index of [0, 1, 2]) {
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
    // Mac-only staging is Apple silicon only: it admits a failed whole run only when its own exact Apple silicon
    // prerequisite jobs succeeded.
    const macJobs = [
      'resolve',
      `Verify ${linuxTag}`,
      'Package macOS arm64 (signed)',
      'Verify native macOS arm64 OTA replacement',
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
    // Intel Mac jobs are outside the Mac-only scope: their failure cannot block an Apple silicon candidate.
    const intelJobs = ['Package macOS x64 (signed)', 'Verify native macOS x64 OTA replacement'].map((name) => ({
      name,
      head_sha: source,
      run_id: 123,
      status: 'completed',
      conclusion: 'failure',
    }));
    assert.equal(
      run('resolve', { ...macResolve, TEST_JOBS: JSON.stringify([{ jobs: [...macJobs, ...intelJobs] }]) }).status,
      0,
    );
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
    // Release metadata exists only once every platform is attached, so a Linux-only candidate never preflights it.
    const linuxOnly = run('preflight', linuxPreflight);
    assert.equal(linuxOnly.status, 1);
    assert.match(linuxOnly.stderr, /release-build archive artifact/u);
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
    // Mac-only preflight needs the Apple silicon archive, never an Intel Mac, Windows or Linux one in its place.
    const macPreflight = { ...linuxPreflight, TAU_DESKTOP_QUALIFICATION_SCOPE: 'macos' };
    const macAssets = {
      'darwin-arm64': {
        ...metadata.assets['linux-x64'],
        url: 'https://downloads.taucad.dev/releases/desktop-staging%400.2.0-staging.3/Tau-macos-arm64.zip',
      },
    };
    const intelAsset = {
      ...metadata.assets['linux-x64'],
      url: 'https://downloads.taucad.dev/releases/desktop-staging%400.2.0-staging.3/Tau-macos-x64.zip',
    };
    await writeFile(join(archives, 'download.json'), JSON.stringify({ ...linuxMetadata, assets: macAssets }));
    const macOnly = run('preflight', macPreflight);
    assert.equal(macOnly.status, 0, macOnly.stderr);
    assert.equal(run('preflight', linuxPreflight).status, 1);
    assert.equal(run('preflight', { ...macPreflight, TAU_DESKTOP_QUALIFICATION_SCOPE: 'all' }).status, 1);
    // Apple silicon alone never satisfies the full scope, which still needs both Mac archives.
    assert.equal(run('preflight', { ...macPreflight, TAU_DESKTOP_QUALIFICATION_SCOPE: 'all' }).status, 1);
    await writeFile(
      join(archives, 'download.json'),
      JSON.stringify({ ...linuxMetadata, assets: { 'darwin-x64': intelAsset } }),
    );
    const intelOnly = run('preflight', macPreflight);
    assert.equal(intelOnly.status, 1);
    assert.match(intelOnly.stderr, /require the Apple silicon archive/u);
    await writeFile(join(archives, 'download.json'), JSON.stringify(linuxMetadata));
    assert.equal(run('preflight', macPreflight).status, 1);
    assert.equal(run('preflight', { ...macPreflight, DESKTOP_RELEASE_TAG: tag }).status, 1);
    // A Mac-only candidate cannot stage another platform's archive, nor an Intel Mac one.
    for (const target of ['darwin-x64', 'linux-x64', 'win32-x64']) {
      const refused = run('stage', {
        ...macPreflight,
        DESKTOP_CANDIDATE_TARGET: target,
        DESKTOP_CANDIDATE_STAGE: join(root, `mac-${target}`),
      });
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /cannot stage another platform/u);
    }
    // The assembled Mac-only manifest must be exactly the Apple silicon ZIP/DMG pair from this tag and source.
    const assets = join(root, 'assets');
    await mkdir(assets);
    const macArtifactsFor = (archs: ReadonlyArray<'arm64' | 'x64'>) =>
      archs.flatMap((arch) =>
        (['macos-zip', 'macos-dmg'] as const).map((kind, index) => ({
          kind,
          target: `darwin-${arch}`,
          format: desktopArtifactKinds[kind].format,
          roles: [...desktopArtifactKinds[kind].roles],
          name: desktopArtifactName({ kind, channel: 'staging', version: '1.0.3', arch }),
          size: 10,
          sha256: String(index + (arch === 'arm64' ? 1 : 3)).repeat(64),
          sha512: Buffer.alloc(64, index + (arch === 'arm64' ? 1 : 3)).toString('base64'),
        })),
      );
    const macArtifacts = macArtifactsFor(['arm64']);
    const macManifest = {
      schemaVersion: 1,
      tag: linuxMetadata.tag,
      channel: 'staging',
      version: '1.0.3',
      sourceCommit: source,
      artifacts: macArtifacts,
    };
    let admission = 0;
    const admitScopeResult = async (manifest: unknown, changes: Record<string, string> = {}) => {
      const directory = join(assets, String(++admission));
      await mkdir(directory);
      await writeFile(join(directory, 'desktop-artifacts.json'), JSON.stringify(manifest));
      return run('admit-scope', { ...macPreflight, DESKTOP_ASSETS_DIR: directory, ...changes });
    };
    const admitScope = async (manifest: unknown, changes: Record<string, string> = {}): Promise<number | undefined> => {
      const result = await admitScopeResult(manifest, changes);
      return result.status ?? undefined;
    };
    const scoped = await admitScope(macManifest);
    assert.equal(scoped, 0);
    // Any Intel Mac artifact is refused by the Apple silicon rule: the former two-architecture candidate, Intel in place
    // of Apple silicon, and an Intel ZIP added to the exact Apple silicon pair.
    const intelRefusals = await Promise.all(
      [
        macArtifactsFor(['arm64', 'x64']),
        macArtifactsFor(['x64']),
        [...macArtifacts, ...macArtifactsFor(['x64']).filter((artifact) => artifact.kind === 'macos-zip')],
      ].map(async (artifacts) => admitScopeResult({ ...macManifest, artifacts })),
    );
    for (const refused of intelRefusals) {
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /Mac-only publication requires exactly staging ZIP and DMG for Apple silicon/u);
    }
    const refusedManifests = [
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

    // A Linux-only staging candidate stages the exact release run's archive artifact, never release metadata.
    const linuxRoot = join(root, 'linux-artifact');
    const linuxApp = join(linuxRoot, 'Tau-linux-x64');
    await mkdir(join(linuxApp, 'resources'), { recursive: true });
    const linuxContent = join(linuxRoot, 'content');
    await mkdir(linuxContent);
    await writeFile(
      join(linuxContent, 'package.json'),
      JSON.stringify({ version: '1.0.3', tauDesktop: { sourceCommit: source, channel: 'staging' } }),
    );
    await createPackage(linuxContent, join(linuxApp, 'resources/app.asar'));
    const linuxArchive = join(linuxRoot, 'Tau-linux-x64.tar.gz');
    execFileSync('tar', ['-czf', linuxArchive, '-C', linuxRoot, 'Tau-linux-x64']);
    const zipArtifact = (name: string, members: string[]): string => {
      const path = join(linuxRoot, name);
      execFileSync('zip', ['-q', '-j', path, ...members]);
      return path;
    };
    const digestOf = async (path: string): Promise<string> =>
      `sha256:${createHash('sha256')
        .update(await readFile(path))
        .digest('hex')}`;
    const linuxZip = zipArtifact('linux.zip', [linuxArchive]);
    const linuxDigest = await digestOf(linuxZip);
    const linuxArtifacts = (changes: Record<string, unknown> = {}) =>
      JSON.stringify({ artifacts: [{ ...linuxArtifact, digest: linuxDigest, ...changes }] });
    let linuxStageAttempt = 0;
    const stageLinux = (changes: Record<string, string> = {}) => {
      const attempt = linuxStageAttempt++;
      return run('stage', {
        ...linuxResolve,
        DESKTOP_CANDIDATE_TARGET: 'linux-x64',
        DESKTOP_CANDIDATE_ARCHIVES: join(linuxRoot, `input-${attempt}`),
        DESKTOP_CANDIDATE_STAGE: join(linuxRoot, `stage-${attempt}`),
        TEST_ARCHIVE: linuxZip,
        TEST_ARTIFACTS: linuxArtifacts(),
        ...changes,
      });
    };
    const linuxStaged = stageLinux();
    assert.equal(linuxStaged.status, 0, linuxStaged.stderr);
    const recorded = z
      .object({ releaseRunId: z.literal('123'), artifactId: z.literal(789), artifactSha256: z.string() })
      .parse(JSON.parse(await readFile(join(linuxRoot, 'stage-0', 'candidate-source.json'), 'utf8')));
    assert.equal(recorded.artifactSha256, linuxDigest.slice('sha256:'.length));
    // Wrong digest, another run's or source's artifact, extra members, a foreign application and pre-filled input refuse.
    const foreign = join(linuxRoot, 'foreign');
    await mkdir(foreign);
    execFileSync('tar', ['-czf', join(foreign, 'Tau-linux-x64.tar.gz'), '-C', root, 'Tau-linux-x64']);
    const foreignZip = zipArtifact('foreign.zip', [join(foreign, 'Tau-linux-x64.tar.gz')]);
    const extraZip = zipArtifact('extra.zip', [linuxArchive, join(linuxContent, 'package.json')]);
    const prefilled = join(linuxRoot, 'prefilled');
    await mkdir(prefilled);
    const linuxRefusals: Array<Record<string, string>> = [
      { TEST_ARTIFACTS: linuxArtifacts({ digest: `sha256:${'f'.repeat(64)}` }) },
      { TEST_ARTIFACTS: linuxArtifacts({ workflow_run: { id: 456, head_sha: source } }) },
      { TEST_ARTIFACTS: linuxArtifacts({ workflow_run: { id: 123, head_sha: 'b'.repeat(40) } }) },
      { TAU_DESKTOP_SOURCE_SHA: 'b'.repeat(40) },
      { TEST_ARCHIVE: extraZip, TEST_ARTIFACTS: linuxArtifacts({ digest: await digestOf(extraZip) }) },
      { TEST_ARCHIVE: foreignZip, TEST_ARTIFACTS: linuxArtifacts({ digest: await digestOf(foreignZip) }) },
      { DESKTOP_CANDIDATE_ARCHIVES: prefilled },
    ];
    for (const changes of linuxRefusals) {
      const refused = stageLinux(changes);
      assert.equal(refused.status, 1, JSON.stringify(Object.keys(changes)));
    }

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
      // A fresh checkout has no `out/`: the parent of every candidate directory starts absent.
      const directory = join(root, `fetch-${fetchAttempt++}`, 'qualification-candidate');
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
