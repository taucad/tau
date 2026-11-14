/**
 * A6c: the session's record connections wait for its file manager's services as the scope's `whenServicesReady` did
 * on main: services already bound serve, even in `error`; without them a wait that settles in `error` refuses.
 */
import { describe, expect, it, vi } from 'vitest';
import { createActor, setup, types } from 'xstate';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { FileManagerActor } from '#runtime/file-manager-host.js';
import { openSessionFileManager } from '#runtime/session-file-manager.js';

type ProbeContext = {
  contentService: object | undefined;
  treeService: object | undefined;
  error: Error | undefined;
  openFileSystemBridge: (() => never) | undefined;
};

/** A file manager in `error`: one a failed workspace reload left with its services, or one that never had them. */
const inError = (context: ProbeContext) =>
  createActor(
    setup({ schemas: { context: types<ProbeContext>(), events: eventSchemas<{ type: 'noop' }>() } }).createMachine({
      initial: 'error',
      context,
      states: { error: {} },
    }),
  ) as unknown as FileManagerActor;

const openOver = (actor: FileManagerActor) =>
  openSessionFileManager('p', {
    build: () => ({ actor, dispose: () => undefined }),
    awaitServices: async (fileManager: FileManagerRef) => fileManager.getSnapshot(),
  });

describe("the session's record wait (A6c)", () => {
  it('should serve from services a failed reload left bound, and open the bridge', async () => {
    const opener = vi.fn((): never => {
      throw new Error('bridge opened');
    });
    const opened = openOver(
      inError({ contentService: {}, treeService: {}, error: new Error('reload failed'), openFileSystemBridge: opener }),
    );

    await expect(opened.owner.workingCopyFiles.get().exists('/projects/p/a.json')).rejects.toThrow('bridge opened');
    expect(opener).toHaveBeenCalled();
    opened.close();
  });

  it('should refuse with machine-error when the file manager is in error without its services', async () => {
    const opener = vi.fn((): never => {
      throw new Error('bridge opened');
    });
    const opened = openOver(
      inError({
        contentService: undefined,
        treeService: undefined,
        error: new Error('worker lost'),
        openFileSystemBridge: opener,
      }),
    );

    await expect(opened.owner.workingCopyFiles.get().exists('/projects/p/a.json')).rejects.toMatchObject({
      name: 'FileManagerNotReadyError',
      code: 'machine-error',
    });
    expect(opener).not.toHaveBeenCalled();
    opened.close();
  });
});
