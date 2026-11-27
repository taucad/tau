import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The flake ledger ingestion (FQ-2) runs after every completed CI run, so its reach is kept to what it needs: it
 * lists runs and downloads artifacts (`actions: read`), writes its own state branch and the quarantine entry branch
 * (`contents: write`), and opens the owner issues and the entry pull request (FQ-6: `issues: write`,
 * `pull-requests: write`), with no persisted checkout credential, and it skips a pull request's run before a runner
 * starts. The entry and release steps write with a `tau-flake-bot` App token from the main-only `flake-bot`
 * environment when its secrets are set, and with the workflow token when they are not.
 */
const text = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/flake-ledger.yml'), 'utf8');

type Step = { readonly uses?: string; readonly run?: string; readonly with?: Record<string, unknown> };
type Workflow = {
  readonly on: {
    readonly workflow_run?: { readonly workflows: readonly string[]; readonly types: readonly string[] };
    readonly schedule?: ReadonlyArray<{ readonly cron: string }>;
    readonly workflow_dispatch?: unknown;
  };
  readonly permissions: Record<string, string>;
  readonly jobs: Record<
    string,
    {
      readonly if?: string;
      readonly concurrency?: { readonly group: string; readonly 'cancel-in-progress': boolean };
      readonly environment?: unknown;
      readonly permissions?: Record<string, string>;
      readonly steps: Step[];
    }
  >;
};
const workflow = load(text) as Workflow;
const ciName = (
  load(readFileSync(resolve(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8')) as {
    name: string;
  }
).name;

describe('flake ledger workflow', () => {
  it('should run when a CI run completes, daily to catch up, and on dispatch', () => {
    expect(workflow.on.workflow_run).toEqual({ workflows: [ciName], types: ['completed'] });
    expect(workflow.on.schedule).toHaveLength(1);
    expect(workflow.on.workflow_dispatch).toBeDefined();
  });

  it('should queue one writer at a time without cancelling it, and let skipped runs stay out of the queue', () => {
    expect((workflow as { concurrency?: unknown }).concurrency).toBeUndefined();
    for (const job of Object.values(workflow.jobs)) {
      expect(job.concurrency).toEqual({ group: 'flake-ledger', 'cancel-in-progress': false });
    }
  });

  it('should ingest only the merge queue and pushes to main', () => {
    const [job] = Object.values(workflow.jobs);
    expect(job?.if).toContain("github.event.workflow_run.event == 'merge_group'");
    expect(job?.if).toContain(
      "github.event.workflow_run.event == 'push' && github.event.workflow_run.head_branch == 'main'",
    );
  });

  it('should hold only the permissions it writes with, the flake-bot environment and no persisted credential', () => {
    expect(workflow.permissions).toEqual({});
    for (const job of Object.values(workflow.jobs)) {
      expect(job.permissions).toEqual({
        actions: 'read',
        contents: 'write',
        issues: 'write',
        'pull-requests': 'write',
      });
      expect(job.environment).toEqual({ name: 'flake-bot', deployment: false });
    }
    // Only the App's two secrets, and only the mint step and the check that they are set read them.
    expect(new Set(text.match(/secrets\.\w+/gu))).toEqual(
      new Set(['secrets.FLAKE_BOT_APP_ID', 'secrets.FLAKE_BOT_APP_PRIVATE_KEY']),
    );
    expect(text).not.toContain('nx-cache-write');
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
    for (const step of steps.filter((entry) => entry.uses?.startsWith('actions/checkout@'))) {
      expect(step.with?.['persist-credentials']).toBe(false);
    }
  });

  it('should pin every external action, pass dispatch input through the environment and run the ingestion CLI', () => {
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
    for (const step of steps.filter((entry) => entry.uses && !entry.uses.startsWith('./'))) {
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/u);
    }
    const ingest = steps.find((step) => step.run?.startsWith('node scripts/src/ci-flake-ledger-ingest-cli.ts'));
    expect(ingest?.run).toContain('--runs "$RUNS"');
    expect(ingest?.run).not.toContain('${{');
  });

  it('should check out every module the ingestion and the entry import', () => {
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
    const checkout = steps.find((step) => step.uses?.startsWith('actions/checkout@'));
    const listed = checkout?.with?.['sparse-checkout'];
    const sparse = (typeof listed === 'string' ? listed : '').split('\n').filter((line) => line !== '');
    const imported = new Set<string>([
      'scripts/src/ci-flake-ledger-ingest-cli.ts',
      'scripts/src/ci-flake-quarantine-entry-cli.ts',
      'scripts/src/ci-flake-quarantine-release-cli.ts',
      'scripts/src/ci-flake-metrics-cli.ts',
    ]);
    // A Set's iteration visits what is added during it, so this walks the whole import graph.
    for (const file of imported) {
      const source = readFileSync(resolve(import.meta.dirname, '../..', file), 'utf8');
      for (const match of source.matchAll(/from '#([\w-]+)\.js'/gu)) {
        imported.add(`scripts/src/${match[1]}.ts`);
      }
      if (source.includes("from '@taucad/vitest-ci/quarantine'")) {
        imported.add('tools/vitest-ci/src/quarantine.ts');
      }
      // Only `node:` modules, workspace-local `#` imports and the linked quarantine module: the job installs nothing.
      expect(source, file).not.toMatch(/from '(?!node:|#|@taucad\/vitest-ci\/quarantine')[^']+'/u);
    }
    for (const file of [
      ...imported,
      'scripts/package.json',
      'scripts/src/flake-ledger.json',
      'tools/vitest-ci/package.json',
    ]) {
      expect(sparse).toContain(file);
    }
    // The entry reads every project and quarantine file, and links the one workspace package as pnpm would.
    expect(sparse).toEqual(expect.arrayContaining(['project.json', 'quarantine.json']));
    // The quarantine module is linked before the ingestion, which reads the entries to count their release bar.
    const link = steps.findIndex((step) =>
      step.run?.includes('ln -sfn ../../tools/vitest-ci node_modules/@taucad/vitest-ci'),
    );
    const ingest = steps.findIndex((step) => step.run?.startsWith('node scripts/src/ci-flake-ledger-ingest-cli.ts'));
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(ingest);
    const entry = steps.find((step) => step.run?.includes('node scripts/src/ci-flake-quarantine-entry-cli.ts'));
    // Entries are planned only from a complete ingestion.
    expect((entry as { if?: string } | undefined)?.if).toBe(`\${{ steps.ingest.outcome == 'success' }}`);
    // Release and expiry too, and an expiry is due on its day even when the entry step failed.
    const release = steps.findIndex((step) =>
      step.run?.startsWith('node scripts/src/ci-flake-quarantine-release-cli.ts'),
    );
    // A test is released only from a count of every pending run.
    expect(steps[release]?.run).toBe(
      'node scripts/src/ci-flake-quarantine-release-cli.ts --releases "$INGEST_COMPLETE"',
    );
    expect((steps[release] as { env?: Record<string, string> } | undefined)?.env?.['INGEST_COMPLETE']).toBe(
      `\${{ steps.ingest.outcome == 'success' && steps.ingest.outputs.complete == 'true' }}`,
    );
    expect(release).toBeGreaterThan(steps.indexOf(entry ?? {}));
    // An expiry is due on its day: a failed or partial ingestion releases nothing but still expires.
    expect((steps[release] as { if?: string } | undefined)?.if).toBe(
      `\${{ !cancelled() && steps.ingest.outcome != 'skipped' }}`,
    );
  });

  it('should mint a tau-flake-bot token for tau with only the write scopes the entry and release use', () => {
    const [job] = Object.values(workflow.jobs) as Array<{ env?: Record<string, string>; steps: Step[] }>;
    expect(job?.env).toEqual({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- an environment variable
      FLAKE_BOT_CONFIGURED: `\${{ secrets.FLAKE_BOT_APP_ID != '' && secrets.FLAKE_BOT_APP_PRIVATE_KEY != '' }}`,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- an environment variable
      FLAKE_BOT_LOGIN: `\${{ vars.FLAKE_BOT_LOGIN || 'tau-flake-bot[bot]' }}`,
    });
    const steps = job?.steps ?? [];
    const mints = steps.filter((step) => step.uses?.startsWith('actions/create-github-app-token@'));
    expect(mints).toHaveLength(1);
    const [mint] = mints as Array<Step & { id?: string; if?: string }>;
    expect(mint?.uses).toBe('actions/create-github-app-token@064492a9a1762067169d50c792a7dc02bc3d1254');
    expect(mint?.id).toBe('flake-bot');
    expect(mint?.with).toEqual({
      'app-id': `\${{ secrets.FLAKE_BOT_APP_ID }}`,
      'private-key': `\${{ secrets.FLAKE_BOT_APP_PRIVATE_KEY }}`,
      owner: `\${{ github.repository_owner }}`,
      repositories: 'tau',
      'permission-contents': 'write',
      'permission-issues': 'write',
      'permission-pull-requests': 'write',
    });
    // Skipped without the secrets (the fallback), and minted after the ingestion so its hour covers the writers.
    expect(mint?.if).toBe(
      `\${{ !cancelled() && steps.ingest.outcome != 'skipped' && env.FLAKE_BOT_CONFIGURED == 'true' }}`,
    );
    const at = (cli: string): number => steps.findIndex((step) => step.run?.startsWith(`node scripts/src/${cli}`));
    expect(steps.indexOf(mint ?? {})).toBeGreaterThan(at('ci-flake-ledger-ingest-cli.ts'));
    expect(steps.indexOf(mint ?? {})).toBeLessThan(at('ci-flake-quarantine-entry-cli.ts'));
  });

  it('should write entries and removals with the App token, falling back to the workflow token without it', () => {
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps) as Array<
      Step & { env?: Record<string, string> }
    >;
    const tokenOf = (cli: string): string | undefined =>
      steps.find((step) => step.run?.startsWith(`node scripts/src/${cli}`))?.env?.['GITHUB_TOKEN'];
    for (const cli of ['ci-flake-quarantine-entry-cli.ts', 'ci-flake-quarantine-release-cli.ts']) {
      expect(tokenOf(cli), cli).toBe(`\${{ steps.flake-bot.outputs.token || github.token }}`);
    }
    // The state branch is the workflow token's alone (the `flake-ledger-writer` ruleset), and the metrics only read.
    for (const cli of ['ci-flake-ledger-ingest-cli.ts', 'ci-flake-metrics-cli.ts']) {
      expect(tokenOf(cli), cli).toBe(`\${{ github.token }}`);
    }
    // No private key reaches a step that does not mint the token.
    for (const step of steps.filter((entry) => !entry.uses?.startsWith('actions/create-github-app-token@'))) {
      expect(JSON.stringify(step)).not.toContain('PRIVATE_KEY');
    }
  });

  it('should never approve a pull request: no CLI it runs posts a review', () => {
    for (const cli of [
      'ci-flake-quarantine-entry-cli.ts',
      'ci-flake-quarantine-release-cli.ts',
      'ci-shadow-rows-promote-cli.ts',
    ]) {
      const source = readFileSync(resolve(import.meta.dirname, cli), 'utf8');
      expect(source, cli).not.toMatch(/\/reviews|APPROVE|addPullRequestReview/u);
    }
  });

  it('should write the D9 metrics table to its summary last, on every run that ingested (FQ-11)', () => {
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
    const metrics = steps.at(-1) as (Step & { if?: string; env?: Record<string, string> }) | undefined;
    expect(metrics?.run).toBe('node scripts/src/ci-flake-metrics-cli.ts');
    expect(metrics?.if).toBe(`\${{ !cancelled() && steps.ingest.outcome != 'skipped' }}`);
    expect(Object.keys(metrics?.env ?? {})).toEqual(['GITHUB_TOKEN']);
    expect(metrics?.env?.['GITHUB_TOKEN']).toBe(`\${{ github.token }}`);
  });
});
