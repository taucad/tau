/* eslint-disable @typescript-eslint/naming-convention -- GitHub contexts, job ids and process environment keys are exact external names. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { evaluate, expression, interpolate } from '#github-expression.js';
import type { Context, Value } from '#github-expression.js';

/*
 * D-H5 platform scopes (operator ruling 2026-11-10; Windows joined 2026-11-17): each platform builds, qualifies and
 * promotes on its own receipts, without another platform's jobs. These replays evaluate the real `if`, artifact-name
 * and secret expressions of the candidate, qualification, promotion and clean-host workflows for every scope, and run
 * their inline row-selection scripts, so a scope can never start, wait for or consume another platform's work.
 */

const root = resolve(import.meta.dirname, '../..');
type Step = {
  readonly name?: string;
  readonly id?: string;
  readonly if?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly env?: Record<string, string>;
  readonly with?: Record<string, string>;
};
type Job = {
  readonly if?: string;
  readonly needs?: string | readonly string[];
  readonly steps?: readonly Step[];
  readonly env?: Record<string, string>;
};
type Workflow = {
  readonly on: { readonly workflow_dispatch: { readonly inputs: Record<string, { readonly options?: string[] }> } };
  readonly jobs: Record<string, Job>;
};
const workflow = (file: string): Workflow =>
  load(readFileSync(resolve(root, '.github/workflows', file), 'utf8')) as Workflow;
const needs = (job: Job): readonly string[] =>
  job.needs === undefined ? [] : typeof job.needs === 'string' ? [job.needs] : job.needs;
const condition = (text: string | undefined): string =>
  text === undefined ? 'success()' : /^\$\{\{[\s\S]*\}\}$/u.test(text.trim()) ? expression(text) : text;

/**
 * Replay one dispatch: walk the jobs in dependency order; a job whose `if` holds succeeds, any other is skipped, and a
 * job without its own `if` is skipped when a dependency was. Returns the jobs that would run.
 */
