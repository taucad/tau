import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/naming-convention -- GitHub workflow keys and environment variable names are exact external names. */

/**
 * Runs the served-commit check of `observability-staging.yml` against a stubbed `curl` and `gh`, so a run whose
 * deploy a newer one replaced ends neutral before the harness, while a stale or unreadable staging stays red.
 */
const root = resolve(import.meta.dirname, '../..');
type Step = { name?: string; id?: string; if?: string; run?: string; env?: Record<string, string> };
type Job = {
  needs?: string;
  if?: string;
  outputs?: Record<string, string>;
  concurrency?: { group: string; 'cancel-in-progress': boolean };
  steps: Step[];
};
const workflow = load(readFileSync(join(root, '.github/workflows/observability-staging.yml'), 'utf8')) as {
  concurrency?: unknown;
  jobs: { deployed: Job; harness: Job };
};
const served = workflow.jobs.deployed.steps.find((step) => step.id === 'served');

const trigger = 'a1b2c3d4e5f6'.padEnd(40, '0');
const page = (release: string): string =>
  `<script>window.ENV = {"TAU_BUILD_ID":"1","TAU_RELEASE":"${release}"}</script>`;

/** Each read returns the next page in `pages` (the last one repeats); `compare` answers every GitHub compare. */
const check = (pages: string[], compare = 'behind') => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-observability-served-'));
  try {
    const output = join(directory, 'output');
    const calls = join(directory, 'calls');
    writeFileSync(output, '');
    writeFileSync(calls, '');
    for (const [index, body] of pages.entries()) {
      writeFileSync(join(directory, `page-${index}`), body);
    }
    writeFileSync(
      join(directory, 'curl'),
      [
        '#!/bin/sh',
        'echo "curl $*" >> "$CALLS"',
        'n=$(grep -c "^curl" "$CALLS")',
        'i=$((n - 1)); [ "$i" -ge "$PAGES" ] && i=$((PAGES - 1))',
        'f="$STUBS/page-$i"',
        '[ -s "$f" ] || exit 22',
        'cat "$f"',
        '',
      ].join('\n'),
      { mode: 0o700 },
    );
    writeFileSync(join(directory, 'gh'), '#!/bin/sh\necho "gh $*" >> "$CALLS"\necho "$COMPARE"\n', { mode: 0o700 });
    writeFileSync(join(directory, 'sleep'), '#!/bin/sh\necho "sleep $*" >> "$CALLS"\n', { mode: 0o700 });
    const result = spawnSync('bash', ['-c', served!.run!], {
      encoding: 'utf8',
      env: {
        PATH: `${directory}:${process.env['PATH'] ?? ''}`,
        CALLS: calls,
        STUBS: directory,
        PAGES: String(pages.length),
        COMPARE: compare,
        GITHUB_OUTPUT: output,
        ...served!.env,
        GH_TOKEN: 'stub',
        GH_REPO: 'taucad/tau',
        HEAD_SHA: trigger,
        ATTEMPTS: '3',
      },
    });
    return {
      status: result.status,
      stdout: result.stdout,
      output: readFileSync(output, 'utf8'),
      calls: readFileSync(calls, 'utf8'),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe('staging observability served-commit check', () => {
  it('runs on deploy-triggered runs before the harness, which needs it', () => {
    expect(served?.if).toBe("steps.deploy.outputs.ready == 'true' && github.event_name == 'workflow_run'");
    const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');
    expect(served?.env?.['HEAD_SHA']).toBe(expression('github.event.workflow_run.head_sha'));
    expect(workflow.jobs.deployed.outputs?.['ready']).toBe(
      expression(
        "steps.deploy.outputs.ready == 'true' && (github.event_name == 'workflow_dispatch' || steps.served.outputs.serving == 'true')",
      ),
    );
    expect(workflow.jobs.harness.needs).toBe('deployed');
    expect(workflow.jobs.harness.if).toBe("needs.deployed.outputs.ready == 'true'");
  });

  it('lets the harness run when staging serves the triggering commit', () => {
    const { status, output, calls } = check([page(trigger.slice(0, 12))]);

    expect(status).toBe(0);
    expect(output).toBe('serving=true\n');
    expect(calls).not.toContain('gh ');
  });

  it('ends neutral, with the harness skipped, when a newer deploy replaced the trigger', () => {
    const { status, output, stdout, calls } = check([page('fedcba987654')], 'ahead');

    expect(status).toBe(0);
    expect(output).toBe('');
    expect(stdout).toContain('::notice title=Superseded::');
    expect(calls).toContain(`gh api repos/taucad/tau/compare/${trigger}...fedcba987654 --jq .status`);
    expect(calls).not.toContain('sleep');
  });

  it('waits for an older served commit to become the trigger', () => {
    const { status, output, calls } = check([page('0123456789ab'), page(trigger.slice(0, 12))]);

    expect(status).toBe(0);
    expect(output).toBe('serving=true\n');
    expect(calls.match(/^sleep 30$/gmu)).toHaveLength(1);
  });

  it.each([
    ['an older commit', [page('0123456789ab')], 'behind'],
    ['a diverged commit', [page('0123456789ab')], 'diverged'],
    ['an unreadable page', [''], 'ahead'],
    ['a page without a release', ['<html></html>'], 'ahead'],
  ])('fails after its bounded reads when staging serves %s', (_case, pages, compare) => {
    const { status, output, stdout, calls } = check(pages, compare);

    expect(status).toBe(1);
    expect(output).toBe('');
    expect(stdout).toContain('::error::');
    expect(calls.match(/^curl /gmu)).toHaveLength(3);
  });

  it('cancels an older harness for a newer deploy without letting a trigger that deployed nothing cancel one', () => {
    expect(workflow.concurrency).toBeUndefined();
    expect(workflow.jobs.harness.concurrency).toEqual({
      group: 'staging-observability-harness',
      'cancel-in-progress': true,
    });
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- end of the external names. */
