/**
 * The file manager's root `onError` (app state orchestration charter D23, MC-R12; plan § 4 A1b; behaviour change B2).
 *
 * A failure no transition modelled used to stop the file manager. It is now recorded as the first fault, reported
 * once through the runtime's fault hook, and the machine keeps answering in the state it was in. Failures the machine
 * models still enter `error` through their invokes' own `onError`.
 */
import { flush } from '@taucad/xstate-testing/clock';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import type { EventObject } from 'xstate';
import { fileManagerMachine, releaseFileManagerResources } from '#machines/file-manager.machine.js';

const faults = vi.hoisted(() => ({ reported: [] as unknown[] }));

vi.mock('#runtime/app-runtime-faults.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reportAppRuntimeFault: (error: unknown) => {
    faults.reported.push(error);
  },
}));

vi.mock('#machines/file-manager.worker.js?worker', () => ({
  default: class MockWorker {
    public terminate = vi.fn();
    public postMessage = vi.fn();
    public addEventListener = vi.fn();
    public removeEventListener = vi.fn();
  },
}));

afterEach(() => {
  faults.reported.length = 0;
});

/** The machine's effect slots; each stand-in below only settles or holds, which is all `ready` needs. */
type Effects = NonNullable<NonNullable<Parameters<typeof fileManagerMachine.provide>[0]>['actors']>;

/** A file manager that reaches `ready` with stand-in effects, and whose root observer fails the given number of times. */
const readyFileManager = (observerFailures: readonly string[]) => {
  const failures = [...observerFailures];
  const machine = fileManagerMachine.provide({
    actors: {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in that only settles.
      connectWorkerActor: createAsyncLogic({ run: async () => ({}) }) as unknown as NonNullable<
        Effects['connectWorkerActor']
      >,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in that only settles.
      initializeServicesActor: createAsyncLogic({
        run: async () => ({}),
      }) as unknown as NonNullable<Effects['initializeServicesActor']>,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in that only holds.
      watchProxyClosedActor: createCallbackLogic<EventObject>(() => undefined) as unknown as NonNullable<
        Effects['watchProxyClosedActor']
      >,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in that fails as scripted.
      observeRootDirectoryActor: createCallbackLogic<EventObject>(() => {
        const failure = failures.shift();
        if (failure !== undefined) {
          throw new Error(failure);
        }
      }) as unknown as NonNullable<Effects['observeRootDirectoryActor']>,
    },
  });
  return createActor(machine, { input: { rootDirectory: '/', initialBackend: 'indexeddb' } });
};

describe('file manager root onError (B2)', () => {
  it('should keep an unmodelled failure as its first fault, report it once and keep answering', async () => {
    const files = readyFileManager(['root observer failed']).start();
    await flush();

    expect(files.getSnapshot().status).toBe('active');
    expect(files.getSnapshot().value).toBe('ready');
    expect(files.getSnapshot().context.fault).toBe('root observer failed');
    expect(faults.reported).toEqual([expect.objectContaining({ message: 'root observer failed' })]);

    /* Still answering: a reload leaves `ready` and comes back. */
    files.send({ type: 'reloadWorkspace' });
    await flush();
    expect(files.getSnapshot().value).toBe('ready');
    files.stop();
  });

  it('should keep the first of two faults and report only that one', async () => {
    const files = readyFileManager(['first failure', 'second failure']).start();
    await flush();
    files.send({ type: 'reloadWorkspace' });
    await flush();

    expect(files.getSnapshot().value).toBe('ready');
    expect(files.getSnapshot().context.fault).toBe('first failure');
    expect(faults.reported).toHaveLength(1);
    files.stop();
  });

  it('should start with no fault', () => {
    const files = readyFileManager([]);
    expect(files.getSnapshot().context.fault).toBeUndefined();
  });
});

describe('file manager resource release', () => {
  type Context = Parameters<typeof releaseFileManagerResources>[0];
  const held = (sharedWorker: boolean) => {
    const worker = { terminate: vi.fn() };
    const proxy = { dispose: vi.fn() };
    const bridgeDispose = vi.fn();
    const contentService = { dispose: vi.fn() };
    const treeService = { dispose: vi.fn() };
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the release reads these fields alone.
    const context = {
      worker,
      sharedWorker: sharedWorker ? worker : undefined,
      proxy,
      bridgeDispose,
      contentService,
      treeService,
    } as unknown as Context;
    return { context, worker, proxy, bridgeDispose, contentService, treeService };
  };

  it('should release the services, proxy and bridge, and terminate its own worker', () => {
    const files = held(false);
    releaseFileManagerResources(files.context);
    expect(files.contentService.dispose).toHaveBeenCalledOnce();
    expect(files.treeService.dispose).toHaveBeenCalledOnce();
    expect(files.proxy.dispose).toHaveBeenCalledOnce();
    expect(files.bridgeDispose).toHaveBeenCalledOnce();
    expect(files.worker.terminate).toHaveBeenCalledOnce();
  });

  it('should leave a shared worker running', () => {
    const files = held(true);
    releaseFileManagerResources(files.context);
    expect(files.proxy.dispose).toHaveBeenCalledOnce();
    expect(files.worker.terminate).not.toHaveBeenCalled();
  });
});
