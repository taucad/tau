/** Exercise collector bindings through real Git ancestry, authenticated ZIPs and publisher API admission. */
/* eslint-disable @typescript-eslint/naming-convention -- GitHub protocol fixtures. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  desktopArtifactKinds,
  desktopArtifactName,
  desktopReleaseIdentity,
  parseDesktopArtifactManifest,
} from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Exercise producer and publisher together at their existing trust boundaries. */
import { createQualificationBinding, verifyQualificationBinding } from './qualification-binding.mjs';
import { fetchDesktopQualifiedReceipts } from './desktop-receipt-provenance.mjs';
import { collectQualificationRows } from './collect-qualification-rows.mjs';
import { admitInstallerCandidate } from './fetch-desktop-installer-candidate.mjs';
/* oxlint-enable no-restricted-imports */

const root = mkdtempSync(join(tmpdir(), 'tau-qualification-binding-'));
const previousDirectory = process.cwd();
const previousEnvironment = { ...process.env };
try {
  process.chdir(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  git('config', 'user.name', 'Qualification fixture');
  git('config', 'user.email', 'qualification@example.invalid');
  const commit = (message: string) => {
    git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const source = commit('source');
  const candidateHead = commit('candidate');
  const harness = commit('qualification');
  const publication = commit('publication');
  git('checkout', '--detach', source);
  const divergent = commit('unmerged');
  git('checkout', '--detach', publication);
  const tag = 'desktop-staging@0.1.0-staging.103';
  const identity = desktopReleaseIdentity(tag);
  const manifest = parseDesktopArtifactManifest({
    schemaVersion: 1,
    tag,
    ...identity,
    sourceCommit: source,
    // The Mac-only candidate is the Apple silicon ZIP/DMG pair (operator ruling: Intel is not qualified).
    artifacts: (['arm64'] as const).flatMap((arch) =>
      (['macos-zip', 'macos-dmg'] as const).map((kind) => {
        const { platform: _platform, ...definition } = desktopArtifactKinds[kind];
        return {
          ...definition,
          kind,
          target: `darwin-${arch}`,
          name: desktopArtifactName({ ...identity, kind, arch }),
          size: 10,
          sha256: 'b'.repeat(64),
          sha512: Buffer.alloc(64).toString('base64'),
        };
      }),
    ),
  });
  const rows = manifest.artifacts.map((item) => ({
    id: `${item.kind}-${item.target.endsWith('arm64') ? 'arm64' : 'x64'}`,
    receipts: [
      {
        schemaVersion: 1,
        status: 'passed',
        tag,
        ...identity,
        sourceCommit: source,
        route: item.kind,
        target: item.target,
        artifacts: manifest.artifacts
          .filter(
            (artifact) =>
              artifact.target === item.target && (item.kind === 'macos-dmg' || artifact.kind === 'macos-zip'),
          )
          .map(({ name, sha256 }) => ({ name, sha256 })),
        baseline: { version: '1.0.1', artifactSha256: 'c'.repeat(64) },
        installed: { version: identity.version, executableSha256: 'd'.repeat(64) },
        environment: {
          os: 'Darwin 25.0.0',
          arch: item.target.endsWith('arm64') ? 'arm64' : 'x64',
          kind: 'ci',
          sandbox: 'enabled',
        },
        trust: { kind: 'release', identity: 'TEAM123456' },
        checks: { cleanInstall: true, upgrade: true, dataPreserved: true },
        suite: 'installed-route-a-b-c-v1',
        logs: 'https://github.com/taucad/tau/actions/runs/123',
      },
    ],
  }));
  const { receipts } = collectQualificationRows({
    scope: 'macos',
    kind: 'ci',
    candidate: manifest,
    sourceCommit: source,
    channel: 'staging',
    runId: '123',
    trustIdentities: { 'macos-zip': 'TEAM123456', 'macos-dmg': 'TEAM123456' },
    rows,
  });
  const repository = { full_name: 'taucad/tau' };
  const candidateRun = {
    id: 789,
    status: 'completed',
    conclusion: 'success',
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: candidateHead,
    path: '.github/workflows/desktop-installer-candidate.yml',
    repository,
    head_repository: repository,
  };
  const candidateArtifact = {
    id: 987,
    name: 'desktop-macos-installer-candidate',
    expired: false,
    digest: `sha256:${'e'.repeat(64)}`,
    workflow_run: { id: 789, head_sha: candidateHead },
  };
  const qualificationRun = {
    ...candidateRun,
    id: 123,
    head_sha: harness,
    path: '.github/workflows/desktop-route-qualification.yml',
  };
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const gh = join(bin, 'gh');
  writeFileSync(
    gh,
    `#!/usr/bin/env node
const fs = require('node:fs');
const responses = JSON.parse(fs.readFileSync(process.env.TEST_API_RESPONSES, 'utf8'));
const path = process.argv[3];
const archives = JSON.parse(process.env.TEST_RECEIPT_ARCHIVES || '{}');
if (path.endsWith('/zip')) process.stdout.write(fs.readFileSync(archives[path] || process.env.TEST_RECEIPT_ARCHIVE));
else { if (!(path in responses)) throw new Error('Unexpected API path ' + path); console.log(JSON.stringify(responses[path])); }
`,
  );
  chmodSync(gh, 0o755);
  process.env['PATH'] = `${bin}:${process.env['PATH'] ?? ''}`;
  process.env['GITHUB_SHA'] = publication;
  process.env['TAU_INSTALLER_CANDIDATE_RUN_ID'] = '789';
  process.env['TEST_API_RESPONSES'] = join(root, 'api.json');
  const api = {
    'repos/taucad/tau/actions/runs/789': candidateRun,
    'repos/taucad/tau/actions/runs/789/artifacts?per_page=100': { artifacts: [candidateArtifact] },
    'repos/taucad/tau/actions/runs/123': qualificationRun,
    'repos/taucad/tau/actions/runs/123/artifacts?per_page=100': {
      artifacts: [
        {
          id: 456,
          name: 'desktop-macos-ci-receipts',
          expired: false,
          digest: '',
          workflow_run: { id: 123, head_sha: harness },
        },
      ],
    },
  };
  const saveApi = () => {
    writeFileSync(process.env['TEST_API_RESPONSES']!, JSON.stringify(api));
  };
  saveApi();
  const candidate = admitInstallerCandidate({ runId: '789', workflowCommit: harness, scope: 'macos' });
  const binding = createQualificationBinding({ manifest, candidate, kind: 'ci', runId: 123, workflowCommit: harness });
  const verify = (input: unknown, changes = {}) => {
    verifyQualificationBinding(input, {
      manifest,
      candidate,
      kind: 'ci',
      runId: 123,
      workflowCommit: harness,
      publicationCommit: publication,
      ...changes,
    });
  };
  verify(binding);
  for (const change of [
    { sourceCommit: harness },
    { workflowCommit: source },
    { runId: 124 },
    { manifestSha256: 'f'.repeat(64) },
    { scope: 'all' },
    { channel: 'production' },
    { kind: 'vm' },
    { schemaVersion: 2 },
    { extra: true },
    { manifestSha256: undefined },
    { candidate: { ...candidate, extra: true } },
    ...[{ runId: 790 }, { artifactId: 988 }, { archiveSha256: 'f'.repeat(64) }, { workflowCommit: harness }].map(
      (value) => ({ candidate: { ...candidate, ...value } }),
    ),
  ]) {
    assert.throws(() => {
      verify({ ...binding, ...change });
    });
  }
  for (const changes of [
    { publicationCommit: divergent },
    { publicationCommit: source },
    { publicationCommit: '--all' },
  ]) {
    assert.throws(() => {
      verify(binding, changes);
    });
  }
  for (const head of [source, divergent]) {
    assert.throws(() =>
      createQualificationBinding({ manifest, candidate, kind: 'ci', runId: 123, workflowCommit: head }),
    );
  }
  assert.throws(() =>
    createQualificationBinding({
      manifest: { ...manifest, sourceCommit: harness },
      candidate,
      kind: 'ci',
      runId: 123,
      workflowCommit: harness,
    }),
  );

  let attempt = 0;
  const fetchReceipts = async (
    bindingInput: unknown = binding,
    receiptInput: unknown = receipts,
    archiveOptions: { extraFile?: boolean | 'duplicate'; badDigest?: boolean } = {},
  ) => {
    const { extraFile = false, badDigest = false } = archiveOptions;
    const directory = join(root, `attempt-${attempt++}`);
    mkdirSync(directory);
    writeFileSync(join(directory, 'route-receipts.json'), JSON.stringify(receiptInput));
    const files = ['route-receipts.json'];
    if (bindingInput !== null) {
      writeFileSync(
        join(directory, 'qualification-binding.json'),
        typeof bindingInput === 'string' ? bindingInput : JSON.stringify(bindingInput),
      );
      files.push('qualification-binding.json');
    }
    if (extraFile) {
      writeFileSync(join(directory, 'extra-receipts.json'), '{}');
      files.push('extra-receipts.json');
    }
    const archive = join(directory, 'receipts.zip');
    execFileSync('zip', ['-q', archive, ...files], { cwd: directory });
    if (extraFile === 'duplicate') {
      const bytes = readFileSync(archive);
      const name = Buffer.from('extra-receipts.json');
      let offset = bytes.indexOf(name);
      while (offset !== -1) {
        Buffer.from('route-receipts.json').copy(bytes, offset);
        offset = bytes.indexOf(name, offset + name.length);
      }
      writeFileSync(archive, bytes);
    }
    process.env['TEST_RECEIPT_ARCHIVE'] = archive;
    api['repos/taucad/tau/actions/runs/123/artifacts?per_page=100'].artifacts[0]!.digest =
      `sha256:${badDigest ? 'f'.repeat(64) : createHash('sha256').update(readFileSync(archive)).digest('hex')}`;
    saveApi();
    return fetchDesktopQualifiedReceipts(manifest, directory, { ci: '123', scope: 'macos' });
  };
  assert.deepEqual(await fetchReceipts(), receipts);
  // Clean-host (vm) rows bind the same way: notarized C is built from the newest green ancestor, so its source S is an
  // ancestor of the vm dispatch H rather than its tip, and only the authenticated vm-kind sidecar admits that.
  const vmRows = rows.map((row) => ({
    ...row,
    receipts: row.receipts.map((receipt) => ({
      ...receipt,
      suite: 'clean-host-route-a-b-c-v1',
      logs: 'https://github.com/taucad/tau/actions/runs/124',
      environment: {
        ...receipt.environment,
        kind: 'vm',
        host: {
          platform: 'darwin',
          runner: 'local-mac-1',
          productVersion: '26.5.2',
          nativeArch: receipt.environment.arch,
          translated: false,
          sip: 'enabled',
          gatekeeper: 'enabled',
          quarantine: {
            downloaded: '0083;6720a1b2;Chromium;4D3F1C2B-0000-4000-8000-000000000001',
            installed: '0083;6720a1b2;Chromium;4D3F1C2B-0000-4000-8000-000000000001',
          },
          assessment: 'Notarized Developer ID',
          staple: 'validated-offline',
          installedPath: '/Applications/Tau.app',
          launch: 'open',
        },
      },
    })),
  }));
  const { receipts: vmReceipts } = collectQualificationRows({
    scope: 'macos',
    kind: 'vm',
    candidate: manifest,
    sourceCommit: source,
    channel: 'staging',
    runId: '124',
    trustIdentities: { 'macos-zip': 'TEAM123456', 'macos-dmg': 'TEAM123456' },
    rows: vmRows,
  });
  const vmBinding = createQualificationBinding({
    manifest,
    candidate,
    kind: 'vm',
    runId: 124,
    workflowCommit: harness,
  });
  const verifyVm = (input: unknown, changes = {}) => {
    verifyQualificationBinding(input, {
      manifest,
      candidate,
      kind: 'vm',
      runId: 124,
      workflowCommit: harness,
      publicationCommit: publication,
      ...changes,
    });
  };
  verifyVm(vmBinding);
  // A CI sidecar never stands in for clean-host evidence, nor a clean-host sidecar for CI.
  assert.throws(() => {
    verifyVm({ ...binding, runId: 124 });
  }, /binding differs/u);
  assert.throws(() => {
    verify({ ...vmBinding, runId: 123 });
  }, /binding differs/u);
  for (const change of [{ runId: 123 }, { workflowCommit: source }, { sourceCommit: harness }, { kind: 'ci' }]) {
    assert.throws(() => {
      verifyVm({ ...vmBinding, ...change });
    });
  }
  for (const head of [source, divergent]) {
    assert.throws(() =>
      createQualificationBinding({ manifest, candidate, kind: 'vm', runId: 124, workflowCommit: head }),
    );
  }
  const fetchWithVm = async (bindingInput: unknown = vmBinding, receiptInput: unknown = vmReceipts) => {
    const directory = join(root, `vm-attempt-${attempt++}`);
    mkdirSync(directory);
    writeFileSync(join(directory, 'route-receipts.json'), JSON.stringify(receiptInput));
    const files = ['route-receipts.json'];
    if (bindingInput !== null) {
      writeFileSync(join(directory, 'qualification-binding.json'), JSON.stringify(bindingInput));
      files.push('qualification-binding.json');
    }
    const archive = join(directory, 'receipts.zip');
    execFileSync('zip', ['-q', archive, ...files], { cwd: directory });
    const routes = api as Record<string, unknown>;
    routes['repos/taucad/tau/actions/runs/124'] = {
      ...qualificationRun,
      id: 124,
      path: '.github/workflows/desktop-route-vm-acceptance.yml',
    };
    routes['repos/taucad/tau/actions/runs/124/artifacts?per_page=100'] = {
      artifacts: [
        {
          id: 654,
          name: 'desktop-macos-vm-receipts',
          expired: false,
          digest: `sha256:${createHash('sha256').update(readFileSync(archive)).digest('hex')}`,
          workflow_run: { id: 124, head_sha: harness },
        },
      ],
    };
    saveApi();
    process.env['TEST_RECEIPT_ARCHIVES'] = JSON.stringify({ 'repos/taucad/tau/actions/artifacts/654/zip': archive });
    const publishDirectory = join(root, `vm-publish-${attempt++}`);
    mkdirSync(publishDirectory);
    try {
      return await fetchDesktopQualifiedReceipts(manifest, publishDirectory, { ci: '123', vm: '124', scope: 'macos' });
    } finally {
      delete process.env['TEST_RECEIPT_ARCHIVES'];
    }
  };
  // The CI archive written by the last fetchReceipts() stays the default archive for artifact 456.
  await fetchReceipts();
  assert.deepEqual(await fetchWithVm(), [...receipts, ...vmReceipts]);
  await assert.rejects(fetchWithVm(null), /archive members/u);
  await assert.rejects(fetchWithVm({ ...binding, runId: 124 }), /binding differs/u);
  await assert.rejects(fetchWithVm({ ...vmBinding, candidate: { ...candidate, artifactId: 999 } }), /binding differs/u);
  await assert.rejects(fetchWithVm(vmBinding, receipts), /Receipt kind differs/u);
  delete (api as Record<string, unknown>)['repos/taucad/tau/actions/runs/124'];
  delete (api as Record<string, unknown>)['repos/taucad/tau/actions/runs/124/artifacts?per_page=100'];
  saveApi();
  // An Intel Mac receipt smuggled into the authenticated archive never joins the Apple silicon receipt set.
  await assert.rejects(
    fetchReceipts(binding, [
      ...receipts,
      {
        ...receipts[0]!,
        target: 'darwin-x64',
        environment: { ...receipts[0]!.environment, arch: 'x64' },
      },
    ]),
    /disagree with candidate route/u,
  );
  await assert.rejects(fetchReceipts(null), /archive members/u);
  await assert.rejects(fetchReceipts(binding, receipts, { extraFile: true }), /archive members/u);
  await assert.rejects(fetchReceipts(binding, receipts, { extraFile: 'duplicate' }), /archive members/u);
  await assert.rejects(fetchReceipts('{malformed'), SyntaxError);
  await assert.rejects(fetchReceipts(binding, receipts, { badDigest: true }), /archive digest/u);
  await assert.rejects(fetchReceipts({ ...binding, candidate: { ...candidate, artifactId: 999 } }), /binding differs/u);
  await assert.rejects(
    fetchReceipts(
      binding,
      receipts.map((receipt) => ({ ...receipt, logs: 'https://github.com/taucad/tau/actions/runs/999' })),
    ),
    /Receipt kind differs/u,
  );
  for (const change of [
    { id: 999 },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { head_branch: 'topic' },
    { event: 'push' },
    { repository: { full_name: 'fork/tau' } },
    { head_repository: { full_name: 'fork/tau' } },
    { path: '.github/workflows/other.yml' },
  ]) {
    api['repos/taucad/tau/actions/runs/789'] = { ...candidateRun, ...change };
    // oxlint-disable-next-line no-await-in-loop -- Re-admit each independent API substitution through the publisher.
    await assert.rejects(fetchReceipts());
  }
  api['repos/taucad/tau/actions/runs/789'] = candidateRun;
  for (const change of [
    { expired: true },
    { name: 'desktop-installer-candidate' },
    { digest: 'invalid' },
    { digest: `sha256:${'f'.repeat(64)}` },
    { workflow_run: { id: 999, head_sha: candidateHead } },
    { workflow_run: { id: 789, head_sha: harness } },
  ]) {
    api['repos/taucad/tau/actions/runs/789/artifacts?per_page=100'].artifacts = [{ ...candidateArtifact, ...change }];
    // oxlint-disable-next-line no-await-in-loop -- Exercise independently admitted metadata substitutions.
    await assert.rejects(fetchReceipts());
  }
  api['repos/taucad/tau/actions/runs/789/artifacts?per_page=100'].artifacts = [candidateArtifact];
  // Same-source runs still require the new authenticated binding; there is no legacy fallback.
  api['repos/taucad/tau/actions/runs/123'] = { ...qualificationRun, head_sha: source };
  api['repos/taucad/tau/actions/runs/123/artifacts?per_page=100'].artifacts[0]!.workflow_run.head_sha = source;
  await assert.rejects(fetchReceipts(null), /archive members/u);
  api['repos/taucad/tau/actions/runs/789'] = { ...candidateRun, head_sha: source };
  api['repos/taucad/tau/actions/runs/789/artifacts?per_page=100'].artifacts = [
    { ...candidateArtifact, workflow_run: { id: 789, head_sha: source } },
  ];
  process.env['GITHUB_SHA'] = source;
  saveApi();
  const equalCandidate = admitInstallerCandidate({ runId: '789', workflowCommit: source, scope: 'macos' });
  const equalBinding = createQualificationBinding({
    manifest,
    candidate: equalCandidate,
    kind: 'ci',
    runId: 123,
    workflowCommit: source,
  });
  assert.deepEqual(await fetchReceipts(equalBinding), receipts);
  console.log(
    'PASS collector-to-publisher S<K<H<P CI and clean-host bindings, authenticated ZIP/API substitutions and equal-source fail-closed',
  );
} finally {
  process.chdir(previousDirectory);
  for (const key of Object.keys(process.env)) {
    if (!(key in previousEnvironment)) {
      // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- Restore only environment keys introduced by this fixture.
      delete process.env[key];
    }
  }
  Object.assign(process.env, previousEnvironment);
  rmSync(root, { recursive: true, force: true });
}
