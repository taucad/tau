import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The formal nightly runs one job per project with a `formal:nightly` target, each with its own
 * 120-minute budget (CI throughput review, Q-4): one serial job of every project ran out of its 60
 * minutes on each scheduled run of 2026-11-07 to 2026-11-11, and `agent-host` alone needs about 90. The project list comes from Nx, so a new
 * owner's target joins the matrix without a workflow edit, and an empty list fails rather than passes.
 */

const root = resolve(import.meta.dirname, '../..');

type Step = {
  readonly name?: string;
  readonly id?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly if?: string;
  readonly env?: Record<string, string>;
  readonly with?: Record<string, unknown>;
};
type Job = {
  readonly needs?: string | readonly string[];
  readonly 'timeout-minutes'?: number;
  readonly outputs?: Record<string, string>;
  readonly strategy?: { readonly 'fail-fast'?: boolean; readonly matrix?: Record<string, unknown> };
  readonly steps?: readonly Step[];
};
type Workflow = {
  readonly on: Record<string, unknown>;
  readonly concurrency?: Record<string, unknown>;
  readonly jobs: Record<string, Job>;
};

const workflow = load(readFileSync(resolve(root, '.github/workflows/formal-nightly.yml'), 'utf8')) as Workflow;
const list = workflow.jobs['projects'];
const shard = workflow.jobs['formal-nightly'];

describe('formal nightly workflow', () => {
  it('should keep its schedule, dispatch and one-run-at-a-time concurrency', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['schedule', 'workflow_dispatch']);
    expect(workflow.concurrency).toEqual({ group: 'formal-nightly', 'cancel-in-progress': false });
  });

  it('should list the projects from Nx and fail on an empty list', () => {
    const step = list?.steps?.find((candidate) => candidate.id === 'list');
    expect(step?.run).toContain('pnpm nx show projects --with-target formal:nightly --json | tail -1');
    expect(step?.run).toContain('exit 1');
    expect(list?.outputs?.['projects']).toBe(`\${{ steps.list.outputs.projects }}`);
  });

  it('should run one job per project, each with its own 120-minute budget', () => {
    expect(shard?.needs).toBe('projects');
    expect(shard?.['timeout-minutes']).toBe(120);
    expect(shard?.strategy?.['fail-fast']).toBe(false);
    expect(shard?.strategy?.matrix?.['project']).toBe(`\${{ fromJSON(needs.projects.outputs.projects) }}`);
  });

  it('should run only its own project, streamed, with every formal toolchain', () => {
    const setup = shard?.steps?.find((step) => step.uses === './.github/actions/setup-formal');
    expect(setup?.with?.['tools']).toBe('tlc,lean,apalache');
    const run = shard?.steps?.find((step) => step.run?.includes('formal:nightly'));
    expect(run?.env?.['PROJECT']).toBe(`\${{ matrix.project }}`);
    expect(run?.run).toBe('pnpm nx run-many -t formal:nightly --projects "$PROJECT" --parallel=1 --outputStyle=stream');
  });

  it('should upload each project reports under its own artifact name, after a failure too', () => {
    const upload = shard?.steps?.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
    expect(upload?.uses).toMatch(/^actions\/upload-artifact@[\da-f]{40}$/u);
    expect(upload?.if).toBe('always()');
    expect(upload?.with?.['name']).toBe(`formal-nightly-reports-\${{ matrix.project }}`);
  });
});
