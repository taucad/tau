#!/usr/bin/env node
/** Purpose: Exercise matrix admission with synthetic in-memory receipts; never write qualification artifacts. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  desktopAcceptanceRoutes,
  desktopArtifactKinds,
  desktopArtifactName,
  parseDesktopArtifactManifest,
} from '#shared/desktop-release.js';
import type { DesktopAcceptanceReceipt, DesktopArtifactKind, DesktopReleaseTarget } from '#shared/desktop-release.js';
/* oxlint-disable-next-line no-restricted-imports -- Exercise the actual aggregation admission boundary. */
import { collectQualificationRows } from './collect-qualification-rows.mjs';
// oxlint-disable-next-line no-restricted-imports -- Exercise actual git ancestry admission without fabricated receipts.
import { assertQualificationSource } from './qualification-candidates.mjs';

const specifications = [
  ['macos-zip-arm64', 'macos-zip', 'darwin-arm64', 'Darwin 25.0.0'],
  ['macos-dmg-arm64', 'macos-dmg', 'darwin-arm64', 'Darwin 25.0.0'],
  ['macos-zip-x64', 'macos-zip', 'darwin-x64', 'Darwin 24.6.0'],
  ['macos-dmg-x64', 'macos-dmg', 'darwin-x64', 'Darwin 24.6.0'],
  ['windows-nsis-x64', 'windows-nsis', 'win32-x64', 'Microsoft Windows Server 2025 Datacenter 10.0.26100 26100'],
  ['ubuntu-apt-x11', 'linux-apt', 'linux-x64', '6.8.0 NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"'],
  ['ubuntu-appimage-x11', 'linux-appimage', 'linux-x64', '6.8.0 NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"'],
  ['ubuntu2604-apt-x11', 'linux-apt', 'linux-x64', '6.17.0 NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="26.04"'],
  ['ubuntu2604-appimage-x11', 'linux-appimage', 'linux-x64', '6.17.0 NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="26.04"'],
  ['debian-apt-x11', 'linux-apt', 'linux-x64', '6.12.0 NAME="Debian GNU/Linux"\nID=debian\nVERSION_ID="13"'],
  ['debian-appimage-x11', 'linux-appimage', 'linux-x64', '6.12.0 NAME="Debian GNU/Linux"\nID=debian\nVERSION_ID="13"'],
] as const;
const fixture = (macOnly = false) => {
  const channel = 'staging';
  const version = '1.0.3';
  const targets: Array<[DesktopReleaseTarget, DesktopArtifactKind]> = (
    [
      ['darwin-arm64', 'macos-zip'],
      ['darwin-arm64', 'macos-dmg'],
      ['darwin-x64', 'macos-zip'],
      ['darwin-x64', 'macos-dmg'],
      ['win32-x64', 'windows-nsis'],
      ['linux-x64', 'linux-deb-runtime'],
      ['linux-x64', 'linux-deb-selector'],
      ['linux-x64', 'linux-appimage'],
      ['linux-x64', 'linux-appimage-deb-runtime'],
      ['linux-x64', 'linux-appimage-deb-selector'],
    ] as Array<[DesktopReleaseTarget, DesktopArtifactKind]>
  ).filter(([target]) => !macOnly || target.startsWith('darwin-'));
  const candidate = parseDesktopArtifactManifest({
    schemaVersion: 1,
    tag: 'desktop-staging@0.1.0-staging.3',
    channel,
    version,
    sourceCommit: 'a'.repeat(40),
    artifacts: targets.map(([target, kind], index) => ({
      target,
      kind,
      name: desktopArtifactName({ kind, channel, version, arch: target.endsWith('arm64') ? 'arm64' : 'x64' }),
      format: desktopArtifactKinds[kind].format,
      roles: desktopArtifactKinds[kind].roles,
      size: 100,
      sha256: (index + 1).toString(16).padStart(64, '0'),
      sha512: Buffer.alloc(64, index + 1).toString('base64'),
    })),
  });
  const trustIdentities = {
    'macos-zip': 'TEAM123456',
    'macos-dmg': 'TEAM123456',
    'windows-nsis': 'Synthetic publisher',
    'linux-apt': `${'A'.repeat(40)}/${'B'.repeat(40)}`,
    'linux-appimage': 'synthetic-key',
  };
  return {
    candidate,
    channel,
    sourceCommit: candidate.sourceCommit,
    runId: '1234',
    trustIdentities,
    rows: specifications
      .filter(([, route]) => !macOnly || route.startsWith('macos-'))
      .map(([id, route, target, os]) => ({
        id,
        receipts: [
          {
            schemaVersion: 1,
            status: 'passed',
            tag: candidate.tag,
            channel,
            version,
            sourceCommit: candidate.sourceCommit,
            route,
            target,
            artifacts: candidate.artifacts
              .filter(
                (artifact) =>
                  artifact.target === target &&
                  (desktopAcceptanceRoutes[route] as readonly string[]).includes(artifact.kind),
              )
              .map(({ name, sha256 }) => ({ name, sha256 })),
            baseline: { version: '1.0.1', artifactSha256: 'b'.repeat(64) },
            installed: { version, executableSha256: 'c'.repeat(64) },
            environment: { os, arch: target.endsWith('arm64') ? 'arm64' : 'x64', kind: 'ci', sandbox: 'enabled' },
            trust: { kind: 'release', identity: trustIdentities[route] },
            checks: { cleanInstall: true, upgrade: true, dataPreserved: true },
            suite: 'installed-route-a-b-c-v1',
            logs: 'https://github.com/taucad/tau/actions/runs/1234',
          } satisfies DesktopAcceptanceReceipt,
        ],
      })),
  };
};
const complete = fixture();
const admitted = collectQualificationRows(complete);
assert.equal(admitted.hostMatrix.length, 11);
assert.equal(admitted.receipts.length, 7);
assert.deepEqual(
  admitted.hostMatrix.map(({ id }) => id),
  specifications.map(([id]) => id),
);
assert.equal(new Set(admitted.receipts.map(({ route, target }) => `${route}/${target}`)).size, 7);
assert.deepEqual(collectQualificationRows({ ...complete, rows: [...complete.rows].reverse() }), admitted);
assert.equal(admitted.hostMatrix.filter(({ receipt }) => receipt.route === 'linux-apt').length, 3);
// Linux progress is independently complete only with both routes on all three distros.
const linux = {
  ...fixture(),
  scope: 'linux',
  trustIdentities: {
    'linux-apt': complete.trustIdentities['linux-apt'],
    'linux-appimage': complete.trustIdentities['linux-appimage'],
  },
  rows: complete.rows.filter((row) => row.id.startsWith('ubuntu') || row.id.startsWith('debian')),
};
const linuxResult = collectQualificationRows(linux);
assert.equal(linuxResult.hostMatrix.length, 6);
assert.equal(linuxResult.receipts.length, 2);
assert.deepEqual(
  linuxResult.receipts.map((receipt) => receipt.route),
  ['linux-apt', 'linux-appimage'],
);
assert.throws(() => collectQualificationRows({ ...linux, scope: 'all' }));
assert.throws(() => collectQualificationRows({ ...linux, scope: 'unknown' }));
for (const row of linux.rows) {
  assert.throws(() => collectQualificationRows({ ...linux, rows: linux.rows.filter((other) => other.id !== row.id) }));
}
assert.throws(() => collectQualificationRows({ ...linux, rows: [...linux.rows, linux.rows[0]] }));
assert.throws(() => collectQualificationRows({ ...linux, rows: complete.rows }));
assert.throws(() => collectQualificationRows({ ...linux, channel: 'production' }));
assert.throws(() =>
  collectQualificationRows({ ...linux, trustIdentities: { ...linux.trustIdentities, 'linux-appimage': 'wrong-key' } }),
);
assert.throws(() => collectQualificationRows({ ...complete, trustIdentities: linux.trustIdentities }));
const reject = (change: (value: ReturnType<typeof fixture>) => unknown): void => {
  assert.throws(() => collectQualificationRows(change(fixture())));
};
reject((value) => ({ ...value, rows: value.rows.slice(1) }));
reject((value) => ({ ...value, rows: [...value.rows, value.rows[0]] }));
reject((value) => ({ ...value, rows: value.rows.map((row, index) => (index === 8 ? value.rows[0] : row)) }));
reject((value) => ({ ...value, rows: [...value.rows, { id: 'extra', receipts: [] }] }));
reject((value) => ({ ...value, sourceCommit: 'd'.repeat(40) }));
reject((value) => ({ ...value, channel: 'production' }));
reject((value) => ({ ...value, runId: '5678' }));
reject((value) => ({ ...value, runId: '../1234' }));
reject((value) => ({ ...value, candidate: { ...value.candidate, schemaVersion: 2 } }));
reject((value) => ({ ...value, trustIdentities: { ...value.trustIdentities, 'windows-nsis': 'Other publisher' } }));
for (const [index] of specifications.entries()) {
  const alterReceipt = (change: (receipt: DesktopAcceptanceReceipt) => unknown): void => {
    reject((value) => ({
      ...value,
      rows: value.rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, receipts: [change(row.receipts[0]!)] } : row,
      ),
    }));
  };
  alterReceipt((receipt) => ({ ...receipt, schemaVersion: 2 }));
  alterReceipt((receipt) => ({ ...receipt, route: receipt.route === 'macos-zip' ? 'windows-nsis' : 'macos-zip' }));
  alterReceipt((receipt) => ({ ...receipt, target: receipt.target === 'win32-x64' ? 'linux-x64' : 'win32-x64' }));
  alterReceipt((receipt) => ({ ...receipt, status: 'failed' }));
  alterReceipt((receipt) => ({ ...receipt, environment: { ...receipt.environment, sandbox: 'disabled' } }));
  alterReceipt((receipt) => ({ ...receipt, installed: { ...receipt.installed, version: '1.0.4' } }));
  reject((value) => ({
    ...value,
    rows: value.rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, receipts: [row.receipts[0], row.receipts[0]] } : row,
    ),
  }));

  alterReceipt((receipt) => ({ ...receipt, extra: true }));
  alterReceipt((receipt) => ({ ...receipt, sourceCommit: 'd'.repeat(40) }));
  alterReceipt((receipt) => ({ ...receipt, channel: 'production' }));
  alterReceipt((receipt) => ({ ...receipt, version: '1.0.4' }));
  alterReceipt((receipt) => ({
    ...receipt,
    artifacts: receipt.artifacts.map((artifact) => ({ ...artifact, sha256: 'f'.repeat(64) })),
  }));
  alterReceipt((receipt) => ({ ...receipt, trust: { ...receipt.trust, kind: 'test' } }));
  alterReceipt((receipt) => ({ ...receipt, trust: { ...receipt.trust, identity: 'wrong signer' } }));
  alterReceipt((receipt) => ({ ...receipt, environment: { ...receipt.environment, os: 'unrelated OS' } }));
  alterReceipt((receipt) => ({ ...receipt, environment: { ...receipt.environment, kind: 'vm' } }));
  alterReceipt((receipt) => ({ ...receipt, logs: `${receipt.logs}/jobs/123` }));
  alterReceipt((receipt) => ({ ...receipt, suite: 'fixture' }));
  reject((value) => ({
    ...value,
    rows: value.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, receipts: [] } : row)),
  }));
}
reject((value) => ({
  ...value,
  rows: value.rows.map((row) =>
    row.id === 'ubuntu-apt-x11'
      ? {
          ...row,
          receipts: [
            { ...row.receipts[0], environment: { ...row.receipts[0]!.environment, os: 'NAME=ID=ubuntu\nID=debian' } },
          ],
        }
      : row,
  ),
}));
reject((value) => ({
  ...value,
  rows: value.rows.map((row) =>
    row.id === 'ubuntu-apt-x11'
      ? {
          ...row,
          receipts: [
            { ...row.receipts[0], environment: { ...row.receipts[0]!.environment, os: 'ID=ubuntu\nID=debian' } },
          ],
        }
      : row,
  ),
}));
// A 26.04 row must observe 26.04; an Ubuntu 24.04 guest cannot stand in for it.
reject((value) => ({
  ...value,
  rows: value.rows.map((row) =>
    row.id === 'ubuntu2604-apt-x11'
      ? {
          ...row,
          receipts: [
            {
              ...row.receipts[0],
              environment: {
                ...row.receipts[0]!.environment,
                os: '6.8.0 NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"',
              },
            },
          ],
        }
      : row,
  ),
}));
// A Mac-only run admits exactly ZIP and DMG on both native architectures from the Mac-only candidate, with only the
// Apple identity; it can neither include nor omit another platform's row.
const mac = {
  ...fixture(true),
  scope: 'macos',
  trustIdentities: {
    'macos-zip': complete.trustIdentities['macos-zip'],
    'macos-dmg': complete.trustIdentities['macos-dmg'],
  },
};
const macResult = collectQualificationRows(mac);
assert.deepEqual(
  macResult.hostMatrix.map(({ id }) => id),
  ['macos-zip-arm64', 'macos-dmg-arm64', 'macos-zip-x64', 'macos-dmg-x64'],
);
assert.deepEqual(
  macResult.receipts.map(({ route, target }) => `${target}/${route}`),
  ['darwin-arm64/macos-zip', 'darwin-arm64/macos-dmg', 'darwin-x64/macos-zip', 'darwin-x64/macos-dmg'],
);
assert.ok(macResult.receipts.every((receipt) => receipt.environment.kind === 'ci'));
const rejectMac = (change: (value: typeof mac) => unknown): void => {
  assert.throws(() => collectQualificationRows(change({ ...mac, rows: [...mac.rows] })));
};
for (const row of mac.rows) {
  rejectMac((value) => ({ ...value, rows: value.rows.filter((other) => other.id !== row.id) }));
  rejectMac((value) => ({ ...value, rows: [...value.rows, row] }));
}
// Single-architecture evidence, other-platform rows and a full or production candidate are refused.
rejectMac((value) => ({ ...value, rows: value.rows.filter((row) => row.id.endsWith('-arm64')) }));
rejectMac((value) => ({ ...value, rows: complete.rows }));
rejectMac((value) => ({ ...value, rows: [...value.rows, complete.rows[4]] }));
rejectMac((value) => ({ ...value, candidate: complete.candidate, rows: complete.rows.slice(0, 4) }));
rejectMac((value) => ({ ...value, channel: 'production' }));
rejectMac((value) => ({ ...value, scope: 'all' }));
rejectMac((value) => ({ ...value, scope: 'linux' }));
rejectMac((value) => ({ ...value, trustIdentities: { 'macos-zip': 'TEAM123456' } }));
rejectMac((value) => ({ ...value, trustIdentities: { ...value.trustIdentities, 'macos-dmg': 'OTHERTEAM1' } }));
for (const index of mac.rows.keys()) {
  const alterMac = (change: (receipt: DesktopAcceptanceReceipt) => unknown): void => {
    rejectMac((value) => ({
      ...value,
      rows: value.rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, receipts: [change(row.receipts[0]!)] } : row,
      ),
    }));
  };
  alterMac((receipt) => ({ ...receipt, channel: 'production' }));
  alterMac((receipt) => ({ ...receipt, sourceCommit: 'd'.repeat(40) }));
  alterMac((receipt) => ({ ...receipt, version: '1.0.4' }));
  alterMac((receipt) => ({ ...receipt, trust: { ...receipt.trust, identity: 'OTHERTEAM1' } }));
  alterMac((receipt) => ({
    ...receipt,
    artifacts: receipt.artifacts.map((artifact) => ({ ...artifact, sha256: 'f'.repeat(64) })),
  }));
  alterMac((receipt) => ({ ...receipt, environment: { ...receipt.environment, kind: 'vm' } }));
  alterMac((receipt) => ({ ...receipt, route: receipt.route === 'macos-zip' ? 'macos-dmg' : 'macos-zip' }));
  alterMac((receipt) => ({ ...receipt, target: receipt.target === 'darwin-arm64' ? 'darwin-x64' : 'darwin-arm64' }));
  alterMac((receipt) => ({ ...receipt, logs: 'https://github.com/fork/tau/actions/runs/1234' }));
}
// Clean-host (vm) rows: only the Mac-scoped staging producer, each with observed host facts and the clean-host suite.
const cleanHost = (arch: 'arm64' | 'x64') => ({
  platform: 'darwin',
  runner: 'local-mac-1',
  productVersion: '26.0.1',
  nativeArch: arch,
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
});
const vm = {
  ...mac,
  kind: 'vm',
  rows: mac.rows.map((row) => ({
    ...row,
    receipts: row.receipts.map((receipt) => ({
      ...receipt,
      suite: 'clean-host-route-a-b-c-v1',
      environment: { ...receipt.environment, kind: 'vm', host: cleanHost(receipt.environment.arch) },
    })),
  })),
};
const vmResult = collectQualificationRows(vm);
assert.ok(vmResult.receipts.every((receipt) => receipt.environment.kind === 'vm' && receipt.environment.host));
const rejectVm = (change: (value: typeof vm) => unknown): void => {
  assert.throws(() => collectQualificationRows(change({ ...vm, rows: [...vm.rows] })));
};
rejectVm((value) => ({ ...value, scope: 'all' }));
rejectVm((value) => ({ ...value, channel: 'production' }));
// A CI receipt can never be collected as clean-host evidence, nor a clean-host receipt as CI.
rejectVm((value) => ({ ...value, rows: mac.rows }));
rejectVm((value) => ({ ...value, kind: 'ci' }));
rejectVm((value) => ({ ...value, rows: value.rows.filter((row) => row.id.endsWith('-arm64')) }));
for (const index of vm.rows.keys()) {
  const alterVm = (change: (receipt: DesktopAcceptanceReceipt) => unknown): void => {
    rejectVm((value) => ({
      ...value,
      rows: value.rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, receipts: [change(row.receipts[0] as DesktopAcceptanceReceipt)] } : row,
      ),
    }));
  };
  alterVm((receipt) => ({ ...receipt, suite: 'installed-route-a-b-c-v1' }));
  alterVm((receipt) => {
    const { host: _host, ...environment } = receipt.environment;
    return { ...receipt, environment };
  });
  alterVm((receipt) => ({
    ...receipt,
    environment: { ...receipt.environment, host: { ...receipt.environment.host, sip: 'disabled' } },
  }));
  alterVm((receipt) => ({
    ...receipt,
    environment: { ...receipt.environment, host: { ...receipt.environment.host, gatekeeper: 'disabled' } },
  }));
}
const cli = spawnSync(
  process.execPath,
  ['--import', '@oxc-node/core/register', fileURLToPath(new URL('collect-qualification-rows.mts', import.meta.url))],
  {
    env: {
      ...process.env,
      ...Object.fromEntries([
        ['GITHUB_REF', 'refs/heads/fixture'],
        ['GITHUB_EVENT_NAME', 'workflow_dispatch'],
      ]),
    },
    encoding: 'utf8',
    timeout: 60_000,
  },
);
assert.equal(cli.status, 1);
assert.match(cli.stderr, /trusted main dispatch/u);
console.log(
  'PASS synthetic eleven-host and Mac-only four-host admission, canonical receipts, strict source/route/signer/OS/run binding and main guard; no evidence files written',
);

