import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import {
  cacheViolations,
  collectFingerprint,
  fingerprintCommand,
  judgeReceipt,
  recordCommand,
  renderFingerprint,
  verdictRecord,
} from '#shell-evidence.js';
import type { Fingerprint, Probe, TargetConfiguration, VerdictRecord } from '#shell-evidence.js';

/* eslint-disable @typescript-eslint/naming-convention -- environment variables and GitHub fields keep their wire names. */

const root = resolve(import.meta.dirname, '../..');

const macEnvironment = {
  TAU_SHELL_EVIDENCE: 'reuse',
  GITHUB_ACTIONS: 'true',
  TAU_SHELL_CONFORMANCE_ROW: 'MAC-A',
  TAU_SHELL_TIER: 'semantics',
  ImageOS: 'macos26',
  ImageVersion: '20261102.0101.1',
};

/** A macOS arm64 runner whose every probe answers, with overrides for the one under test. */
const macProbe = (overrides: Partial<Probe> & { env?: Record<string, string | undefined> } = {}): Probe => ({
  platform: 'darwin',
  arch: 'arm64',
  kernel: () => '25.1.0 Darwin Kernel Version 25.1.0',
  node: () => 'v24.20.0 abi 137',
  run: (file, args) => `${file} ${args.join(' ')} 1.0`,
  readFile: (path) => (path.endsWith('package.json') ? '{"version":"0.0.75"}' : ''),
  digest: (path) => `digest-of-${path}`,
  digestTree: () => 'tree',
  packageRoot: (name) => `/node_modules/${name}`,
  ...overrides,
  env: { ...macEnvironment, ...overrides.env },
});

const linuxProbe = (env: Record<string, string | undefined> = {}): Probe => ({
  ...macProbe(),
  platform: 'linux',
  arch: 'x64',
  readFile: (path) =>
    path === '/etc/os-release'
      ? 'ID=ubuntu\nVERSION_ID="24.04"\n'
      : path.endsWith('package.json')
        ? '{"version":"0.0.75"}'
        : '1\n',
  env: {
    ...macEnvironment,
    TAU_SHELL_CONFORMANCE_ROW: 'LNX-U',
    ImageOS: 'ubuntu24',
    TAU_SHELL_GUEST_IMAGE: `sha256:${'a'.repeat(64)}`,
    TAU_SHELL_CONFORMANCE_BWRAP: '/opt/tau-staging/sandbox/bwrap',
    ...env,
  },
});

const digestOf = (fingerprint: Fingerprint): string =>
  fingerprint.ok ? fingerprint.digest : `refused: ${fingerprint.reason}`;

