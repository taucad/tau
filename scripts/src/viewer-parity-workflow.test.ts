import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { deal, parseDurations } from '#test-shard-dealer.js';

/*
 * `viewer-parity.yml` after VP-1 (operator ruling 2026-11-18, "PR-side + release gate"): the merge queue never runs it;
 * `ci.yml` calls it on a pull request whose own diff touches a parity input, and `release-gate.yml` calls it on every
 * candidate with `uncached`. Eight capture shards dealt by measured seconds, then one gate over every fixture of the
 * manifest, with the thresholds the gate test owns. These tests pin that every fixture is still captured and gated.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

type Step = {
  readonly id?: string;
  readonly name?: string;
  readonly if?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly env?: Record<string, string>;
  readonly with?: Record<string, unknown>;
};
type Job = {
  readonly if?: string;
  readonly needs?: string | readonly string[];
  readonly strategy?: { readonly matrix?: { readonly shard?: readonly number[] } };
  readonly steps?: readonly Step[];
};
type Workflow = {
  readonly on: Record<string, { readonly inputs?: Record<string, Record<string, unknown>> } | undefined>;
  readonly jobs: Record<string, Job>;
};

const workflow = load(read('.github/workflows/viewer-parity.yml')) as Workflow;
const manifest = JSON.parse(read('libs/tau-examples/fixtures/viewer-parity/fixtures.json')) as {
  readonly fixtures: ReadonlyArray<{ readonly name: string }>;
};
const fixtures = manifest.fixtures.map(({ name }) => name);
const captureSeconds = parseDurations(
  JSON.parse(read('libs/tau-examples/fixtures/viewer-parity/capture-seconds.json')),
);

describe('viewer-parity.yml (VP-1)', () => {
  it('should capture in eight shards whose deal covers every fixture exactly once', () => {
    const shards = workflow.jobs['viewer']?.strategy?.matrix?.shard ?? [];
    expect(shards).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(workflow.jobs['viewer']?.steps?.find((step) => step.name === "Deal this shard's fixtures")?.run).toContain(
      '--shards 8',
    );
    const dealt = deal(fixtures, shards.length, captureSeconds);
    expect(dealt.flat().toSorted()).toEqual(fixtures.toSorted());
    expect(new Set(dealt.flat()).size).toBe(fixtures.length);
    expect(dealt.every((shard) => shard.length > 0)).toBe(true);
    // Every listed fixture is measured, so the deal balances on real seconds (about five minutes a shard).
    expect(fixtures.filter((fixture) => !(fixture in captureSeconds.seconds))).toEqual([]);
    const loads = dealt.map((shard) => shard.reduce((sum, fixture) => sum + (captureSeconds.seconds[fixture] ?? 0), 0));
    expect(Math.max(...loads)).toBeLessThan(360);
  });

  it('should gate every fixture once, after every shard, against the merged references', () => {
    const { gate } = workflow.jobs;
    expect(gate?.needs).toEqual(['fixtures', 'viewer']);
    expect(gate?.steps?.find((step) => step.name === 'Download the viewer references')?.with).toMatchObject({
      pattern: 'viewer-parity-viewer-*',
      'merge-multiple': true,
    });
    // No PARITY_FIXTURES filter: the gate scores the whole manifest and refuses a fixture with no reference.
    const run = gate?.steps?.find((step) => step.name === 'Run the parity gate');
    expect(run?.run).toBe('pnpm nx run tau-examples:test:viewer-parity');
    expect(Object.keys(run?.env ?? {})).toEqual(['TAU_E2E_WEBGPU_PROFILE']);
    expect(read('libs/tau-examples/scripts/viewer-parity.gate.test.ts')).toContain(': no viewer reference in ');
  });

  it('should check out the called commit and take `uncached` from the release gate', () => {
    const call = workflow.on['workflow_call'];
    expect(call?.inputs?.['ref']).toMatchObject({ type: 'string', required: true });
    expect(call?.inputs?.['uncached']).toMatchObject({ type: 'boolean', default: false });
    for (const name of ['fixtures', 'viewer', 'gate']) {
      const checkout = workflow.jobs[name]?.steps?.find((step) => step.uses?.startsWith('actions/checkout@'));
      expect(checkout?.with, name).toEqual({ ref: expression("inputs.ref || ''"), 'persist-credentials': false });
    }
    const steps = workflow.jobs['fixtures']?.steps ?? [];
    expect(steps.find((step) => step.id === 'cache')?.if).toBe(expression('!inputs.uncached'));
    // A skipped restore leaves no hit, so the release gate always generates the GLBs from its commit.
    expect(steps.find((step) => step.name === 'Generate the fixture GLBs')?.if).toBe(
      "steps.cache.outputs.cache-hit != 'true'",
    );
  });

  it('should keep dispatch and the viewer-parity label, and push to main only to save the fixture cache', () => {
    expect(Object.keys(workflow.on).toSorted()).toEqual(['pull_request', 'push', 'workflow_call', 'workflow_dispatch']);
    const pushOnly = "inputs.ref != '' || github.event_name != 'push'";
    expect(workflow.jobs['viewer']?.if).toBe(pushOnly);
    expect(workflow.jobs['fixtures']?.steps?.find((step) => step.name === 'Upload the fixture GLBs')?.if).toBe(
      pushOnly,
    );
  });
});
