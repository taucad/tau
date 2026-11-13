import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/naming-convention -- GitHub workflow keys and environment variable names are exact external names. */

/**
 * Desktop split DS-3. The packaged desktop suite is a candidate gate (operator decision D-DS1 (b)):
 * `release-desktop-staging.yml` calls `desktop-packaged.yml` after the shell gate and tags only when both are
 * green. Intel is packaged only on a dispatch that asks for it, which the promotion gate makes for an Apple
 * silicon-only candidate (D-DS3); the 03:17 full-candidate schedule is gone. DS-4 deleted the nightly's packaged job.
 */
const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

type Step = {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
  with?: Record<string, string | boolean>;
};
type Job = {
  name?: string;
  if?: string;
  needs?: string | string[];
  uses?: string;
  with?: Record<string, string | boolean>;
  secrets?: Record<string, string>;
  permissions?: Record<string, string>;
  'runs-on'?: string;
  env?: Record<string, string | number>;
  steps?: Step[];
};
type Workflow = {
  on: Record<
    string,
    | {
        inputs?: Record<string, { type?: string; required?: boolean; default?: unknown }>;
        secrets?: Record<string, { required?: boolean }>;
      }
    | undefined
  >;
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs: Record<string, Job>;
};

const packaged = load(read('.github/workflows/desktop-packaged.yml')) as Workflow;
const staging = load(read('.github/workflows/release-desktop-staging.yml')) as Workflow;
const promotion = load(read('.github/workflows/desktop-route-promotion.yml')) as Workflow;
const nightly = load(read('.github/workflows/e2e-nightly.yml')) as Workflow;

/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

/** Run one workflow step's script with stubbed tools; returns its status, outputs and the calls it made. */
const runStep = (
  script: string,
  stubs: Record<string, string>,
  environment: Record<string, string>,
): {
  status: ReturnType<typeof spawnSync>['status'];
  outputs: Record<string, string>;
  calls: string;
  stdout: string;
} => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-desktop-packaged-'));
  try {
    const output = join(directory, 'output');
    const calls = join(directory, 'calls');
    writeFileSync(output, '');
    writeFileSync(calls, '');
    for (const [name, body] of Object.entries(stubs)) {
      writeFileSync(join(directory, name), `#!/bin/sh\necho "${name} $*" >> "$CALLS"\n${body}\n`, { mode: 0o700 });
    }
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        PATH: `${directory}:${process.env['PATH'] ?? ''}`,
        CALLS: calls,
        RUNNER_TEMP: directory,
        GITHUB_OUTPUT: output,
        GH_REPO: 'taucad/tau',
        ...environment,
      },
    });
    const outputs = Object.fromEntries(
      readFileSync(output, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('=') as [string, string]),
    );
    return { status: result.status, outputs, calls: readFileSync(calls, 'utf8'), stdout: result.stdout };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe('desktop-packaged.yml', () => {
  const job = packaged.jobs['packaged']!;
  const steps = job.steps ?? [];
  const index = (name: string): number => steps.findIndex((step) => step.name === name);

  it('should be callable with the candidate commit and dispatchable on any commit', () => {
    expect(packaged.on['workflow_call']?.inputs?.['ref']).toMatchObject({ type: 'string', required: true });
    expect(packaged.on['workflow_dispatch']?.inputs?.['ref']).toMatchObject({ type: 'string', required: false });
    expect(Object.keys(packaged.on).sort()).toEqual(['workflow_call', 'workflow_dispatch']);
    expect(steps[index('Checkout')]?.with?.['ref']).toBe(expression("inputs.ref || 'main'"));
  });

  it('should never share a concurrency group with its caller', () => {
    // In a called workflow `github.workflow` is the caller's name, so a group built on it would cancel the call.
    expect(packaged.concurrency?.group ?? '').not.toContain('github.workflow');
    expect(packaged.concurrency?.group).toContain('inputs.ref');
    expect(packaged.concurrency?.['cancel-in-progress']).toBe(false);
  });

  it('should run the packaged suite on hosted Apple silicon with host services, and be its only runner', () => {
    expect(job['runs-on']).toBe('macos-26');
    const suite = steps[index('Run the packaged desktop suite')];
    expect(suite?.env?.['TAU_E2E_SERVICES']).toBe('host');
    expect(suite?.run).toContain('pnpm nx run-many -t test:e2e:packaged --parallel=1');
    expect(index('Start PostgreSQL, Redis and MinIO on the host')).toBeGreaterThan(index('Setup Nx Environment'));
    expect(index('Start PostgreSQL, Redis and MinIO on the host')).toBeLessThan(
      index('Run the packaged desktop suite'),
    );
    // DS-4 deleted the nightly's copy once this gate had run green twice: the suite runs here and nowhere else.
    expect(nightly.jobs['desktop-packaged']).toBeUndefined();
    expect(JSON.stringify(nightly)).not.toContain('test:e2e:packaged');
  });

  it('should read the remote cache and nothing more', () => {
    // No environment and no `id-token: write`, so the cache token can only read.
    expect(packaged.permissions).toEqual({ contents: 'read' });
    expect(job.permissions).toBeUndefined();
    expect(Object.keys(job)).not.toContain('environment');
    expect(packaged.on['workflow_call']?.secrets?.['NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN']).toMatchObject({
      required: false,
    });
    expect(staging.jobs['packaged']?.secrets).toEqual({
      NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN: expression('secrets.NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN'),
    });
  });

  it('should pin every action by commit', () => {
    for (const step of steps.filter((candidate) => candidate.uses && !candidate.uses.startsWith('./'))) {
      expect(step.uses, step.name).toMatch(/^[\w-]+\/[\w-]+@[\da-f]{40}$/u);
    }
  });
});