const repository = mkdtempSync(join(tmpdir(), 'tau-qualification-source-'));
const previousDirectory = process.cwd();
try {
  process.chdir(repository);
  const git = (...args: string[]): string =>
    execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  git('config', 'user.name', 'Qualification fixture');
  git('config', 'user.email', 'qualification@example.invalid');
  git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'baseline');
  const baseline = git('rev-parse', 'HEAD');
  git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'protected main advanced');
  const workflowCommit = git('rev-parse', 'HEAD');
  const admitted = { sourceCommit: baseline, workflowCommit, scope: 'linux', channel: 'staging', kind: 'ci' } as const;
  assertQualificationSource(admitted);
  assertQualificationSource({ ...admitted, sourceCommit: workflowCommit });
  assertQualificationSource({ ...admitted, sourceCommit: workflowCommit, scope: 'all', channel: 'production' });
  assert.throws(() => {
    assertQualificationSource({ ...admitted, scope: 'all' });
  }, /exact source/u);
  assert.throws(() => {
    assertQualificationSource({ ...admitted, channel: 'production' });
  }, /scope\/channel/u);
  assert.throws(() => {
    assertQualificationSource({ ...admitted, scope: 'unknown' });
  }, /scope\/channel/u);
  // Mac CI may test an ancestor; its publisher requires an authenticated binding. VM remains exact-source.
  assertQualificationSource({ ...admitted, sourceCommit: workflowCommit, scope: 'macos' });
  assertQualificationSource({ ...admitted, scope: 'macos' });
  assert.throws(() => {
    assertQualificationSource({ ...admitted, scope: 'macos', kind: 'vm' });
  }, /exact source/u);
  assert.throws(() => {
    assertQualificationSource({ ...admitted, sourceCommit: workflowCommit, scope: 'macos', channel: 'production' });
  }, /scope\/channel/u);
  assert.throws(() => {
    assertQualificationSource({ ...admitted, sourceCommit: '--all' });
  }, /scope\/channel/u);
  assert.throws(() => {
    assertQualificationSource({ ...admitted, workflowCommit: baseline, sourceCommit: workflowCommit });
  });
  git('checkout', '--detach', baseline);
  git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'unmerged sibling');
  assert.throws(() => {
    assertQualificationSource({ ...admitted, sourceCommit: git('rev-parse', 'HEAD') });
  });
} finally {
  process.chdir(previousDirectory);
  rmSync(repository, { recursive: true, force: true });
}
console.log('PASS real Git ancestry, Linux staging pinning and unchanged all-platform/production exact-source guards');

