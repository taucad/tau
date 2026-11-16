import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The native and packaging workflows read the Nx remote cache with the read token and never write it
 * (CP-4): writes come only from `ci.yml` on `main` through environment `nx-cache-write`. A pull request
 * job granted `id-token: write` would trade the read token for a write session (setup-nx `nx-guard.ts`,
 * item 5), so none of these jobs has one, nor an environment. The per-host Build123d suites skip the
 * remote cache, because their task hash names no host. The shell conformance workflow scopes its cache env to the
 * macOS job of a reuse run (pinned in `shell-evidence.test.ts`).
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

type Step = { readonly name?: string; readonly run?: string };
type Job = {
  readonly environment?: unknown;
  readonly permissions?: Record<string, string> | string;
  readonly steps?: readonly Step[];
};
type Workflow = {
  readonly env?: Record<string, string>;
  readonly permissions?: Record<string, string> | string;
  readonly jobs: Record<string, Job>;
};

const readers = ['native-hosts', 'native-darwin', 'desktop-packaging'] as const;
const server = `\${{ secrets.NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN != '' && vars.NX_SELF_HOSTED_REMOTE_CACHE_SERVER || '' }}`;
const token = `\${{ secrets.NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN }}`;

const workflowText = (name: string): string => read(`.github/workflows/${name}.yml`);
const workflow = (name: string): Workflow => load(workflowText(name)) as Workflow;

describe('native cache read workflows', () => {
  it.each(readers)('should give %s the read token, set only when a token is present', (name) => {
    const env = workflow(name).env ?? {};
    expect(env['NX_SELF_HOSTED_REMOTE_CACHE_SERVER']).toBe(server);
    expect(env['NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN']).toBe(token);
  });

  it.each(readers)('should give %s no write environment and no OIDC token', (name) => {
    const text = workflowText(name);
    const document = workflow(name);
    expect(text).not.toContain('nx-cache-write');
    expect(text).not.toContain('NX_CLOUD_ACCESS_TOKEN');
    const grants = [document.permissions, ...Object.values(document.jobs).map((job) => job.permissions)];
    for (const grant of grants) {
      expect(grant).not.toBe('write-all');
      expect(typeof grant === 'object' ? grant['id-token'] : undefined).toBeUndefined();
    }
    for (const job of Object.values(document.jobs)) {
      expect(job.environment).toBeUndefined();
    }
  });

  it('should run the per-host Build123d suites without the remote cache', () => {
    const steps = Object.values(workflow('native-hosts').jobs).flatMap((job) => job.steps ?? []);
    const suites = steps.filter((step) => step.run?.includes('nx run build123d:test'));
    expect(suites.length).toBeGreaterThanOrEqual(2);
    for (const step of suites) {
      expect(step.run).toContain('--skip-remote-cache');
    }
  });

  it('should never serve a benchmark timing from the cache', () => {
    const nx = JSON.parse(read('nx.json')) as { targetDefaults: Record<string, { cache?: boolean }> };
    expect(nx.targetDefaults['benchmark-native']?.cache).not.toBe(true);
    for (const project of ['packages/plugins/build123d', 'packages/plugins/picogk']) {
      const { targets } = JSON.parse(read(`${project}/project.json`)) as {
        targets: Record<string, { cache?: boolean }>;
      };
      expect(targets['benchmark-native']).toBeDefined();
      expect(targets['benchmark-native']?.cache).not.toBe(true);
    }
  });

  it('should give the shell conformance workflow no workflow-wide cache env', () => {
    const env = workflow('shell-conformance').env ?? {};
    expect(env['NX_SELF_HOSTED_REMOTE_CACHE_SERVER']).toBeUndefined();
    expect(env['NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN']).toBeUndefined();
    expect(env['NX_NO_CLOUD']).toBe('true');
  });
});