describe('shell environment fingerprint', () => {
  it('is stable for one environment and changes with each identity it covers', () => {
    const base = digestOf(collectFingerprint(macProbe()));
    expect(base).toMatch(/^[0-9a-f]{64}$/u);
    expect(digestOf(collectFingerprint(macProbe()))).toBe(base);
    for (const env of [{ TAU_SHELL_TIER: 'full' }, { ImageVersion: '20261109.0101.1' }, { ImageOS: 'macos15' }]) {
      expect(digestOf(collectFingerprint(macProbe({ env })))).not.toBe(base);
    }
    expect(digestOf(collectFingerprint(macProbe({ kernel: () => '25.2.0' })))).not.toBe(base);
    expect(digestOf(collectFingerprint(macProbe({ run: (file, args) => `${file} ${args.join(' ')} 5.3` })))).not.toBe(
      base,
    );
    expect(digestOf(collectFingerprint(macProbe({ digestTree: () => 'other tree' })))).not.toBe(base);
    expect(digestOf(collectFingerprint(macProbe({ digest: (path) => `other-${path}` })))).not.toBe(base);
  });

  it('hashes each row differently', () => {
    const arm = digestOf(collectFingerprint(macProbe()));
    const intel = digestOf(collectFingerprint(macProbe({ arch: 'x64', env: { TAU_SHELL_CONFORMANCE_ROW: 'MAC-X' } })));
    expect(intel).toMatch(/^[0-9a-f]{64}$/u);
    expect(intel).not.toBe(arm);
  });

  it('covers bubblewrap, socat, the guest image and the userns policy on a Linux row', () => {
    const base = digestOf(collectFingerprint(linuxProbe()));
    expect(base).toMatch(/^[0-9a-f]{64}$/u);
    expect(digestOf(collectFingerprint(linuxProbe({ TAU_SHELL_GUEST_IMAGE: `sha256:${'b'.repeat(64)}` })))).not.toBe(
      base,
    );
    expect(digestOf(collectFingerprint(linuxProbe({ TAU_SHELL_CONFORMANCE_BWRAP: '/usr/bin/bwrap' })))).not.toBe(base);
  });

  it.each([
    ['fresh evidence was asked for', macProbe({ env: { TAU_SHELL_EVIDENCE: 'fresh' } })],
    ['no evidence mode is set', macProbe({ env: { TAU_SHELL_EVIDENCE: undefined } })],
    ['the run is not on GitHub Actions', macProbe({ env: { GITHUB_ACTIONS: undefined } })],
    ['the row is unknown', macProbe({ env: { TAU_SHELL_CONFORMANCE_ROW: 'WIN-ARM' } })],
    ['the tier is unknown', macProbe({ env: { TAU_SHELL_TIER: undefined } })],
    ['the row runs on another platform', macProbe({ env: { TAU_SHELL_CONFORMANCE_ROW: 'MAC-X' } })],
    ['the runner image is unknown', macProbe({ env: { ImageVersion: '' } })],
    [
      'a probe fails',
      macProbe({
        run: () => {
          throw new Error('bash: command timed out');
        },
      }),
    ],
    [
      'the sandbox runtime cannot be resolved',
      macProbe({
        packageRoot: () => {
          throw new Error('Cannot find module');
        },
      }),
    ],
    [
      'node-pty has no binary',
      macProbe({
        digest: (path) => {
          if (path.endsWith('pty.node')) {
            throw new Error('ENOENT');
          }
          return 'x';
        },
      }),
    ],
    ['a Linux guest names no image', linuxProbe({ TAU_SHELL_GUEST_IMAGE: undefined })],
    ['a Linux row names no bubblewrap', linuxProbe({ TAU_SHELL_CONFORMANCE_BWRAP: '' })],
    ['a Linux guest is the wrong release', linuxProbe({ TAU_SHELL_CONFORMANCE_ROW: 'LNX-D' })],
  ])('fails closed with a nonce when %s', (_, probe) => {
    const fingerprint = collectFingerprint(probe);
    expect(fingerprint.ok).toBe(false);
    const first = renderFingerprint(fingerprint);
    const second = renderFingerprint(fingerprint);
    expect(first).toMatch(/^tau\.shell-environment-fingerprint\/1 unfingerprinted nonce:[0-9a-f-]{36} /u);
    expect(first).not.toBe(second);
  });
});

const sha = 'a'.repeat(40);
const earlier = 'b'.repeat(40);
const runEnvironment = {
  ...macEnvironment,
  GITHUB_SHA: sha,
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: 'taucad/tau',
  GITHUB_RUN_ID: '200',
};
const thisRun = 'https://github.com/taucad/tau/actions/runs/200';
const earlierRun = 'https://github.com/taucad/tau/actions/runs/100';
const fingerprint = collectFingerprint(macProbe());
const record = (overrides: Partial<VerdictRecord> = {}): VerdictRecord => ({
  ...(verdictRecord(
    {
      ...runEnvironment,
      GITHUB_SHA: earlier,
      GITHUB_RUN_ID: '100',
      NX_TASK_HASH: '123',
      NX_TASK_TARGET_PROJECT: 'host',
      NX_TASK_TARGET_TARGET: 'test:shell-qualification',
    },
    fingerprint,
    new Date('2026-11-09T10:00:00Z'),
  ) as VerdictRecord),
  ...overrides,
});

