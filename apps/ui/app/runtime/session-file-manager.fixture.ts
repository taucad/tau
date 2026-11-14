/**
 * A session file manager stand-in for rows that compose the real app runtime or registry without a worker (A6c).
 *
 * The session's `fileManager` child reads only the ref, its snapshot's `ready` state and its subscription, and closes
 * what it opened, so a small machine that a test moves between `starting` and `ready` stands in for the file manager.
 */
import { createActor, setup } from 'xstate';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { SessionFileManager, SessionFilesPort } from '#runtime/session-file-manager.js';
import type { RootedContentClient } from '@taucad/fs-client/rooted-content-client';

const standInMachine = setup({}).createMachine({
  id: 'fileManager',
  initial: 'starting',
  context: { openFileSystemBridge: undefined },
  states: {
    starting: { on: { ready: { target: 'ready' } } },
    ready: { on: { lost: { target: 'starting' } } },
  },
});

/** One opened stand-in, with what a row reads back. @public */
export type SessionFileManagerStandIn = SessionFileManager &
  Readonly<{
    /** Move the file manager into `ready`, or back out of it. */
    setReady: (ready: boolean) => void;
    /** Whether `close` ran. */
    isClosed: () => boolean;
  }>;

/**
 * Open a stand-in for one project.
 *
 * @param projectId - The session's project.
 * @param options - Whether it starts `ready` (the default).
 * @returns The stand-in, started.
 * @public
 */
export function openSessionFileManagerStandIn(
  projectId: string,
  { ready = true }: Readonly<{ ready?: boolean }> = {},
): SessionFileManagerStandIn {
  const actor = createActor(standInMachine).start();
  if (ready) {
    actor.send({ type: 'ready' });
  }
  const drop = new AbortController();
  const workingCopyFiles: SessionFilesPort<RootedContentClient> = {
    get: () => ({}) as RootedContentClient,
    subscribe: () => () => undefined,
  };
  return {
    key: `${projectId}:stand-in`,
    fileManagerRef: actor as unknown as FileManagerRef,
    owner: { attach: () => undefined, dropped: drop.signal, workingCopyFiles },
    close: () => {
      actor.stop();
      drop.abort();
    },
    setReady: (next) => {
      actor.send({ type: next ? 'ready' : 'lost' });
    },
    isClosed: () => drop.signal.aborted,
  };
}
