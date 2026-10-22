import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

type Step = { id?: string; run?: string; env?: Record<string, string> };
const root = resolve(import.meta.dirname, '../..');
const workflow = load(readFileSync(join(root, '.github/workflows/deploy-ui.yml'), 'utf8')) as {
  jobs: { deploy: { steps: Step[] } };
};
const validation = workflow.jobs.deploy.steps.find((step) => step.id === 'posthog');
if (!validation?.run) {
  throw new Error('Missing PostHog credential validation step');
}

const validationScript = validation.run;
const config = readFileSync(join(root, 'apps/ui/netlify.toml'), 'utf8');
const commands = [...config.matchAll(/^command = (".*")$/gmu)].map((match) => JSON.parse(match[1]!) as string);
const uploadCommands = commands.filter((command) => command.includes('ui:sourcemaps'));

describe('UI source-map credential ownership', () => {
  it.each(['', 'sentry_fixture'])('should require the Sentry build credential without logging it', (token) => {
    const step = workflow.jobs.deploy.steps.find((candidate) => candidate.env?.['SENTRY_AUTH_TOKEN']);
    expect(step?.run).toBeDefined();
    const result = spawnSync('bash', ['-c', step!.run!], {
      encoding: 'utf8',
      env: Object.fromEntries([
        ['PATH', process.env['PATH']],
        ['SENTRY_AUTH_TOKEN', token],
      ]),
    });
    expect(result.status).toBe(token ? 0 : 1);
    expect(result.stdout + result.stderr).not.toContain('sentry_fixture');
  });

  it.each(
    (
      [
        ['production', '', '', false],
        ['production', 'phx_fixture', '', false],
        ['production', '', '123', false],
        ['production', 'phc_public', '123', false],
        ['production', 'phx_fixture\nINJECTED=value', '123', false],
        ['production', 'phx_fixture', 'abc', false],
        ['production', 'phx_fixture', '123', true],
        ['staging', 'phx_fixture', '456', true],
        ['staging', '', '', false],
        ['staging', 'phx_fixture', 'abc', false],
      ] as const
    ).map(([environment, token, projectId, enabled]) => ({ environment, token, projectId, enabled })),
  )(
    'should validate the $environment pair without exposing credentials',
    ({ environment, token, projectId, enabled }) => {
      const directory = mkdtempSync(join(tmpdir(), 'tau-posthog-'));
      try {
        const output = join(directory, 'output');
        const result = spawnSync('bash', ['-c', validationScript], {
          encoding: 'utf8',
          env: Object.fromEntries([
            ['PATH', process.env['PATH']],
            ['ENVIRONMENT', environment],
            ['TOKEN', token],
            ['ENV_ID', projectId],
            ['GITHUB_OUTPUT', output],
          ]),
        });
        expect(result.status).toBe(enabled ? 0 : 1);
        expect(readFileSync(output, 'utf8')).toBe(`enabled=${String(enabled)}\n`);
        expect(result.stdout).not.toContain('phx_fixture');
        expect(result.stdout).not.toContain('INJECTED=');
        if (!enabled) {
          expect(result.stdout).toContain('::error::');
          expect(result.stdout).toContain('Netlify credentials are not used');
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.each(
    (
      [
        ['true', 'false', '0', 0, true],
        ['true', 'false', '1', 1, true],
        ['true', 'true', '1', 0, true],
        ['false', 'true', '0', 0, false],
        ['false', 'false', '0', 1, false],
        ['', 'false', '0', 1, false],
      ] as const
    ).map(([enabled, optional, uploadExit, status, uploads]) => ({ enabled, optional, uploadExit, status, uploads })),
  )(
    'should enforce upload policy with enabled=$enabled optional=$optional exit=$uploadExit',
    ({ enabled, optional, uploadExit, status, uploads }) => {
      const directory = mkdtempSync(join(tmpdir(), 'tau-posthog-build-'));
      try {
        const calls = join(directory, 'calls');
        writeFileSync(
          join(directory, 'pnpm'),
          '#!/bin/sh\necho "$*" >> "$CALLS"\nif [ "$3" = ui:sourcemaps ]; then echo "$POSTHOG_CLI_TOKEN:$POSTHOG_CLI_ENV_ID:$SENTRY_AUTH_TOKEN" >> "$CALLS"; exit "$UPLOAD_EXIT"; fi\n',
          { mode: 0o700 },
        );
        expect(uploadCommands).toHaveLength(2);
        for (const command of uploadCommands) {
          writeFileSync(calls, '');
          const result = spawnSync('bash', ['-c', command], {
            encoding: 'utf8',
            env: Object.fromEntries([
              ['PATH', `${directory}:${process.env['PATH'] ?? ''}`],
              ['CALLS', calls],
              ['UPLOAD_EXIT', uploadExit],
              ['TAU_SOURCEMAPS_ENABLED', enabled],
              ['TAU_SOURCEMAPS_OPTIONAL', optional],
              // Simulate old Netlify copies: disabled upload must not use them.
              ['POSTHOG_CLI_TOKEN', 'phx_old_netlify'],
              ['POSTHOG_CLI_ENV_ID', '999'],
              ['TAU_POSTHOG_CLI_TOKEN', 'phx_github'],
              ['TAU_POSTHOG_CLI_ENV_ID', '123'],
              ['SENTRY_AUTH_TOKEN', 'sentry_old_netlify'],
              ['TAU_SENTRY_AUTH_TOKEN', 'sentry_github'],
            ]),
          });
          expect(result.status).toBe(status);
          const recordedCalls = readFileSync(calls, 'utf8');
          expect(recordedCalls.includes('ui:sourcemaps')).toBe(uploads);
          expect(recordedCalls).not.toContain('phx_old_netlify');
          expect(recordedCalls).not.toContain('sentry_old_netlify');
          if (uploads) {
            expect(recordedCalls).toContain('phx_github:123:sentry_github');
          }
          if (optional === 'true' && (!uploads || uploadExit !== '0')) {
            expect(result.stdout).toContain('Warning: source map upload disabled or failed');
          }
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
