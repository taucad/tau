import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The formal toolchain cache is saved from `main` only and restored everywhere (CI throughput review, formal speed,
 * 2026-11-17). `setup-formal` used to restore and save under the job's own ref; a merge-queue or pull request job
 * can read only its own ref's entries and `main`'s, so the restore missed in every sampled queue job and each
 * agent-host job saved a 473 MB entry that nothing read. Now `setup-formal` only restores, and
 * `formal-toolchain-cache.yml` seeds `main`'s entry for every tool selection a workflow asks for.
 */

const root = resolve(import.meta.dirname, '../..');

type Step = {
  readonly id?: string;
  readonly name?: string;
  readonly uses?: string;
  readonly if?: string;
  readonly with?: Record<string, unknown>;
};
type Job = {
  readonly steps?: readonly Step[];
  readonly strategy?: { readonly matrix?: { readonly selection?: ReadonlyArray<{ tools: string; key: string }> } };
};

const action = load(readFileSync(resolve(root, '.github/actions/setup-formal/action.yml'), 'utf8')) as {
  readonly inputs: Record<string, { readonly default?: string }>;
  readonly runs: { readonly steps: readonly Step[] };
};
const seed = load(readFileSync(resolve(root, '.github/workflows/formal-toolchain-cache.yml'), 'utf8')) as {
  readonly on: Record<string, unknown>;
  readonly jobs: Record<string, Job>;
};
const workflows = readdirSync(resolve(root, '.github/workflows'))
  .filter((file) => /\.ya?ml$/u.test(file))
  .map((file) => ({
    file,
    jobs: Object.values(
      (load(readFileSync(resolve(root, '.github/workflows', file), 'utf8')) as { jobs?: Record<string, Job> }).jobs ??
        {},
    ),
  }));
const formalSteps = workflows.flatMap(({ file, jobs }) =>
  jobs.flatMap((job) =>
    (job.steps ?? []).filter((step) => step.uses === './.github/actions/setup-formal').map((step) => ({ file, step })),
  ),
);
const actionKey = `formal-\${{ runner.os }}-\${{ runner.arch }}-\${{ steps.cache-key.outputs.tools }}-\${{ hashFiles('tools/formal/toolchain.lock') }}`;
const pinned = '27d5ce7f107fe9357f9df03efb73ab90386fccae';

describe('setup-formal toolchain cache', () => {
  it('should restore in every job and save only when asked, on main, after a miss', () => {
    const cacheSteps = action.runs.steps.filter((step) => step.uses?.startsWith('actions/cache'));
    expect(cacheSteps.map((step) => step.uses)).toEqual([
      `actions/cache/restore@${pinned}`,
      `actions/cache/save@${pinned}`,
    ]);
    const [restore, save] = cacheSteps;
    expect(restore?.id).toBe('restore');
    expect(restore?.with).toEqual({ path: 'node_modules/.cache/formal', key: actionKey });
    expect(save?.with).toEqual({ path: 'node_modules/.cache/formal', key: actionKey });
    expect(save?.if).toBe(
      "inputs.save-cache == 'true' && github.ref == 'refs/heads/main' && steps.restore.outputs.cache-hit != 'true'",
    );
    expect(action.inputs['save-cache']?.default).toBe('false');
    // Saving is the seeding workflow's alone.
    expect(formalSteps.filter(({ step }) => step.with?.['save-cache'] !== undefined).map(({ file }) => file)).toEqual([
      'formal-toolchain-cache.yml',
    ]);
  });

  it("should seed main's entry for every tool selection a workflow passes, under the action's key", () => {
    expect(Object.keys(seed.on).toSorted()).toEqual(['push', 'workflow_dispatch']);
    expect(seed.on['push']).toEqual({ branches: ['main'] });
    const job = seed.jobs['seed'];
    const selections = job?.strategy?.matrix?.selection ?? [];
    for (const { tools, key } of selections) {
      expect(key).toBe(tools.replaceAll(',', '-'));
    }
    const used = new Set(
      formalSteps
        .map(({ step }) => (step.with?.['tools'] as string | undefined) ?? action.inputs['tools']?.default ?? '')
        .filter((tools) => !tools.includes('${{')),
    );
    expect([...used].toSorted()).toEqual(selections.map(({ tools }) => tools).toSorted());
    const lookup = job?.steps?.find((step) => step.id === 'lookup');
    expect(lookup?.uses).toBe(`actions/cache/restore@${pinned}`);
    expect(lookup?.with).toEqual({
      path: 'node_modules/.cache/formal',
      key: actionKey.replace('steps.cache-key.outputs.tools', 'matrix.selection.key'),
      'lookup-only': true,
    });
    const provision = job?.steps?.find((step) => step.uses === './.github/actions/setup-formal');
    expect(provision?.if).toBe("steps.lookup.outputs.cache-hit != 'true'");
    expect(provision?.with).toEqual({ tools: `\${{ matrix.selection.tools }}`, 'save-cache': 'true' });
  });
});
