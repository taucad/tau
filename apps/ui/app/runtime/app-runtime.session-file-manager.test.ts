/**
 * A6c: the app runtime wires each session's file manager to its host (plan § 4 A6c; charter I5).
 *
 * The registry falls back to no file manager when it is composed without an opener, and a session then goes live
 * with nothing for its provider to render. These rows compose the real runtime and read the session's file manager,
 * so dropping the opener or the shared-worker port from the runtime's registry fails them.
 */
import { flush } from '@taucad/xstate-testing/clock';
import { Topic } from '@taucad/events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppRuntime, selectRuntimeSessions } from '#runtime/app-runtime.js';
import type * as FileManagerHostModule from '#runtime/file-manager-host.js';
import { sessionFileManagerOf } from '#runtime/session-file-manager.js';
import type * as SessionFileManagerModule from '#runtime/session-file-manager.js';
import type { SessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import { reportRegionReady } from '#services/sessions-store.js';

const world = vi.hoisted(() => ({
  worker: undefined as Worker | undefined,
  /** Set once the mocked host is built: tells the host's listeners that the worker changed. */
  setWorker: (_worker: Worker | undefined): void => undefined,
  opened: [] as SessionFileManagerStandIn[],
}));

vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));
/* jsdom has no worker: the host reports one a row moves, and its listeners hear each change. */
vi.mock('#runtime/file-manager-host.js', async (importOriginal) => {
  const actual = await importOriginal<typeof FileManagerHostModule>();
  return {
    ...actual,
    createFileManagerHost: (...args: Parameters<typeof actual.createFileManagerHost>) => {
      const changes = new Topic<Worker | undefined>({ name: 'test.sharedWorker' });
      world.setWorker = (worker) => {
        world.worker = worker;
        changes.emit(worker);
      };
      return {
        ...actual.createFileManagerHost(...args),
        sharedWorker: () => world.worker,
        onSharedWorker: (listener: (worker: Worker | undefined) => void) => changes.subscribe(listener),
      };
    },
  };
});
/* A ready stand-in for the built file manager: the rows read the wiring, not a worker's file service. */
vi.mock('#runtime/session-file-manager.js', async (importOriginal) => {
  const { openSessionFileManagerStandIn } = await import('#runtime/session-file-manager.fixture.js');
  return {
    ...(await importOriginal<typeof SessionFileManagerModule>()),
    openSessionFileManager: (projectId: string) => {
      const standIn = openSessionFileManagerStandIn(projectId);
      world.opened.push(standIn);
      return standIn;
    },
  };
});

const projectId = 'proj_a6c_runtime';
const inertWorker = (name: string) => ({ name, postMessage: () => undefined }) as unknown as Worker;

afterEach(() => {
  world.worker = undefined;
  world.opened.length = 0;
});

describe("the app runtime's sessions build their file managers through its host (A6c)", () => {
  it("should give a session the file manager its child opened on the host's worker, and rebuild it on a new worker", async () => {
    const runtime = createAppRuntime({ idleFileManagers: true }).start();
    world.setWorker(inertWorker('a'));
    const registry = selectRuntimeSessions(runtime);
    const fileManagerOf = () => registry.getSnapshot().context.refs[projectId]?.getSnapshot().context.fileManagerRef;

    registry.send({ type: 'open', projectId });
    reportRegionReady(projectId, 'runtime');
    await flush();

    expect(world.opened).toHaveLength(1);
    expect(fileManagerOf()).toBe(world.opened[0]?.fileManagerRef);
    expect(sessionFileManagerOf(world.opened[0]!.fileManagerRef)).toBe(world.opened[0]);
    expect(registry.getSnapshot().context.refs[projectId]?.getSnapshot().matches('live')).toBe(true);

    world.setWorker(inertWorker('b'));

    expect(world.opened[0]?.isClosed()).toBe(true);
    expect(sessionFileManagerOf(world.opened[0]!.fileManagerRef)).toBeUndefined();
    expect(fileManagerOf()).toBe(world.opened[1]?.fileManagerRef);

    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    expect(world.opened[1]?.isClosed()).toBe(true);
    runtime.stop();
  });
});