describe('receipt stamp', () => {
  it('stamps a receipt this run wrote as fresh, in either mode', () => {
    for (const mode of ['reuse', 'fresh']) {
      const result = judgeReceipt({
        name: 'receipt.json',
        receipt: { row: 'MAC-A', source: { sha, run: thisRun } },
        verdict: undefined,
        env: { ...runEnvironment, TAU_SHELL_EVIDENCE: mode },
        fingerprint,
      });
      expect(result).toMatchObject({ ok: true, stamp: { verdict: 'fresh', testedAt: { sha, run: thisRun } } });
    }
  });

  it('stamps a cache-restored receipt as reused from its hash and first commit', () => {
    const result = judgeReceipt({
      name: 'qualification-receipt.json',
      receipt: { row: 'MAC-A', source: { sha: earlier, run: earlierRun } },
      verdict: record(),
      env: runEnvironment,
      fingerprint,
    });
    expect(result).toMatchObject({
      ok: true,
      stamp: { verdict: 'reused', taskHash: '123', provenAt: { sha: earlier, run: earlierRun }, testedAt: { sha } },
      line: `MAC-A qualification-receipt.json: verdict reused from hash 123, first proven at ${earlier} in ${earlierRun}`,
    });
  });

  it.each([
    ['a fresh run restored an old receipt', { TAU_SHELL_EVIDENCE: 'fresh' }, record(), fingerprint],
    ['the verdict record is missing', {}, undefined, fingerprint],
    ['the record names another run', {}, record({ provenAt: { sha, run: earlierRun, recordedAt: '' } }), fingerprint],
    ['the record was proven in another tier', { TAU_SHELL_TIER: 'full' }, record(), fingerprint],
    ['the record was proven under another fingerprint', {}, record({ fingerprint: 'sha256:other' }), fingerprint],
    ['this machine cannot be fingerprinted', {}, record(), { ok: false, reason: 'a probe failed' } as const],
  ] as const)('refuses a reused receipt when %s', (...[, env, verdict, current]) => {
    const result = judgeReceipt({
      name: 'receipt.json',
      receipt: { row: 'MAC-A', source: { sha: earlier, run: earlierRun } },
      verdict,
      env: { ...runEnvironment, ...env },
      fingerprint: current,
    });
    expect(result.ok).toBe(false);
  });

  it('refuses a missing receipt and another row', () => {
    const judge = (receipt: Parameters<typeof judgeReceipt>[0]['receipt']) =>
      judgeReceipt({ name: 'receipt.json', receipt, verdict: undefined, env: runEnvironment, fingerprint }).ok;
    expect(judge(undefined)).toBe(false);
    expect(judge({ row: 'MAC-X', source: { sha, run: thisRun } })).toBe(false);
  });
});

const cacheable: TargetConfiguration = {
  cache: true,
  inputs: ['default', '^default', { runtime: fingerprintCommand }],
  outputs: [
    '{workspaceRoot}/out/test-results/shell-conformance/*/receipt.json',
    '{workspaceRoot}/out/test-results/shell-conformance/*/receipt.verdict.json',
  ],
  options: { command: `vitest run src/shell/shell.conformance.test.ts && ${recordCommand}` },
};

describe('conformance cache guard', () => {
  it('accepts an uncached target and a fingerprinted one', () => {
    expect(cacheViolations('a:test:shell-conformance', { cache: false })).toEqual([]);
    expect(cacheViolations('a:test:shell-conformance', cacheable)).toEqual([]);
  });

  it('fails a cached target without the environment fingerprint', () => {
    expect(cacheViolations('a:test:shell-conformance', { ...cacheable, inputs: ['default', '^default'] })).toEqual([
      expect.stringContaining('no environment fingerprint input'),
    ]);
    expect(
      cacheViolations('a:test:shell-conformance', {
        ...cacheable,
        inputs: ['default', '^default', { runtime: 'node scripts/src/shell-evidence.ts fingerprint || true' }],
      }),
    ).toEqual([expect.stringContaining('no environment fingerprint input')]);
  });

  it('fails a target cached by default, a narrowed closure, foreign outputs, no record and cached failures', () => {
    expect(cacheViolations('a:t', { ...cacheable, cache: undefined })).toEqual([
      expect.stringContaining('neither false nor an explicit true'),
    ]);
    expect(cacheViolations('a:t', { ...cacheable, inputs: ['default', { runtime: fingerprintCommand }] })).toEqual([
      expect.stringContaining('source closure'),
    ]);
    expect(
      cacheViolations('a:t', {
        ...cacheable,
        inputs: [...(cacheable.inputs ?? []), '!{projectRoot}/src/shell/**', { externalDependencies: ['vitest'] }],
      }),
    ).toHaveLength(2);
    expect(
      cacheViolations('a:t', { ...cacheable, outputs: ['{workspaceRoot}/out/test-results/shell-conformance'] }),
    ).toEqual([expect.stringContaining('outputs')]);
    expect(cacheViolations('a:t', { ...cacheable, options: { command: 'vitest run' } })).toEqual([
      expect.stringContaining('verdict record'),
    ]);
    expect(
      cacheViolations('a:t', { ...cacheable, options: { ...cacheable.options, env: { NX_CACHE_FAILURES: 'true' } } }),
    ).toEqual([expect.stringContaining('NX_CACHE_FAILURES')]);
  });
});

