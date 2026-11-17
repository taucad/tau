import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * Pins which jobs of `release-build.yml` enter the release-manager reviewed `desktop-ota-promotion` environment
 * (approvals audit R3, operator choice 2026-11-16): only `desktop-promote`, the step that publishes the GitHub release
 * and moves the production update pointers, and only for the production channel. The Mac build and the candidate
 * mirror stay in the unreviewed `desktop`, and staging stays in `desktop-staging`.
 */
const root = resolve(import.meta.dirname, '../..');
type Job = { environment?: string | { name: string } };
const workflow = load(readFileSync(join(root, '.github/workflows/release-build.yml'), 'utf8')) as {
  jobs: Record<string, Job>;
};
const environmentName = (job: Job): string | undefined =>
  typeof job.environment === 'string' ? job.environment : job.environment?.name;

/** Resolves the one `channel == 'staging' && <staging> || <production>` form these desktop jobs use. */
const resolveChannel = (name: string, channel: 'production' | 'staging'): string => {
  const match = /^\$\{\{ needs\.resolve\.outputs\.channel == 'staging' && '([\w-]+)' \|\| '([\w-]+)' \}\}$/u.exec(name);
  if (!match) {
    throw new Error(`Unexpected desktop environment expression: ${name}`);
  }
  return channel === 'staging' ? match[1]! : match[2]!;
};

describe('release-build.yml desktop environments', () => {
  it('should run only desktop-promote in desktop-ota-promotion, for production', () => {
    const name = environmentName(workflow.jobs['desktop-promote']!)!;
    expect(resolveChannel(name, 'production')).toBe('desktop-ota-promotion');
    expect(resolveChannel(name, 'staging')).toBe('desktop-staging');
    const others = Object.entries(workflow.jobs)
      .filter(([id]) => id !== 'desktop-promote')
      .map(([, job]) => environmentName(job) ?? '');
    expect(others.filter((other) => other.includes('desktop-ota-promotion'))).toEqual([]);
  });

  it('should keep the Mac build and candidate mirror out of the reviewed environment', () => {
    for (const id of ['desktop-macos', 'desktop-mirror']) {
      const name = environmentName(workflow.jobs[id]!)!;
      expect(resolveChannel(name, 'production')).toBe('desktop');
      expect(resolveChannel(name, 'staging')).toBe('desktop-staging');
    }
  });
});
