import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { evaluate, expression, interpolate, scalar } from '#github-expression.js';
import type { Context } from '#github-expression.js';

/* eslint-disable @typescript-eslint/naming-convention -- GitHub expression functions, contexts and repository variable names are exact external names. */

/**
 * Evaluates the publication job's real gate, matrix and environment expressions
 * for each combination of the per-channel repository variables, so that enabling
 * staging can never select a production environment.
 */
const root = resolve(import.meta.dirname, '../..');
const workflowPath = '.github/workflows/desktop-route-promotion.yml';
type Job = {
  if: string;
  strategy: { matrix: { channel: string } };
  environment: { name: string };
  env: Record<string, string>;
};
const workflow = load(readFileSync(join(root, workflowPath), 'utf8')) as {
  on: Record<string, unknown>;
  jobs: { publication: Job };
};
const job = workflow.jobs.publication;

type Gates = { staging?: string; production?: string };
type Run =
  | { event: 'schedule' }
  | { event: 'workflow_dispatch'; channel: 'staging' | 'production'; operation: 'promote-routes' | 'renew-routes' };
/** The environments the publication job would request, or none when the job is skipped. */
const environments = (run: Run, gates: Gates, ref = 'refs/heads/main'): string[] => {
  const context: Context = {
    github: { ref, event_name: run.event },
    vars: {
      DESKTOP_INSTALLER_PUBLICATION_STAGING: gates.staging ?? '',
      DESKTOP_INSTALLER_PUBLICATION_PRODUCTION: gates.production ?? '',
      // The retired repository-wide switch must not enable anything.
      DESKTOP_INSTALLER_PUBLICATION: 'true',
    },
    inputs: run.event === 'schedule' ? {} : { channel: run.channel, operation: run.operation },
  };
  if (evaluate(job.if, context) !== true) {
    return [];
  }
  const channels = evaluate(expression(job.strategy.matrix.channel), context);
  expect(Array.isArray(channels) && channels.length > 0).toBe(true);
  return (channels as string[]).map((channel) =>
    interpolate(job.environment.name, { ...context, matrix: { channel } }),
  );
};

const everyRun: Run[] = [
  { event: 'schedule' },
  ...(['staging', 'production'] as const).flatMap((channel) =>
    (['promote-routes', 'renew-routes'] as const).map(
      (operation): Run => ({
        event: 'workflow_dispatch',
        channel,
        operation,
      }),
    ),
  ),
];

