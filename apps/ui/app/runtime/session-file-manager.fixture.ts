/**
 * A session file manager stand-in for rows that compose the real app runtime or registry without a worker (A6c).
 *
 * The session's `fileManager` child reads only the ref, its snapshot's `ready` state and its subscription, and closes
 * what it opened, so a small machine that a test moves between `starting`, `ready` and `error` stands in for the file
 * manager.
 */
import { createActor, setup, types } from 'xstate';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { SessionFileManager, SessionFilesPort } from '#runtime/session-file-manager.js';
import type { RootedContentClient } from '@taucad/fs-client/rooted-content-client';

type StandInContext = { openFileSystemBridge: undefined; error: Error | undefined };
type StandInEvent = { type: 'ready' } | { type: 'lost' } | { type: 'fail'; error: Error };

const standInMachine = setup({
  schemas: { context: types<StandInContext>(), events: eventSchemas<StandInEvent>() },
}).createMachine({
  id: 'fileManager',
  initial: 'starting',
  context: { openFileSystemBridge: undefined, error: undefined },
  states: {
    starting: {
      on: {
        ready: { target: 'ready' },
        fail: ({ event }) => ({ target: 'error', context: { error: event.error } }),
      },
    },
    ready: {
      on: {
        lost: { target: 'starting' },
        fail: ({ event }) => ({ target: 'error', context: { error: event.error } }),
      },
    },
    error: { on: { ready: { target: 'ready', context: { error: undefined } } } },
  },
});

/** One opened stand-in, with what a row reads back. @public */
export type SessionFileManagerStandIn = SessionFileManager &
  Readonly<{
    /** Move the file manager into `ready`, or back out of it. */
    setReady: (ready: boolean) => void;
    /** Move the file manager into `error`, as a dead shared worker does a nested one. */
    fail: (error: Error) => void;
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
  /* No row reads the working copy through the stand-in: an inert client keeps the port's shape. */
  const inertClient: RootedContentClient = Object.create(null) as RootedContentClient;
  const workingCopyFiles: SessionFilesPort<RootedContentClient> = {
    get: () => inertClient,
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
    fail: (error) => {
      actor.send({ type: 'fail', error });
    },
    isClosed: () => drop.signal.aborted,
  };
}
