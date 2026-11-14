/**
 * A6c: the file manager is a session child (plan § 4 A6c; charter I5, I23; rows S17 to S19).
 *
 * The session's `fileManager` child opens the project's file manager through the opener the runtime composes, keeps
 * it for the session's life and reports the views region from its snapshot, with nothing mounted. On `main` the child
 * was a relay that waited for the React subtree to report the views region, so the opener was never called, the
 * session never went live without a mount, and nothing was closed with it: the rows below fail there.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flush } from '@taucad/xstate-testing/clock';
import { createSessionsActor, reportRegionReady } from '#services/sessions-store.js';
import { openSessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import type { SessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import { createAppRuntime, selectRuntimeSessions } from '#runtime/app-runtime.js';

vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

const projectId = 'proj_a6c_files';

type Harness = Readonly<{
  registry: ReturnType<typeof createSessionsActor>;
  opened: SessionFileManagerStandIn[];
  opener: ReturnType<typeof vi.fn<(id: string) => SessionFileManagerStandIn>>;
}>;

let current: Harness | undefined;

const harness = (open: (id: string) => SessionFileManagerStandIn): Harness => {
  const opened: SessionFileManagerStandIn[] = [];
  const opener = vi.fn((id: string) => {
    const standIn = open(id);
    opened.push(standIn);
    return standIn;
  });
  const registry = createSessionsActor({ openFileManager: opener }).start();
  current = { registry, opened, opener };
  return current;
};

const sessionOf = (registry: Harness['registry']) => registry.getSnapshot().context.refs[projectId];

afterEach(() => {
  current?.registry.stop();
  current = undefined;
});

describe('the session builds its file manager as a child (A6c)', () => {
  it('should open the project file manager through the opener as the session opens, with nothing mounted', () => {
    const { registry, opener, opened } = harness((id) => openSessionFileManagerStandIn(id, { ready: false }));

    registry.send({ type: 'open', projectId });

    expect(opener.mock.calls).toEqual([[projectId]]);
    /* Synchronously: the subtree that renders for a live project reads the file manager in its first render. */
    expect(sessionOf(registry)?.getSnapshot().context.fileManagerRef).toBe(opened[0]?.fileManagerRef);
  });

  it('I5: should go live when its file manager is ready, with no binding mounted to report it', async () => {
    const { registry, opened } = harness((id) => openSessionFileManagerStandIn(id, { ready: false }));
    registry.send({ type: 'open', projectId });
    /* The runtime region is still the subtree's report until A6d. */
    reportRegionReady(projectId, 'runtime');
    await flush();

    expect(sessionOf(registry)?.getSnapshot().matches('opening')).toBe(true);

    opened[0]?.setReady(true);
    await flush();

    expect(sessionOf(registry)?.getSnapshot().matches('live')).toBe(true);
  });

  it('I23: should close the file manager when the session closes, and open a fresh one on the next open', async () => {
    const { registry, opened, opener } = harness((id) => openSessionFileManagerStandIn(id));
    registry.send({ type: 'open', projectId });
    reportRegionReady(projectId, 'runtime');
    await flush();
    expect(sessionOf(registry)?.getSnapshot().matches('live')).toBe(true);

    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();

    expect(sessionOf(registry)).toBeUndefined();
    expect(opened[0]?.isClosed()).toBe(true);

    registry.send({ type: 'open', projectId });
    expect(opener).toHaveBeenCalledTimes(2);
    expect(opened[1]?.isClosed()).toBe(false);
    expect(sessionOf(registry)?.getSnapshot().context.fileManagerRef).toBe(opened[1]?.fileManagerRef);
  });

  it('should fail the views region with the reason when the file manager cannot be built', async () => {
    const { registry } = harness(() => {
      throw new Error('no host');
    });
    registry.send({ type: 'open', projectId });
    reportRegionReady(projectId, 'runtime');
    await flush();

    const session = sessionOf(registry);
    expect(session?.getSnapshot().context.failures).toMatchObject({ views: 'no host' });
    expect(session?.getSnapshot().context.fileManagerRef).toBeUndefined();
    expect(registry.getSnapshot().context.status[projectId]?.state).toBe('failed');
  });

  it('should report the views region again when the file manager comes back after the session opened', async () => {
    const { registry, opened } = harness((id) => openSessionFileManagerStandIn(id));
    registry.send({ type: 'open', projectId });
    reportRegionReady(projectId, 'runtime');
    await flush();
    const session = sessionOf(registry);
    session?.send({ type: 'childFailed', region: 'views', reason: 'worker lost' });
    expect(session?.getSnapshot().context.failures).toMatchObject({ views: 'worker lost' });

    opened[0]?.setReady(false);
    opened[0]?.setReady(true);
    await flush();

    expect(session?.getSnapshot().context.failures).toEqual({});
  });
});

describe("the app runtime's registry builds each session's file manager through its host (A6c)", () => {
  it('should build the file manager for /projects/<id> on Home, start it, and stop it with the session', async () => {
    /* Idle file managers: Home is never read, so the built file manager waits as `pending` and starts no worker. */
    const runtime = createAppRuntime({ idleFileManagers: true }).start();
    const registry = selectRuntimeSessions(runtime);
    registry.send({ type: 'open', projectId });

    const fileManager = registry.getSnapshot().context.refs[projectId]?.getSnapshot().context.fileManagerRef;
    expect(fileManager?.getSnapshot().context).toMatchObject({
      rootDirectory: `/projects/${projectId}`,
      projectId,
      backendType: undefined,
    });
    expect(fileManager?.getSnapshot().status).toBe('active');

    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();

    expect(registry.getSnapshot().context.refs[projectId]).toBeUndefined();
    expect(fileManager?.getSnapshot().status).toBe('stopped');
    runtime.stop();
  });
});