const consumerScope = fixture();
consumerScope.rows = consumerScope.rows.filter((row) => row.id === 'windows-nsis-x64');
assert.throws(() => collectQualificationRows({ ...consumerScope, scope: 'windows' }), /consumer VM/u);
assert.throws(() => collectQualificationRows({ ...consumerScope, scope: 'windows', kind: 'vm' }));
assert.throws(() => collectQualificationRows({ ...consumerScope, scope: 'all', kind: 'vm' }));
assert.throws(() => collectQualificationRows({ ...consumerScope, scope: 'windows', kind: 'vm', rows: [] }));

const windowsRow = consumerScope.rows[0]!;
const windowsReceipt: DesktopAcceptanceReceipt = {
  ...windowsRow.receipts[0]!,
  suite: 'clean-host-route-a-b-c-v1',
  environment: {
    os: 'Microsoft Windows 11 Pro',
    arch: 'x64',
    kind: 'vm',
    sandbox: 'enabled',
    host: {
      platform: 'win32',
      runner: 'synthetic',
      nativeArch: 'x64',
      osBuild: 26_100,
      account: 'standard-user',
      uac: 'enabled',
      defender: 'enabled',
      download: 'browser-internet-zone',
      reputationScope: 'qualification-mirror',
      manualEvidence: ['initial', 'reinstall'].map((stage, index) => ({
        stage: index === 0 ? 'initial' : 'reinstall',
        nonce: '123e4567-e89b-42d3-a456-426614174000',
        hostSha256: 'd'.repeat(64),
        artifactSha256: index === 0 ? 'b'.repeat(64) : windowsRow.receipts[0]!.artifacts[0]!.sha256,
        observedAt: 200,
        smartScreen: 'not-shown',
        screenshots: [
          {
            kind: 'security-settings',
            name: `${stage}-security.png`,
            capturedAt: 150,
            sha256: 'e'.repeat(64),
            size: 10,
          },
          { kind: 'installer-result', name: `${stage}-result.png`, capturedAt: 150, sha256: 'f'.repeat(64), size: 10 },
        ],
      })),
    },
  },
};
const windowsInput = {
  ...consumerScope,
  scope: 'windows',
  kind: 'vm',
  rows: [{ id: windowsRow.id, receipts: [windowsReceipt] }],
};
assert.deepEqual(
  collectQualificationRows(windowsInput).hostMatrix.map(({ id }) => id),
  ['windows-nsis-x64'],
);
assert.throws(
  () => collectQualificationRows({ ...windowsInput, rows: [...windowsInput.rows, ...windowsInput.rows] }),
  /duplicated/u,
);
assert.throws(() => collectQualificationRows({ ...windowsInput, scope: 'all' }), /Clean-host/u);
