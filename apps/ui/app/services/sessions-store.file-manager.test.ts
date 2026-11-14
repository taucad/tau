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
import { Topic } from '@taucad/events';
import { createSessionsActor, reportRegionReady } from '#services/sessions-store.js';
import type { SessionFileManagerWorker } from '#services/sessions-store.js';
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

const harness = (open: (id: string) => SessionFileManagerStandIn, worker?: SessionFileManagerWorker): Harness => {
  const opened: SessionFileManagerStandIn[] = [];
  const opener = vi.fn((id: string) => {
    const standIn = open(id);
    opened.push(standIn);
    return standIn;
  });
  const registry = createSessionsActor({
    openFileManager: opener,
    ...(worker === undefined ? {} : { fileManagerWorker: worker }),
  }).start();
  current = { registry, opened, opener };
  return current;
};

const sessionOf = (registry: Harness['registry']) => registry.getSnapshot().context.refs[projectId];

/** The host's shared worker as a row moves it: `rootFiles` connecting, replacing its worker, or losing it. */
const sharedWorkerOf = (initial: Worker | undefined) => {
  let current = initial;
  const changes = new Topic<Worker | undefined>({ name: 'test.sharedWorker' });
  const port: SessionFileManagerWorker = {
    current: () => current,
    subscribe: (listener) => changes.subscribe(listener),
  };
  return {
    port,
    set: (worker: Worker | undefined) => {
      current = worker;
      changes.emit(worker);
    },
  };
};
const workerA = { name: 'worker-a' } as unknown as Worker;
const workerB = { name: 'worker-b' } as unknown as Worker;

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

describe("the session's file manager follows the host's shared worker (A6c)", () => {
  it('should build no file manager while rootFiles holds no worker, and build it once the worker is up', () => {
    const worker = sharedWorkerOf(undefined);
    const { registry, opener, opened } = harness((id) => openSessionFileManagerStandIn(id), worker.port);
    registry.send({ type: 'open', projectId });

    expect(opener).not.toHaveBeenCalled();
    expect(sessionOf(registry)?.getSnapshot().context.fileManagerRef).toBeUndefined();

    worker.set(workerA);

    expect(opener.mock.calls).toEqual([[projectId]]);
    expect(sessionOf(registry)?.getSnapshot().context.fileManagerRef).toBe(opened[0]?.fileManagerRef);
  });

  it('should close the file manager built on a replaced worker and build a fresh one on the new worker', async () => {
    const worker = sharedWorkerOf(workerA);
    const { registry, opener, opened } = harness((id) => openSessionFileManagerStandIn(id), worker.port);
    registry.send({ type: 'open', projectId });
    reportRegionReady(projectId, 'runtime');
    await flush();
    expect(sessionOf(registry)?.getSnapshot().matches('live')).toBe(true);

    worker.set(undefined);

    expect(opened[0]?.isClosed()).toBe(true);
    expect(sessionOf(registry)?.getSnapshot().context.fileManagerRef).toBeUndefined();

    worker.set(workerB);
    await flush();

    expect(opener).toHaveBeenCalledTimes(2);
    expect(opened[1]?.isClosed()).toBe(false);
    expect(sessionOf(registry)?.getSnapshot().context.fileManagerRef).toBe(opened[1]?.fileManagerRef);
    expect(sessionOf(registry)?.getSnapshot().matches('live')).toBe(true);
  });

  it('should rebuild when the worker is swapped in one step, and close the last one with the session', async () => {
    const worker = sharedWorkerOf(workerA);
    const { registry, opened } = harness((id) => openSessionFileManagerStandIn(id), worker.port);
    registry.send({ type: 'open', projectId });

    worker.set(workerB);
    expect(opened[0]?.isClosed()).toBe(true);
    expect(sessionOf(registry)?.getSnapshot().context.fileManagerRef).toBe(opened[1]?.fileManagerRef);

    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    expect(opened[1]?.isClosed()).toBe(true);
    worker.set(workerA);
    expect(opened).toHaveLength(2);
  });
});

describe('a nested file manager that errs on a dead worker (A6c)', () => {
  it('should not fail an opening session when its file manager errs first, and go live on the rebuild', async () => {
    const worker = sharedWorkerOf(workerA);
    const { registry, opened } = harness((id) => openSessionFileManagerStandIn(id, { ready: false }), worker.port);
    registry.send({ type: 'open', projectId });
    reportRegionReady(projectId, 'runtime');
    await flush();

    /* The nested file manager sees the worker die before `rootFiles` does, then the root restarts its worker. */
    opened[0]?.fail(new Error('The file service for this project stopped.'));
    await flush();
    expect(sessionOf(registry)?.getSnapshot().matches('opening')).toBe(true);
    expect(sessionOf(registry)?.getSnapshot().context.failures).toEqual({});

    worker.set(undefined);
    worker.set(workerB);
    opened[1]?.setReady(true);
    await flush();

    expect(sessionOf(registry)?.getSnapshot().matches('live')).toBe(true);
  });
});

describe("the app runtime's registry builds each session's file manager through its host (A6c)", () => {
  it('should build no session file manager while rootFiles holds no worker, so no second worker starts', async () => {
    /* Idle file managers: `rootFiles` never connects, so it holds no worker for a session's file manager to share. */
    const runtime = createAppRuntime({ idleFileManagers: true }).start();
    const registry = selectRuntimeSessions(runtime);
    registry.send({ type: 'open', projectId });

    expect(registry.getSnapshot().context.refs[projectId]?.getSnapshot().context.fileManagerRef).toBeUndefined();

    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    expect(registry.getSnapshot().context.refs[projectId]).toBeUndefined();
    runtime.stop();
  });
});
