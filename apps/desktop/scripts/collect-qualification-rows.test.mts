#!/usr/bin/env node
/** Purpose: Exercise matrix admission with synthetic in-memory receipts; never write qualification artifacts. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

const specifications = [
  ['macos-zip-arm64', 'macos-zip', 'darwin-arm64', 'Darwin 25.0.0'],
  ['macos-dmg-arm64', 'macos-dmg', 'darwin-arm64', 'Darwin 25.0.0'],
  ['macos-zip-x64', 'macos-zip', 'darwin-x64', 'Darwin 24.6.0'],
  ['macos-dmg-x64', 'macos-dmg', 'darwin-x64', 'Darwin 24.6.0'],
  ['windows-nsis-x64', 'windows-nsis', 'win32-x64', 'Microsoft Windows Server 2025 Datacenter 10.0.26100 26100'],
  ['ubuntu-apt-x11', 'linux-apt', 'linux-x64', '6.8.0 NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"'],
  ['ubuntu-appimage-x11', 'linux-appimage', 'linux-x64', '6.8.0 NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"'],
  ['debian-apt-x11', 'linux-apt', 'linux-x64', '6.12.0 NAME="Debian GNU/Linux"\nID=debian\nVERSION_ID="13"'],
  ['debian-appimage-x11', 'linux-appimage', 'linux-x64', '6.12.0 NAME="Debian GNU/Linux"\nID=debian\nVERSION_ID="13"'],
] as const;
const fixture = () => {
  const channel = 'staging';
  const version = '1.0.3';
  const targets: Array<[DesktopReleaseTarget, DesktopArtifactKind]> = [
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
  ];
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
    rows: specifications.map(([id, route, target, os]) => ({
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
assert.equal(admitted.hostMatrix.length, 9);
assert.equal(admitted.receipts.length, 7);
assert.deepEqual(
  admitted.hostMatrix.map(({ id }) => id),
  specifications.map(([id]) => id),
);
assert.equal(new Set(admitted.receipts.map(({ route, target }) => `${route}/${target}`)).size, 7);
assert.deepEqual(collectQualificationRows({ ...complete, rows: [...complete.rows].reverse() }), admitted);
assert.equal(admitted.hostMatrix.filter(({ receipt }) => receipt.route === 'linux-apt').length, 2);
// Linux progress is independently complete only with both routes on both distros.
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
assert.equal(linuxResult.hostMatrix.length, 4);
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
  'PASS synthetic nine-host admission, seven canonical receipts, strict source/route/signer/OS/run binding and main guard; no evidence files written',
);
