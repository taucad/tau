import { spawnSync } from 'node:child_process';
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { consumers } from '#consumer-parity-summary.js';

/*
 * The end-to-end ratchet (operator ruling 2026-11-15): an end-to-end suite that passed five consecutive e2e-nightly
 * runs (two before 2026-11-17, merge-queue defect MQ-3) is listed in its project's `test:e2e:queue` `dependsOn`, runs in ci.yml's `e2e-queue` lane (one row per suite,
 * in the merge queue, when its project is affected) and leaves the nightly matrix for good. The plan's own rows and
 * failures are pinned with the other lanes in `ci-affected-lanes.test.ts`.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

type Step = {
  readonly id?: string;
  readonly if?: string;
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly env?: Record<string, string>;
  readonly with?: Record<string, string>;
  readonly 'timeout-minutes'?: number;
};
type Job = {
  readonly if?: string;
  readonly name?: string;
  readonly needs?: string | readonly string[];
  readonly outputs?: Record<string, string>;
  readonly steps?: readonly Step[];
  readonly env?: Record<string, string>;
  readonly strategy?: { readonly matrix?: Record<string, unknown> };
  readonly 'timeout-minutes'?: number;
};
type Workflow = { readonly env?: Record<string, string>; readonly jobs: Record<string, Job> };

const ci = load(read('.github/workflows/ci.yml')) as Workflow;
/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');
const planStep = ci.jobs['plan']?.steps?.find((step) => step.id === 'plan');
const planScript = planStep?.run ?? '';
const laneSelectors = JSON.parse(planStep?.env?.['LANE_SELECTORS'] ?? '{}') as Record<string, unknown>;

describe('ci.yml end-to-end ratchet lane (operator ruling 2026-11-15)', () => {
  const nightly = load(read('.github/workflows/e2e-nightly.yml')) as Workflow;
  const lane = ci.jobs['e2e-queue'];
  const steps = lane?.steps ?? [];
  const nightlySteps = nightly.jobs['e2e']?.steps ?? [];
  const step = (list: readonly Step[], name: string): Step | undefined => list.find((entry) => entry.name === name);
  /** The first batch, green on nightlies 43698158501 and 43752242587. A suite never moves back to the nightly. */
  const firstBatch = [
    'agent-host:test:e2e',
    'agent-observability:test:e2e',
    'agent-plugin:test:e2e',
    'runtime-e2e:test:e2e',
    'react-e2e:test:e2e',
    'react-e2e:test:e2e:development',
    'scripts:test:e2e',
    'ui-e2e:test:e2e:daemon-host',
    'ui-e2e:test:e2e:deploy-skew',
    'ui-e2e:test:e2e:development',
    'ui-e2e:test:e2e:filesystem-scenarios',
    'ui-e2e:test:e2e:non-isolated',
  ];

  it('should plan the lane from test:e2e:queue, in the merge queue and for a pull request that touches the project', () => {
    expect(laneSelectors['e2e-queue']).toEqual({ targets: ['test:e2e:queue'], pr: 'touched' });
    expect(planScript).toContain('e2e_queue=$(flag e2e-queue)');
    expect(planScript).toContain('echo "e2e-queue-suites=$e2e_queue_suites"');
    expect(ci.jobs['plan']?.outputs?.['e2e-queue-suites']).toBe(expression('steps.plan.outputs.e2e-queue-suites'));
    expect(lane?.needs).toEqual(['plan']);
    expect(lane?.if).toBe(
      expression("!cancelled() && needs.plan.result == 'success' && needs.plan.outputs.e2e-queue == 'true'"),
    );
    expect(lane?.strategy?.matrix?.['suite']).toBe(expression('fromJSON(needs.plan.outputs.e2e-queue-suites)'));
    // The rows carry the nightly's job names, so a suite keeps its name when it moves.
    expect(lane?.name).toBe(nightly.jobs['e2e']?.name);
  });

  it('should require every row in the required check when the plan selected the lane', () => {
    const gate = ci.jobs['affected']?.steps?.[0];
    expect(gate?.env?.['E2E_QUEUE_REQUIRED']).toBe(expression('needs.plan.outputs.e2e-queue'));
    expect(gate?.env?.['E2E_QUEUE_RESULT']).toBe(expression('needs.e2e-queue.result'));
    const check = gate?.run ?? '';
    const rule = 'if [ "$E2E_QUEUE_REQUIRED" = true ]; then test "$E2E_QUEUE_RESULT" = success; fi';
    expect(check).toContain(rule);
    expect(check.indexOf(rule)).toBeGreaterThan(check.indexOf('if [ -n "$REUSED" ]; then'));
  });

  it("should run each row as the nightly runs that suite, within the nightly's bounds", () => {
    for (const name of [
      'Install browsers for Vitest Browser',
      'Install Pandoc for reference conversion',
      'Install a software Vulkan driver for native rendering',
      'Prepare API env file',
      'Validate captured chat logs',
    ]) {
      expect(step(steps, name)?.run, name).toBe(step(nightlySteps, name)?.run);
    }
    expect(step(steps, 'Setup Linux sandbox prerequisites')?.uses).toBe('./.github/actions/setup-linux-sandbox');
    expect(step(steps, 'Setup formal toolchains')?.with).toEqual({ tools: 'tlc' });
    // The suites that open no chat are the nightly's; every other suite's chat logs are validated, failed or not.
    expect(lane?.env?.['SUITES_WITHOUT_CHAT']).toBe(nightly.env?.['SUITES_WITHOUT_CHAT']);
    for (const name of ['Setup formal toolchains', 'Validate captured chat logs']) {
      expect(step(steps, name)?.if, name).toBe(
        expression('!cancelled() && !contains(fromJSON(env.SUITES_WITHOUT_CHAT), matrix.suite.target)'),
      );
    }
    const run = step(steps, 'Run the end-to-end suite');
    expect(run?.run).toBe(
      'xvfb-run --auto-servernum pnpm nx run-many -t "$TARGET" --projects "$PROJECT" --parallel=1 --outputStyle=stream',
    );
    expect(Object.entries(run?.env ?? {})).toEqual([
      ['TAU_E2E_WEBGPU_PROFILE', 'software'],
      ['PROJECT', expression('matrix.suite.project')],
      ['TARGET', expression('matrix.suite.target')],
    ]);
    // No bound above the nightly's for the same suites.
    expect(run?.['timeout-minutes']).toBeLessThanOrEqual(
      step(nightlySteps, 'Run the end-to-end suite')?.['timeout-minutes'] ?? 0,
    );
    expect(lane?.['timeout-minutes']).toBeLessThanOrEqual(nightly.jobs['e2e']?.['timeout-minutes'] ?? 0);
  });

  it('should keep every first-batch suite in its project test:e2e:queue target', () => {
    const ratcheted: string[] = [];
    for (const path of globSync('**/project.json', {
      cwd: root,
      exclude: (name) => name === 'node_modules' || name === '.nx' || name === 'out' || name === 'repos',
    })) {
      const project = JSON.parse(read(path)) as {
        readonly name: string;
        readonly targets?: Record<string, { readonly dependsOn?: readonly unknown[] }>;
      };
      for (const dependency of project.targets?.['test:e2e:queue']?.dependsOn ?? []) {
        // Each entry is a target of the same project, which the nightly lists among its suites.
        expect(typeof dependency, `${project.name}:test:e2e:queue`).toBe('string');
        expect(project.targets?.[String(dependency)], `${project.name}:${String(dependency)}`).toBeDefined();
        ratcheted.push(`${project.name}:${String(dependency)}`);
      }
    }
    expect(ratcheted).toEqual(expect.arrayContaining(firstBatch));
  });

  it('should read a ratcheted suite consumer parity oracle from its merge-queue row on a main commit, never the nightly', () => {
    const oracles = consumers.flatMap(({ oracles: list }) => list).filter((oracle) => oracle.kind === 'job');
    for (const suite of firstBatch) {
      const name = `Browser end-to-end (${suite.replace(':', ' ')})`;
      for (const oracle of oracles.filter(({ job }) => job === name)) {
        // `main` scope follows a reused push to the merge-queue run on the same commit (#2296).
        expect(oracle, name).toMatchObject({ workflow: 'ci.yml', match: 'exact', scope: 'main' });
        expect(oracle, name).not.toHaveProperty('event');
      }
    }
    expect(oracles.map(({ job }) => job)).toContain('Browser end-to-end (agent-plugin test:e2e)');
  });

  it('should leave every ratcheted suite out of the nightly matrix', () => {
    const script = nightly.jobs['plan']?.steps?.find((candidate) => candidate.id === 'suites')?.run ?? '';
    const directory = mkdtempSync(join(tmpdir(), 'tau-e2e-nightly-plan-'));
    try {
      const target = (config: Record<string, unknown> = {}): Record<string, unknown> => config;
      const graph = {
        graph: {
          nodes: {
            'ui-e2e': {
              name: 'ui-e2e',
              data: {
                targets: {
                  'test:e2e': target({ metadata: { shards: 2 } }),
                  'test:e2e:development': target(),
                  'test:e2e:daemon-host': target(),
                  'test:e2e:browser-host': target(),
                  'test:e2e:queue': target({ dependsOn: ['test:e2e:development', 'test:e2e:daemon-host'] }),
                },
              },
            },
            'agent-host': {
              name: 'agent-host',
              data: { targets: { 'test:e2e': target(), 'test:e2e:queue': target({ dependsOn: ['test:e2e'] }) } },
            },
            viewer: { name: 'viewer', data: { targets: { 'test:e2e': target() } } },
          },
        },
      };
      writeFileSync(join(directory, 'graph-fixture.json'), JSON.stringify(graph));
      writeFileSync(
        join(directory, 'pnpm'),
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'case "$1 $2 $3" in',
          '  "nx graph --file="*) cp "$FIXTURES/graph-fixture.json" "$(cut -d= -f2- <<< "$3")" ;;',
          `  "nx show projects") echo "NX log line"; jq -c --arg t "$5" '[.graph.nodes[] | select(.data.targets | has($t)) | .name]' "$FIXTURES/graph-fixture.json" ;;`,
          `  "nx show project") echo "NX log line"; jq -c --arg p "$4" '.graph.nodes[$p].data' "$FIXTURES/graph-fixture.json" ;;`,
          '  *) echo "unexpected pnpm $*" >&2; exit 1 ;;',
          'esac',
          '',
        ].join('\n'),
        { mode: 0o700 },
      );
      const output = join(directory, 'output');
      writeFileSync(output, '');
      const result = spawnSync('bash', ['-e', '-c', script], {
        cwd: directory,
        encoding: 'utf8',
        env: Object.fromEntries([
          ['PATH', `${directory}:${process.env['PATH'] ?? ''}`],
          ['FIXTURES', directory],
          ['RUNNER_TEMP', directory],
          ['GITHUB_OUTPUT', output],
          ['SUITES_WITHOUT_CHAT', nightly.env?.['SUITES_WITHOUT_CHAT'] ?? '[]'],
        ]),
      });
      expect(result.status, result.stderr).toBe(0);
      const suites = /^suites=(.*)$/mu.exec(readFileSync(output, 'utf8'))?.[1] ?? '[]';
      expect((JSON.parse(suites) as ReadonlyArray<{ readonly label: string }>).map(({ label }) => label)).toEqual([
        'ui-e2e test:e2e 1/2',
        'ui-e2e test:e2e 2/2',
        'viewer test:e2e',
        'ui-e2e test:e2e:browser-host',
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