describe('desktop installer publication channel gates', () => {
  // APT metadata and update descriptors no longer expire, so nothing renews them on a timer.
  it('should have no scheduled renewal', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
  });

  it('should request no environment while both channel gates are off', () => {
    for (const gates of [{}, { staging: 'false', production: 'false' }, { staging: 'yes' }]) {
      for (const run of everyRun) {
        expect(environments(run, gates)).toEqual([]);
      }
    }
  });

  it('should never select a production environment when only staging is enabled', () => {
    for (const gates of [{ staging: 'true' }, { staging: 'true', production: 'false' }]) {
      expect(environments({ event: 'schedule' }, gates)).toEqual([]);
      expect(
        environments({ event: 'workflow_dispatch', channel: 'staging', operation: 'promote-routes' }, gates),
      ).toEqual(['desktop-installers-staging']);
      expect(
        environments({ event: 'workflow_dispatch', channel: 'staging', operation: 'renew-routes' }, gates),
      ).toEqual(['desktop-installer-renewal-staging']);
      for (const run of everyRun) {
        expect(environments(run, gates).filter((name) => name.endsWith('-production'))).toEqual([]);
      }
    }
  });

  it('should scope each channel to its own gate', () => {
    expect(environments({ event: 'schedule' }, { production: 'true' })).toEqual([]);
    expect(
      environments(
        { event: 'workflow_dispatch', channel: 'staging', operation: 'promote-routes' },
        { production: 'true' },
      ),
    ).toEqual([]);
    expect(environments({ event: 'schedule' }, { staging: 'true', production: 'true' })).toEqual([]);
    expect(
      environments(
        { event: 'workflow_dispatch', channel: 'production', operation: 'promote-routes' },
        { production: 'true' },
      ),
    ).toEqual(['desktop-promotion-production']);
  });

  // Approvals audit R2: candidate signing (`desktop-installers-production`) is unreviewed, so no publication run may use it.
  it('should promote production only in the reviewed promotion environment', () => {
    const selected = everyRun.flatMap((run) => environments(run, { staging: 'true', production: 'true' }));
    expect(selected).not.toContain('desktop-installers-production');
    expect(
      environments(
        { event: 'workflow_dispatch', channel: 'production', operation: 'renew-routes' },
        { production: 'true' },
      ),
    ).toEqual(['desktop-installer-renewal-production']);
  });

  it('should run only from main', () => {
    for (const run of everyRun) {
      expect(environments(run, { staging: 'true', production: 'true' }, 'refs/heads/feature')).toEqual([]);
    }
  });

  it('should hand the scripts each channel gate and no repository-wide switch', () => {
    for (const name of ['DESKTOP_INSTALLER_PUBLICATION_STAGING', 'DESKTOP_INSTALLER_PUBLICATION_PRODUCTION']) {
      expect(job.env[name]).toBe(`\${{ vars.${name} }}`);
    }
    expect(Object.keys(job.env)).not.toContain('TAU_ENABLE_INSTALLER_PROMOTION');
    for (const name of readdirSync(join(root, '.github/workflows'))) {
      const text = readFileSync(join(root, '.github/workflows', name), 'utf8');
      expect(text, name).not.toMatch(/\bDESKTOP_INSTALLER_PUBLICATION\b(?!_)/u);
      expect(text, name).not.toContain('TAU_ENABLE_INSTALLER_PROMOTION');
    }
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- End exact external names. */

/* eslint-disable @typescript-eslint/naming-convention -- The publish step reads exact process environment keys. */
// D-H5: renewal renews every promoted lane, each from its own completed candidate and directory; promotion is one call.
describe('desktop-route-promotion.yml lane renewal', () => {
  const { steps } = workflow.jobs.publication as unknown as { steps: Array<{ name?: string; run?: string }> };
  const script = steps.find((step) => step.name === 'Publish or renew under the shared channel lock')?.run ?? '';
  const runStep = (env: Record<string, string>): string[] => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-lane-renewal-'));
    try {
      const log = join(directory, 'calls');
      writeFileSync(
        join(directory, 'pnpm'),
        `#!/usr/bin/env bash\necho "$* lane=\${TAU_PUBLICATION_LANE:-} tag=\${DESKTOP_RELEASE_TAG:-} source=\${TAU_DESKTOP_SOURCE_SHA:-} dir=\${DESKTOP_ASSETS_DIR}" >> "${log}"\n`,
        { mode: 0o755 },
      );
      execFileSync('bash', ['-c', script], {
        env: { PATH: `${directory}:${process.env['PATH'] ?? ''}`, DESKTOP_ASSETS_DIR: 'out/p', ...env },
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      return readFileSync(log, 'utf8').trim().split('\n');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };

  it('promotes once under the job environment', () => {
    expect(runStep({ TAU_ROUTE_OPERATION: 'promote-routes' })).toEqual([
      'nx run desktop:publish --args=promote-routes lane= tag= source= dir=out/p',
    ]);
  });

  it('renews each promoted lane from its own candidate and directory', () => {
    expect(
      runStep({
        TAU_ROUTE_OPERATION: 'renew-routes',
        TAU_RENEWAL_LANES: `macos:desktop@0.3.0:${'a'.repeat(40)} linux:desktop@0.4.0:${'b'.repeat(40)}`,
      }),
    ).toEqual([
      `nx run desktop:publish --args=renew-routes lane=macos tag=desktop@0.3.0 source=${'a'.repeat(40)} dir=out/p/macos`,
      `nx run desktop:publish --args=renew-routes lane=linux tag=desktop@0.4.0 source=${'b'.repeat(40)} dir=out/p/linux`,
    ]);
  });

  it('refuses a renewal with no promoted lane', () => {
    expect(() => runStep({ TAU_ROUTE_OPERATION: 'renew-routes' })).toThrow();
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- End process environment keys. */
