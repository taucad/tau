import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/naming-convention -- GitHub workflow keys and environment variable names are exact external names. */

/**
 * Runs the candidate selector of `release-desktop-staging.yml` against a stubbed `gh`, `git` and `pnpm`, so the
 * projects that make a commit a staging desktop candidate are pinned by behaviour, not only by text. `desktop`
 * consumes `ui:build:desktop` as a build artifact rather than through a project-graph edge, so the selector must
 * cut a candidate when either project is affected.
 */
const root = resolve(import.meta.dirname, '../..');
type Step = { name?: string; id?: string; run?: string; env?: Record<string, string> };
const workflow = load(readFileSync(join(root, '.github/workflows/release-desktop-staging.yml'), 'utf8')) as {
  jobs: { prerelease: { steps: Step[] } };
};
const selector = workflow.jobs.prerelease.steps.find((step) => step.id === 'selected');

const base = 'b'.repeat(40);
const target = 't'.repeat(40);

const select = (affected: string, options: { baseSha?: string } = {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-staging-selector-'));
  try {
    const output = join(directory, 'output');
    const calls = join(directory, 'calls');
    writeFileSync(output, '');
    writeFileSync(calls, '');
    writeFileSync(
      join(directory, 'gh'),
      '#!/bin/sh\necho "gh $*" >> "$CALLS"\necho desktop-staging@1.2.3-staging.4\n',
      {
        mode: 0o700,
      },
    );
    writeFileSync(
      join(directory, 'git'),
      '#!/bin/sh\necho "git $*" >> "$CALLS"\nif [ "$1" = rev-parse ]; then echo "$BASE_SHA"; fi\nexit 0\n',
      { mode: 0o700 },
    );
    writeFileSync(
      join(directory, 'pnpm'),
      '#!/bin/sh\necho "pnpm $*" >> "$CALLS"\necho "NX   Daemon is not running"\nprintf "%s\\n" "$AFFECTED"\n',
      { mode: 0o700 },
    );
    const result = spawnSync('bash', ['-c', selector!.run!], {
      encoding: 'utf8',
      env: {
        PATH: `${directory}:${process.env['PATH'] ?? ''}`,
        CALLS: calls,
        AFFECTED: affected,
        BASE_SHA: options.baseSha ?? base,
        RUNNER_TEMP: directory,
        GITHUB_OUTPUT: output,
        GH_REPO: 'taucad/tau',
        TARGET: target,
        EVENT: 'workflow_run',
        DISPATCH_INTEL: '',
        DISPATCH_NOTARIZE: '',
      },
    });
    const outputs = Object.fromEntries(
      readFileSync(output, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('=') as [string, string]),
    );
    return { status: result.status, outputs, calls: readFileSync(calls, 'utf8') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe('staging desktop candidate selector', () => {
  it('selects on the affected list with exactly the desktop-or-renderer expression', () => {
    expect(selector?.run).toBeDefined();
    const expressions = [...selector!.run!.matchAll(/jq -e '([^']+)' "\$RUNNER_TEMP\/affected\.json"/gu)].map(
      ([, expression]) => expression,
    );

    expect(expressions).toEqual(['type == "array" and all(.[]; type == "string")', 'index("desktop") or index("ui")']);
  });

  it.each([
    ['desktop alone', ['desktop'], 'true'],
    ['the renderer alone', ['ui'], 'true'],
    ['both among others', ['api', 'ui', 'desktop'], 'true'],
    ['neither', ['api', 'docs'], 'false'],
    ['only projects whose names merely contain them', ['desktop-e2e', 'desktop-quick-look', 'ui-e2e'], 'false'],
    ['nothing', [], 'false'],
  ])('decides for %s (%j): release=%s', (_case, affected, release) => {
    const { status, outputs, calls } = select(JSON.stringify(affected));

    expect(status).toBe(0);
    expect(outputs).toEqual({ intel: 'false', notarize: 'false', release });
    expect(calls).toContain(`pnpm nx show projects --affected --base=${base} --head=${target} --json`);
  });

  it('fails rather than count unreadable Nx output as unaffected', () => {
    const { status, outputs } = select('Nx crashed');

    expect(status).not.toBe(0);
    expect(outputs['release']).toBeUndefined();
  });

  it('skips the target that is already the newest candidate without asking Nx', () => {
    const { status, outputs, calls } = select(JSON.stringify(['desktop']), { baseSha: target });

    expect(status).toBe(0);
    expect(outputs['release']).toBe('false');
    expect(calls).not.toContain('pnpm');
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- end of the external names. */
