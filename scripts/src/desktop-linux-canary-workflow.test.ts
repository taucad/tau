/* eslint-disable @typescript-eslint/naming-convention -- Admission steps read exact process environment keys. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * D-H8 (desktop release signing pipeline, course correction 2026-11-10): every Linux GPU matrix starts with one canary
 * row that runs alone, and the rest of the matrix waits until it passes, so a harness or product defect costs one row
 * instead of a full serial matrix. The canary shares the exact row steps and environment of the other rows (YAML
 * anchors), and the receipt job still needs every row, canary included.
 */

const root = resolve(import.meta.dirname, '../..');

type Step = { readonly name?: string; readonly id?: string; readonly run?: string; readonly uses?: string };
type Job = {
  readonly if?: string;
  readonly needs?: string | readonly string[];
  readonly env?: Record<string, unknown>;
  readonly steps?: readonly Step[];
  readonly strategy?: { readonly 'max-parallel'?: unknown; readonly matrix?: { readonly include?: unknown } };
};
type Workflow = { readonly jobs: Record<string, Job> };

const workflow = (file: string): Workflow =>
  load(readFileSync(resolve(root, '.github/workflows', file), 'utf8')) as Workflow;
const needs = (job: Job | undefined): readonly string[] =>
  job?.needs === undefined ? [] : typeof job.needs === 'string' ? [job.needs] : job.needs;

/** Run the admission job's inline row selection exactly as the runner would and read its step outputs. */
const selectRows = (job: Job | undefined, env: Record<string, string>): Record<string, unknown> => {
  const script = job?.steps?.find((step) => step.id === 'selection')?.run;
  expect(script).toBeDefined();
  const directory = mkdtempSync(join(tmpdir(), 'tau-canary-selection-'));
  try {
    const output = join(directory, 'output');
    writeFileSync(output, '');
    execFileSync('bash', ['-euo', 'pipefail', '-c', script ?? ''], {
      env: { PATH: process.env['PATH'] ?? '', ...env, GITHUB_OUTPUT: output },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    return Object.fromEntries(
      readFileSync(output, 'utf8')
        .trim()
        .split('\n')
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator), JSON.parse(line.slice(separator + 1)) as unknown];
        }),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const linuxRows = [
  'ubuntu-apt-x11',
  'ubuntu-appimage-x11',
  'ubuntu2604-apt-x11',
  'ubuntu2604-appimage-x11',
  'debian-apt-x11',
  'debian-appimage-x11',
];
const ids = (rows: unknown): readonly string[] => (rows as ReadonlyArray<{ readonly id: string }>).map(({ id }) => id);

describe('Linux clean-host acceptance canary', () => {
  const { jobs } = workflow('desktop-route-vm-acceptance.yml');

  it('selects one canary row and the other five rows separately', () => {
    const outputs = selectRows(jobs['admission'], { SCOPE: 'linux' });
    expect(ids(outputs['linux_canary'])).toEqual(['ubuntu-apt-x11']);
    expect(ids(outputs['matrix'])).toEqual(linuxRows.slice(1));
  });

  it('holds the other rows until the canary passes and collects every row', () => {
    expect(jobs['linux-canary']?.if).toBe("inputs.scope == 'linux'");
    expect(needs(jobs['linux-canary'])).toEqual(['admission']);
    expect(jobs['linux-canary']?.strategy?.matrix?.include).toContain('needs.admission.outputs.linux_canary');
    // Default success(): a failed or cancelled canary skips the remaining rows and the receipts.
    expect(jobs['linux']?.if).toBe("inputs.scope == 'linux'");
    expect(needs(jobs['linux'])).toEqual(['admission', 'linux-canary']);
    expect(jobs['linux']?.strategy?.matrix?.include).toContain('needs.admission.outputs.matrix');
    expect(needs(jobs['linux-receipts'])).toEqual(['linux-canary', 'linux']);
  });

  it('runs the canary with exactly the same row steps and environment', () => {
    expect(jobs['linux-canary']?.steps).toBeDefined();
    expect(jobs['linux']?.steps).toEqual(jobs['linux-canary']?.steps);
    expect(jobs['linux']?.env).toEqual(jobs['linux-canary']?.env);
  });

  it('leaves the Mac rows without a canary', () => {
    const outputs = selectRows(jobs['admission'], {
      SCOPE: 'macos',
      RUNNER_GROUP: 'local-mac-trusted',
      ARM64_LABEL: 'local-mac',
      X64_LABEL: '',
    });
    expect(outputs['linux_canary']).toBeUndefined();
    expect(ids(outputs['matrix'])).toEqual(['macos-zip-arm64', 'macos-dmg-arm64']);
  });
});

describe('Linux route qualification canary', () => {
  const { jobs } = workflow('desktop-route-qualification.yml');
  const select = (scope: string, graphics = 'stock') =>
    selectRows(jobs['admission'], {
      TAU_DESKTOP_QUALIFICATION_SCOPE: scope,
      TAU_QUALIFICATION_GRAPHICS: graphics,
      CHANNEL: 'staging',
    });

  it('starts a Linux run, stock or software, with one canary row', () => {
    for (const graphics of ['stock', 'isolated-software']) {
      const outputs = select('linux', graphics);
      expect(ids(outputs['canary'])).toEqual(['ubuntu-apt-x11']);
      expect(ids(outputs['matrix'])).toEqual(linuxRows.slice(1));
    }
  });

  it('gives other scopes no canary and their complete row set', () => {
    const mac = select('macos');
    expect(mac['canary']).toEqual([]);
    expect(ids(mac['matrix'])).toEqual(['macos-zip-arm64', 'macos-dmg-arm64']);
    expect(ids(select('all')['matrix'])).toHaveLength(11);
  });

  it('holds the rest of a Linux matrix until the canary passes', () => {
    expect(jobs['canary']?.if).toBe("inputs.scope == 'linux'");
    expect(needs(jobs['installed'])).toEqual(['admission', 'canary']);
    const gate = String(jobs['installed']?.if);
    expect(gate).toContain("needs.canary.result == 'success'");
    // A skipped canary admits the rest only for a scope that has no canary.
    expect(gate).toContain("(inputs.scope != 'linux' && needs.canary.result == 'skipped')");
    expect(gate).toContain('!cancelled()');
    expect(jobs['installed']?.steps).toEqual(jobs['canary']?.steps);
    expect(jobs['installed']?.env).toEqual(jobs['canary']?.env);
    expect(needs(jobs['receipts'])).toEqual(['canary', 'installed']);
    expect(String(jobs['receipts']?.if)).toContain("needs.installed.result == 'success'");
  });
});