describe('release-desktop-staging.yml candidate gates', () => {
  it('should call the packaged gate on the candidate commit after a green shell gate', () => {
    const gate = staging.jobs['packaged'];
    expect(gate?.uses).toBe('./.github/workflows/desktop-packaged.yml');
    expect(gate?.needs).toEqual(['prerelease', 'shell']);
    expect(gate?.if).toBe("needs.prerelease.outputs.release == 'true' && needs.shell.result == 'success'");
    expect(gate?.with).toEqual({ ref: expression('needs.prerelease.outputs.sha') });
    expect(gate?.permissions).toEqual({ contents: 'read' });
  });

  it('should tag a candidate only when every gate is green', () => {
    const { tag } = staging.jobs;
    expect(tag?.needs).toEqual(['prerelease', 'shell', 'packaged', 'benchmarks']);
    expect(tag?.if).toBe(
      "needs.prerelease.outputs.release == 'true' && needs.shell.result == 'success' && needs.packaged.result == 'success' && needs.benchmarks.result == 'success'",
    );
    expect(tag?.steps?.find((step) => step.id === 'release')?.run).toMatch(
      /^\s*Packaged desktop gate: run \$\{RUN_ID\}$/mu,
    );
  });

  it('should run the native benchmark gates on the candidate commit beside the shell gate (Q-2)', () => {
    const { benchmarks } = staging.jobs;
    expect(benchmarks?.uses).toBe('./.github/workflows/native-darwin.yml');
    expect(benchmarks?.needs).toEqual(['prerelease']);
    expect(benchmarks?.if).toBe("needs.prerelease.outputs.release == 'true'");
    expect(benchmarks?.with).toEqual({
      ref: ['$', '{{ needs.prerelease.outputs.sha }}'].join(''),
      projects: '',
      benchmarks: true,
    });
  });

  it('should have no schedule: Intel is built on dispatch and for the promotion gate only (D-DS3)', () => {
    expect(Object.keys(staging.on).sort()).toEqual(['workflow_dispatch', 'workflow_run']);
    expect(staging.jobs['prerelease']?.if).not.toContain('schedule');
    expect(staging.on['workflow_dispatch']?.inputs?.['sha']).toMatchObject({ type: 'string', required: false });
  });

  it('should give a dispatch its own concurrency group so a later automatic run cannot cancel it', () => {
    expect(staging.concurrency?.group).toBe(
      `release-desktop-staging${expression("github.event_name == 'workflow_dispatch' && format('-dispatch-{0}', github.run_id) || ''")}`,
    );
    expect(staging.concurrency?.['cancel-in-progress']).toBe(false);
  });

  const selector = staging.jobs['prerelease']?.steps?.find((step) => step.id === 'selected');
  const select = (event: string, intel: string) =>
    runStep(
      selector!.run!,
      {
        gh: 'echo desktop-staging@1.2.3-staging.4',
        git: 'if [ "$1" = rev-parse ]; then echo "$BASE_SHA"; fi\nexit 0',
        pnpm: 'echo \'["desktop"]\'',
      },
      {
        BASE_SHA: 'b'.repeat(40),
        TARGET: 't'.repeat(40),
        EVENT: event,
        DISPATCH_INTEL: intel,
        DISPATCH_NOTARIZE: '',
      },
    );

  it.each([
    { name: 'a dispatch that asks for Intel', event: 'workflow_dispatch', intel: 'true', expected: 'true' },
    { name: 'a dispatch that does not', event: 'workflow_dispatch', intel: 'false', expected: 'false' },
    { name: 'an automatic candidate', event: 'workflow_run', intel: '', expected: 'false' },
    { name: 'a retired schedule event', event: 'schedule', intel: 'true', expected: 'false' },
  ])('packages Intel for $name: intel=$expected', ({ event, intel, expected }) => {
    const { status, outputs } = select(event, intel);

    expect(status).toBe(0);
    expect(outputs['intel']).toBe(expected);
    expect(outputs['release']).toBe('true');
  });

  const target = staging.jobs['prerelease']?.steps?.find((step) => step.id === 'target');
  const pick = (dispatchSha: string, green: boolean) =>
    runStep(
      target!.run!,
      {
        gh: `case "$*" in *compare*) echo ahead ;; *actions/workflows/ci.yml/runs*) echo ${String(green)} ;; *) echo ${'c'.repeat(40)} ;; esac`,
      },
      { TRIGGER_SHA: '', DISPATCH_SHA: dispatchSha, STAGING_SUPPORT_SHA: 's'.repeat(40) },
    );

  it('should release the dispatched commit when its main CI push run is green', () => {
    const sha = 'a'.repeat(40);
    const { status, outputs, calls } = pick(sha, true);

    expect(status).toBe(0);
    expect(outputs['sha']).toBe(sha);
    expect(calls).toContain(`actions/workflows/ci.yml/runs?head_sha=${sha}&branch=main&event=push`);
    expect(calls).not.toContain('commits?sha=main');
  });

  it.each([
    ['without green main CI', 'a'.repeat(40), false],
    ['that is not a full sha', 'main', true],
  ])('should refuse a dispatched commit %s', (_case, sha, green) => {
    const { status, outputs } = pick(sha, green);

    expect(status).not.toBe(0);
    expect(outputs['sha']).toBeUndefined();
  });

  it('should fall back to the newest green main commit when a dispatch names none', () => {
    const { status, outputs, calls } = pick('', true);

    expect(status).toBe(0);
    expect(outputs['sha']).toBe('c'.repeat(40));
    expect(calls).toContain('commits?sha=main');
  });
});