const replay = (file: string, inputs: Record<string, string>): string[] => {
  const { jobs } = workflow(file);
  const results: Record<string, 'success' | 'skipped'> = {};
  const pending = new Set(Object.keys(jobs));
  while (pending.size > 0) {
    const ready = [...pending].filter((id) => needs(jobs[id]!).every((dependency) => dependency in results));
    expect(ready.length).toBeGreaterThan(0);
    for (const id of ready) {
      const job = jobs[id]!;
      const context: Context = {
        github: { ref: 'refs/heads/main', event_name: 'workflow_dispatch' },
        vars: { DESKTOP_INSTALLER_CANDIDATES_ENABLED: 'true' },
        inputs,
        needs: Object.fromEntries(needs(job).map((dependency) => [dependency, { result: results[dependency]! }])),
      };
      const dependenciesPassed = needs(job).every((dependency) => results[dependency] === 'success');
      const explicit = job.if !== undefined;
      const admitted = evaluate(condition(job.if), context);
      results[id] =
        (explicit || dependenciesPassed) && admitted !== false && admitted !== '' && admitted !== undefined
          ? 'success'
          : 'skipped';
      pending.delete(id);
    }
  }
  return Object.keys(results)
    .filter((id) => results[id] === 'success')
    .sort();
};
const context = (inputs: Record<string, string>): Context => ({ inputs, github: { ref: 'refs/heads/main' } });
const step = (job: Job | undefined, match: (candidate: Step) => boolean): Step => {
  const found = job?.steps?.find(match);
  expect(found).toBeDefined();
  return found!;
};
/** Run an inline workflow script as the runner would and read its step outputs. */
const runOutputs = (script: string | undefined, env: Record<string, string>): Record<string, Value> => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-scope-selection-'));
  try {
    const output = join(directory, 'output');
    writeFileSync(output, '');
    execFileSync('bash', ['-euo', 'pipefail', '-c', script ?? ''], {
      env: { PATH: process.env['PATH'] ?? '', ...env, GITHUB_OUTPUT: output, GITHUB_REF: 'refs/heads/main' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return Object.fromEntries(
      readFileSync(output, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator), JSON.parse(line.slice(separator + 1)) as Value];
        }),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const ids = (rows: Value): string[] => (rows as Array<{ id: string }>).map(({ id }) => id);

describe('desktop installer candidate platform scopes', () => {
  const file = 'desktop-installer-candidate.yml';
  const { on, jobs } = workflow(file);

  it('offers every platform scope', () => {
    expect(on.workflow_dispatch.inputs['scope']?.options).toEqual(['all', 'linux', 'macos', 'windows']);
  });

  it.each([
    ['all', ['candidate', 'linux', 'macos', 'resolve', 'windows']],
    ['linux', ['candidate', 'linux', 'resolve']],
    ['macos', ['candidate', 'macos', 'resolve']],
    ['windows', ['candidate', 'resolve', 'windows']],
  ])('a %s candidate runs only its own platform jobs and still assembles', (scope, expected) => {
    expect(replay(file, { scope })).toEqual(expected);
  });

  it('never reads release metadata or the attached archive for an artifact-bound Windows or Linux candidate', () => {
    for (const scope of ['windows', 'linux']) {
      const downloads = [jobs['resolve'], jobs[scope]].flatMap(
        (job) => job?.steps?.filter((candidate) => candidate.uses?.startsWith('actions/download-artifact')) ?? [],
      );
      for (const download of downloads) {
        expect(evaluate(condition(download.if), context({ scope }))).toBe(false);
      }
      const preflight = step(jobs['resolve'], (candidate) => candidate.run?.includes('--args=preflight') === true);
      expect(evaluate(condition(preflight.if), context({ scope }))).toBe(false);
    }
    // The Windows stage step fetches the exact release run's archive artifact itself.
    const stage = step(jobs['windows'], (candidate) => candidate.id === 'stage');
    expect(stage.env?.['DESKTOP_RELEASE_RUN_ID']).toBe(`\${{ inputs.release_run_id }}`);
  });

  it('loads Linux descriptor and APT signing material only for scopes that publish Linux routes', () => {
    const { candidate } = jobs;
    for (const name of ['Admit the approved descriptor signing key', 'Prepare the signed qualification APT snapshot']) {
      const signing = step(candidate, (item) => item.name === name);
      for (const [scope, loaded] of [
        ['all', true],
        ['linux', true],
        ['macos', false],
        ['windows', false],
      ] as const) {
        expect(evaluate(condition(signing.if), context({ scope }))).toBe(loaded);
      }
    }
    const admit = step(candidate, (item) => item.run?.includes('--args=admit-scope') === true);
    expect(evaluate(condition(admit.if), context({ scope: 'windows' }))).toBe(true);
  });

  it('uploads each scope under the artifact name its fetcher admits', () => {
    const upload = step(jobs['candidate'], (item) => item.uses?.startsWith('actions/upload-artifact') === true);
    const names = Object.fromEntries(
      ['all', 'linux', 'macos', 'windows'].map((scope) => [
        scope,
        interpolate(upload.with?.['name'] ?? '', context({ scope })),
      ]),
    );
    expect(names).toEqual({
      all: 'desktop-installer-candidate',
      linux: 'desktop-linux-installer-candidate',
      macos: 'desktop-macos-installer-candidate',
      windows: 'desktop-windows-installer-candidate',
    });
    const fetcher = readFileSync(resolve(root, 'apps/desktop/scripts/fetch-desktop-installer-candidate.mts'), 'utf8');
    for (const name of Object.values(names)) {
      expect(fetcher).toContain(`'${name}'`);
    }
  });
});

describe('desktop route qualification platform scopes', () => {
  const file = 'desktop-route-qualification.yml';
  const { on, jobs } = workflow(file);
  const selection = step(jobs['admission'], (item) => item.id === 'selection');

  it.each([
    ['windows', [], ['windows-nsis-x64', 'windows-nsis-recovery-x64']],
    ['macos', [], ['macos-zip-arm64', 'macos-dmg-arm64']],
  ])('a %s run selects exactly its own rows', (scope, canary, rows) => {
    const outputs = runOutputs(selection.run, {
      TAU_QUALIFICATION_GRAPHICS: 'stock',
      TAU_DESKTOP_QUALIFICATION_SCOPE: scope,
      CHANNEL: 'production',
    });
    expect(ids(outputs['canary'] ?? [])).toEqual(canary);
    expect(ids(outputs['matrix'] ?? [])).toEqual(rows);
  });

  it('keeps Linux rows behind their canary and the full scope complete', () => {
    const linux = runOutputs(selection.run, {
      TAU_QUALIFICATION_GRAPHICS: 'stock',
      TAU_DESKTOP_QUALIFICATION_SCOPE: 'linux',
      CHANNEL: 'staging',
    });
    expect([...ids(linux['canary']), ...ids(linux['matrix'])].every((id) => /apt|appimage/u.test(id))).toBe(true);
    const all = runOutputs(selection.run, {
      TAU_QUALIFICATION_GRAPHICS: 'stock',
      TAU_DESKTOP_QUALIFICATION_SCOPE: 'all',
      CHANNEL: 'production',
    });
    // Eleven A→B→C rows and the three T-B22.4 recovery rows.
    expect(ids(all['matrix'])).toHaveLength(14);
  });

  it('runs a T-B22.4 recovery row for each Windows and Linux route and admits them before any receipt is published', () => {
    const all = runOutputs(selection.run, {
      TAU_QUALIFICATION_GRAPHICS: 'stock',
      TAU_DESKTOP_QUALIFICATION_SCOPE: 'all',
      CHANNEL: 'staging',
    });
    const recovery = ((all['matrix'] ?? []) as Array<{ id: string; route: string; scenario?: string }>).filter(
      (row) => row.scenario === 'recovery',
    );
    expect(recovery.map((row) => [row.id, row.route])).toEqual([
      ['windows-nsis-recovery-x64', 'windows-nsis'],
      ['ubuntu-apt-recovery-x11', 'linux-apt'],
      ['ubuntu-appimage-recovery-x11', 'linux-appimage'],
    ]);
    const software = runOutputs(selection.run, {
      TAU_QUALIFICATION_GRAPHICS: 'isolated-software',
      TAU_DESKTOP_QUALIFICATION_SCOPE: 'linux',
      CHANNEL: 'staging',
    });
    expect(ids(software['matrix']).some((id) => id.includes('recovery'))).toBe(false);
    const installed = jobs['installed']!;
    expect(installed.env?.['TAU_QUALIFICATION_SCENARIO']).toBe(['$', "{{ matrix.scenario || 'chain' }}"].join(''));
    const receipts = jobs['receipts']!.steps!;
    const admit = receipts.findIndex((item) => item.run === 'pnpm nx run desktop:collect-qualification-recovery');
    const firstUpload = receipts.findIndex((item) => item.uses?.startsWith('actions/upload-artifact'));
    expect(admit).toBeGreaterThan(-1);
    expect(admit).toBeLessThan(firstUpload);
  });

  it('runs Windows on hosted windows-2025 without the Linux GPU path and publishes bound receipts', () => {
    expect(on.workflow_dispatch.inputs['scope']?.options).toEqual(['all', 'linux', 'macos', 'windows']);
    expect(replay(file, { scope: 'windows', graphics: 'stock' })).toEqual(['admission', 'installed', 'receipts']);
    const installed = jobs['installed']!;
    const gpu = step(installed, (item) => item.name === 'Sign in to Google Cloud for a disposable GPU host');
    expect(evaluate(condition(gpu.if), context({ scope: 'windows', graphics: 'stock' }))).toBe(false);
    const native = step(installed, (item) => item.run === 'pnpm nx run desktop:qualify-installed-route');
    expect(evaluate(condition(native.if), context({ scope: 'windows' }))).toBe(true);
    const lineEndings = step(installed, (item) => item.name === 'Keep committed line endings');
    expect(evaluate(condition(lineEndings.if), { runner: { os: 'Windows' } })).toBe(true);
    const uploads = jobs['receipts']!.steps!.filter((item) => item.uses?.startsWith('actions/upload-artifact'));
    const names = uploads.map((item) => interpolate(item.with?.['name'] ?? '', context({ scope: 'windows' })));
    expect(names).toEqual([
      'desktop-windows-host-matrix',
      'desktop-windows-ci-receipts',
      'desktop-windows-recovery-receipts',
    ]);
    expect(interpolate(uploads[1]!.with?.['path'] ?? '', context({ scope: 'windows' }))).toContain(
      'qualification-binding.json',
    );
    expect(interpolate(uploads[1]!.with?.['path'] ?? '', context({ scope: 'all' }))).not.toContain(
      'qualification-binding.json',
    );
  });
});

describe('desktop clean-host acceptance Windows scope', () => {
  const file = 'desktop-route-vm-acceptance.yml';
  const { jobs } = workflow(file);
  const gate = step(jobs['admission'], (item) => item.name?.startsWith('Fail closed') === true);
  const selection = step(jobs['admission'], (item) => item.id === 'selection');
  const gateEnv = (SCOPE: string, CHANNEL: string) => ({
    SCOPE,
    CHANNEL,
    QUALIFICATION_ENABLED: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
  });

  it('accepts Windows on production as it does Mac and Linux', () => {
    for (const scope of ['macos', 'windows', 'linux']) {
      for (const channel of ['staging', 'production']) {
        expect(() => runOutputs(gate.run, gateEnv(scope, channel))).not.toThrow();
      }
      expect(() => runOutputs(gate.run, gateEnv(scope, 'preview'))).toThrow();
    }
    expect(() => runOutputs(gate.run, gateEnv('all', 'production'))).toThrow();
  });

  it('selects only the named Windows consumer host and runs only the Windows jobs', () => {
    const outputs = runOutputs(selection.run, { SCOPE: 'windows', WINDOWS_GROUP: 'win', WINDOWS_LABEL: 'tau-w11' });
    expect(outputs['windows_host']).toEqual({ group: 'win', labels: ['self-hosted', 'Windows', 'X64', 'tau-w11'] });
    expect(() => runOutputs(selection.run, { SCOPE: 'windows', WINDOWS_GROUP: '', WINDOWS_LABEL: '' })).toThrow();
    expect(replay(file, { scope: 'windows' })).toEqual(['admission', 'windows', 'windows-receipts']);
  });

  it('binds the Windows receipt like Mac and Linux and uploads it under the name the publisher admits', () => {
    const receipts = jobs['windows-receipts']!;
    expect(receipts.steps?.some((item) => item.run?.includes('fetch-installer-candidate'))).toBe(false);
    const uploads = receipts.steps!.filter((item) => item.uses?.startsWith('actions/upload-artifact'));
    expect(uploads.map((item) => item.with?.['name'])).toEqual([
      'desktop-windows-vm-host-matrix',
      'desktop-windows-vm-receipts',
    ]);
    expect(uploads[1]!.with?.['path']).toContain('qualification-binding.json');
    const provenance = readFileSync(resolve(root, 'apps/desktop/scripts/desktop-receipt-provenance.mts'), 'utf8');
    expect(provenance).toContain("windows: 'desktop-windows-vm-receipts'");
    expect(provenance).toContain("windows: 'desktop-windows-ci-receipts'");
  });
});

describe('desktop route promotion Windows scope', () => {
  const { on, jobs } = workflow('desktop-route-promotion.yml');

  it('promotes a Windows catalog without materializing Linux signing material', () => {
    expect(on.workflow_dispatch.inputs['scope']?.options).toEqual(['all', 'macos', 'windows', 'linux']);
    const load = step(jobs['publication'], (item) => item.name === 'Load protected signing inputs');
    const secrets = { TAU_APPIMAGE_PRIVATE_KEY: 'k', TAU_APT_PRIVATE_KEY_BASE64: 'a' };
    const variables = { TAU_APPIMAGE_PUBLIC_KEYS: 'p' };
    for (const [scope, loaded] of [
      ['all', true],
      ['linux', true],
      ['macos', false],
      ['windows', false],
    ] as const) {
      for (const name of ['APPIMAGE_PRIVATE_KEY', 'APPIMAGE_PUBLIC_KEYS', 'APT_PRIVATE_KEY_BASE64']) {
        const value = interpolate(load.env?.[name] ?? '', { inputs: { scope }, secrets, vars: variables });
        expect(value !== '').toBe(loaded);
      }
    }
    expect(load.run).toMatch(/!= windows/u);
  });

  // Operator ruling 2026-11-17T08:27Z: beta Windows promotes without its Windows 11 clean-host run, on either channel.
  it('promotes Windows with the VM run left empty, as clean-host pending, on both channels', () => {
    expect(on.workflow_dispatch.inputs['vm-run-id']).not.toHaveProperty('required', true);
    const publication = jobs['publication']!;
    for (const channel of ['staging', 'production']) {
      const inputs = {
        operation: 'promote-routes',
        scope: 'windows',
        channel,
        'candidate-run-id': '1',
        'ci-run-id': '2',
        'vm-run-id': '',
      };
      const run: Context = {
        github: { ref: 'refs/heads/main', event_name: 'workflow_dispatch' },
        vars: { DESKTOP_INSTALLER_PUBLICATION_STAGING: 'true', DESKTOP_INSTALLER_PUBLICATION_PRODUCTION: 'true' },
        inputs,
        matrix: { channel },
        steps: { selected: { outputs: { run: 'true' } } },
      };
      expect(evaluate(condition(publication.if), run)).toBe(true);
      // The empty input reaches the publisher as an empty string, which it reads as an omitted VM run.
      expect(interpolate(publication.env?.['TAU_ROUTE_VM_RUN_ID'] ?? '', run)).toBe('');
      // No workflow gate keys on the VM run, so the publisher alone decides which scope may leave it pending.
      for (const item of publication.steps ?? []) {
        expect(`${item.if ?? ''}\n${item.run ?? ''}`).not.toMatch(/vm-run-id|TAU_ROUTE_VM_RUN_ID/u);
      }
      for (const name of [
        'Retrieve qualified candidate or completed metadata',
        'Publish or renew under the shared channel lock',
      ]) {
        expect(evaluate(condition(step(publication, (item) => item.name === name).if), run)).toBe(true);
      }
      // Every other production gate is unchanged: the shell conformance check still runs before a production promotion.
      const conformance = step(
        publication,
        (item) => item.name === "Require green shell conformance on the candidate's commit",
      );
      expect(evaluate(condition(conformance.if), run)).toBe(channel === 'production');
    }
  });
});