type Step = { name?: string; run?: string; env?: Record<string, string>; if?: string };
type Workflow = { env?: Record<string, string>; jobs: Record<string, { env?: Record<string, string>; steps: Step[] }> };
const workflow = (file: string): Workflow =>
  load(readFileSync(resolve(root, '.github/workflows', file), 'utf8')) as Workflow;

describe('shell conformance workflow evidence', () => {
  const shell = workflow('shell-conformance.yml');
  const projectTargets = (path: string): Record<string, TargetConfiguration> =>
    (JSON.parse(readFileSync(resolve(root, path), 'utf8')) as { targets: Record<string, TargetConfiguration> }).targets;
  const targets: Record<string, TargetConfiguration> = {
    'native-process-core:test:shell-conformance': projectTargets('packages/core/native-process/project.json')[
      'test:shell-conformance'
    ]!,
    'host:test:shell-conformance': projectTargets('packages/host/project.json')['test:shell-conformance']!,
    'host:test:shell-qualification': projectTargets('packages/host/project.json')['test:shell-qualification']!,
    'desktop:test:terminal-conformance': projectTargets('apps/desktop/project.json')['test:terminal-conformance']!,
  };

  it('asks for reuse only on its own pull request trigger', () => {
    expect(shell.jobs['macos']?.env?.['TAU_SHELL_EVIDENCE']).toBe(
      `\${{ github.event_name == 'pull_request' && !inputs.ref && 'reuse' || 'fresh' }}`,
    );
    expect(shell.jobs['linux']?.env?.['TAU_SHELL_EVIDENCE']).toBeUndefined();
    expect(JSON.stringify(shell)).not.toContain('NX_CACHE_FAILURES');
    expect(shell.env?.['NX_DAEMON']).toBe('false');
  });

  it('runs every Mac conformance target fresh unless reuse was asked for, then stamps every receipt', () => {
    const steps = shell.jobs['macos']?.steps ?? [];
    const receipts: string[] = [];
    for (const [target, configuration] of Object.entries(targets)) {
      const step = steps.find((candidate) => candidate.run?.includes(`pnpm nx run ${target} `));
      expect(step, target).toBeDefined();
      const receipt = step?.env?.['TAU_SHELL_CONFORMANCE_RECEIPT']?.split('/').at(-1) ?? '';
      receipts.push(receipt);
      if (configuration.cache === false) {
        expect(step?.run).toMatch(/ --skip-nx-cache$/u);
      } else {
        expect(step?.run).toMatch(/ \$\{\{ env\.TAU_SHELL_EVIDENCE == 'fresh' && '--skip-nx-cache' \|\| '' \}\}$/u);
        expect(configuration.outputs).toContain(`{workspaceRoot}/out/test-results/shell-conformance/*/${receipt}`);
      }
    }
    const stamp = steps.find((step) => step.run?.includes('node scripts/src/shell-evidence.ts stamp'));
    expect(stamp?.if).toBe('success() || failure()');
    expect(stamp?.run?.split(/\s+/u).slice(-receipts.length).toSorted()).toEqual(receipts.toSorted());
  });

  it('keeps the Linux guest rows fresh', () => {
    const guest = readFileSync(
      resolve(root, 'packages/core/native-process/scripts/shell-conformance-guest.sh'),
      'utf8',
    );
    const runs = guest.match(/nx run [\w-]+:test:[\w:-]+[^\n]*/gu) ?? [];
    expect(runs.length).toBeGreaterThanOrEqual(4);
    for (const run of runs) {
      expect(run).toContain('--skip-nx-cache');
    }
    expect(guest).not.toContain('TAU_SHELL_EVIDENCE');
  });

  it('never lets a pull request run satisfy the promotion gate', () => {
    const promotion = readFileSync(resolve(root, '.github/workflows/desktop-route-promotion.yml'), 'utf8');
    expect(promotion).toContain(`shell-conformance.yml/runs?head_sha=\${sha}&status=success&per_page=100`);
    expect(promotion).toContain(`--jq '[.workflow_runs[] | select(.event != "pull_request")] | length'`);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End wire names. */