describe('desktop-route-promotion.yml full candidate request (D-DS3)', () => {
  const job = promotion.jobs['candidate'];
  const step = job?.steps?.[0];

  it('should run before publication, which needs it', () => {
    expect(promotion.jobs['publication']?.needs).toEqual(['candidate']);
    expect(job?.if).toBe("github.ref == 'refs/heads/main'");
    expect(job?.permissions).toEqual({ contents: 'read', actions: 'write' });
    expect(step?.if).toBe(
      "github.event_name == 'workflow_dispatch' && inputs.operation == 'promote-routes' && inputs.scope == 'all'",
    );
  });

  const commit = 'd'.repeat(40);
  const tagObject = 'e'.repeat(40);
  const request = (tag: string, kind: 'lightweight' | 'arm64' | 'full') =>
    runStep(
      step!.run!,
      {
        gh: [
          'case "$*" in',
          `  *git/ref/tags/*) ${kind === 'lightweight' ? `echo "commit ${commit}"` : `echo "tag ${tagObject}"`} ;;`,
          `  *"--jq .message"*) ${kind === 'full' ? String.raw`printf 'Mac architectures: arm64 x64\n'` : String.raw`printf 'Notarize: true\n'`} ;;`,
          `  *"--jq .object.sha"*) echo ${commit} ;;`,
          'esac',
        ].join('\n'),
      },
      { TAG: tag },
    );

  it.each([
    ['a lightweight (Apple silicon-only) candidate', 'lightweight'],
    ['an annotated candidate without the Intel line', 'arm64'],
  ] as const)('should request a full candidate of the same commit for %s and stop', (_case, kind) => {
    const { status, calls } = request('desktop-staging@1.2.3-staging.4', kind);

    expect(status).not.toBe(0);
    expect(calls).toContain(
      `gh workflow run release-desktop-staging.yml --repo taucad/tau --ref main -f intel=true -f sha=${commit}`,
    );
  });

  it('should let a full candidate through without a request', () => {
    const { status, calls } = request('desktop-staging@1.2.3-staging.4', 'full');

    expect(status).toBe(0);
    expect(calls).not.toContain('workflow run');
  });

  it('should leave a production tag alone: it always packages both', () => {
    const { status, calls } = request('desktop@1.2.3', 'lightweight');

    expect(status).toBe(0);
    expect(calls).toBe('');
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- end of the external names. */
