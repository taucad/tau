/**
 * I8 on a disk host: an engine that cannot start is waited out for every caller, and a wait at its 5 min cap becomes
 * one `revision.unavailable` (`cause: 'engine'`) and the Sync facet's `engineUnavailable`, which clears when git starts.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RevisionPortError, createIsomorphicGitRevisionPort } from '@taucad/revisions';
import type { RevisionPort } from '@taucad/revisions';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';

import { createProjectRevisions } from '#revisions.js';
import type { HostRevisionEvent } from '#revisions.js';
import { revisionEngineMaxRetryMilliseconds } from '#revision-engine-failures.js';

const projectId = 'proj_AAAAAAAAAAAAAAAAAAAAA';
const roots: string[] = [];
const releases: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env['TAU_CONFIG_DIR'];
  await Promise.all(releases.splice(0).map(async (release) => release().catch(() => undefined)));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

type SyncFrame = Readonly<{ reason?: string; error?: string; state?: string }>;

describe('engine gate on a disk host (I8)', () => {
  it('should wait out an engine that cannot start, raise one state at the cap and clear it when git starts', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-engine-gate-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-host-engine-gate-config-'));
    roots.push(workspaceRoot, configDirectory);
    process.env['TAU_CONFIG_DIR'] = configDirectory;
    const real = createIsomorphicGitRevisionPort({
      filesystem: new NodeFsProvider(workspaceRoot),
      checkouts: { projectId, root: () => new NodeFsProvider(workspaceRoot) },
    });
    await real.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const engine = { broken: false, reached: 0 };
    /* Every verb fails to start git while `broken`, as a missing working directory or an exhausted process table does. */
    const port = Object.fromEntries(
      Object.entries(real).map(([name, value]) => [
        name,
        typeof value === 'function'
          ? async (...parameters: unknown[]): Promise<unknown> => {
              if (engine.broken) {
                engine.reached += 1;
                throw new RevisionPortError('ENGINE_UNAVAILABLE', 'Native Git could not start worktree.', {
                  cause: new Error('spawn git ENOENT'),
                });
              }
              return Reflect.apply(value as (...values: unknown[]) => unknown, real, parameters);
            }
          : value,
      ]),
    ) as RevisionPort;
    let offset = 0;
    const realNow = Date.now.bind(Date);
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
    const events: HostRevisionEvent[] = [];
    const revisions = createProjectRevisions({
      via: 'desktop',
      workspaceRoot,
      projectId,
      port,
      watchWorkspace: false,
      events: (event) => {
        events.push(event);
      },
    });
    releases.push(async () => revisions.release());
    let latest: SyncFrame | undefined;
    const watching = new AbortController();
    releases.push(async () => {
      watching.abort();
    });
    const collecting = (async (): Promise<void> => {
      try {
        for await (const event of revisions.channel.events(watching.signal)) {
          if (event.kind === 'status' && typeof event.value === 'object' && event.value !== null) {
            latest = (event.value as { sync?: SyncFrame }).sync;
          }
        }
      } catch {
        /* Aborted at the end of the row. */
      }
    })();
    releases.push(async () => collecting);
    await revisions.channel.request({ command: 'open' });
    const log = async (): Promise<unknown> => revisions.channel.request({ command: 'log' });
    await expect(log()).resolves.toBeDefined();

    engine.broken = true;
    const unavailable = (): HostRevisionEvent[] =>
      events.filter((event) => event.type === 'revision.unavailable' && event.cause === 'engine');
    for (let attempt = 1; attempt <= 7; attempt += 1) {
      expect(unavailable()).toHaveLength(0);
      // oxlint-disable-next-line no-await-in-loop -- one real attempt per wait, by definition.
      await expect(log()).rejects.toMatchObject({ code: 'ENGINE_UNAVAILABLE' });
      /* Inside the wait, a caller's retry starts nothing. */
      const { reached } = engine;
      // oxlint-disable-next-line no-await-in-loop -- the retry follows the attempt.
      await expect(log()).rejects.toMatchObject({ code: 'ENGINE_UNAVAILABLE' });
      expect(engine.reached).toBe(reached);
      offset += revisionEngineMaxRetryMilliseconds;
    }
    expect(unavailable()).toStrictEqual([
      {
        type: 'revision.unavailable',
        cause: 'engine',
        reason: 'Native Git has not started for five minutes.',
        missing: [],
      },
    ]);
    await vi.waitFor(() => {
      expect(latest).toMatchObject({ state: 'failed', reason: 'engineUnavailable' });
    });
    expect(latest?.error).toBeUndefined();
    expect(revisions.status().sync.reason).toBe('engineUnavailable');
    /* The host's reporter saw real attempts only. */
    const reported = events.filter((event) => event.type === 'revision.engine-failed');
    expect(reported.length).toBe(engine.reached);

    engine.broken = false;
    await expect(log()).resolves.toBeDefined();
    await vi.waitFor(() => {
      expect(latest?.reason).not.toBe('engineUnavailable');
    });
    expect(revisions.status().sync.reason).not.toBe('engineUnavailable');
    expect(unavailable()).toHaveLength(1);
  }, 60_000);
});
