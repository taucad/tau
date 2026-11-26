/**
 * The chat-metadata watch's membership reset (project-library fast-path blueprint FW1, Finding 5): a listing that
 * gains or loses a project refetches that project's chat queries, and leaves every other project's alone.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { QueryClient } from '@tanstack/react-query';
import { mock } from 'vitest-mock-extended';
import type { ObservationWatch } from '@taucad/fs-client/observation-service';
import type { WatchEvent } from '@taucad/filesystem';
import { createMetadataObservation, createMetadataReadOwner } from '#runtime/project-library-observations.js';
import type { LibraryObservationHost } from '#runtime/project-library-observations.js';
import type { ProjectListing } from '#runtime/project-library-storage.js';
import type { ProjectLibraryFileManager } from '#types/project-library-io.types.js';

/** A watch that is ready at once and never closes. */
const openWatch = (): ObservationWatch => ({
  ready: Promise.resolve(),
  closed: new Promise<never>(() => {
    /* Never closes. */
  }),
  dispose: () => undefined,
});

/** A listing of these projects, each last active at `activityAt`; only the ids matter to the watch. */
const listingOf = (projectIds: readonly string[], activityAt = 0): ProjectListing =>
  mock<ProjectListing>({
    projects: projectIds.map((projectId) => ({ projectId, library: { projectId, lastActivityAt: activityAt } })),
    conflicts: [],
    recoveries: [],
    workspaceBindingRepairs: [],
  });

const turns = async (count = 20): Promise<void> => {
  for (let turn = 0; turn < count; turn += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each turn lets the observation's reads run.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
});

/** The chat-metadata watch over a query client; `emit` delivers a change to its workspace watch. */
const startWatch = async (queryClient: QueryClient): Promise<Readonly<{ emit: (event: WatchEvent) => void }>> => {
  let deliver: ((event: WatchEvent) => void) | undefined;
  const fileManager = mock<ProjectLibraryFileManager>({
    workerChangeChannel: {
      watchReady: (_request, onEvent) => {
        deliver = onEvent;
        return openWatch();
      },
    },
    watchRecordFile: () => openWatch(),
  });
  const records = { chatStore: {}, readOwner: createMetadataReadOwner({}) };
  const host: LibraryObservationHost = {
    queryClient,
    fileManager: () => fileManager,
    records: () => records,
    subscribeBinding: () => () => undefined,
    subscribeInvalidate: () => () => undefined,
    passSettled: async () => undefined,
    publishMetadataHealth: () => undefined,
    clearMetadataHealth: () => undefined,
  };
  const actor = createActor(createMetadataObservation(host));
  actor.start();
  stops.push(() => {
    actor.stop();
  });
  await turns();
  return {
    emit: (event) => {
      deliver?.(event);
    },
  };
};

const invalidated = (queryClient: QueryClient, projectId: string): boolean =>
  queryClient.getQueryState(['chats', projectId])?.isInvalidated === true;

describe('chat-metadata membership', () => {
  it('should refetch the chat queries of a project the listing gains or loses, and no other', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['projects'], listingOf(['proj_x', 'proj_y']));
    for (const projectId of ['proj_x', 'proj_y', 'proj_z']) {
      queryClient.setQueryData(['chats', projectId], []);
    }
    await startWatch(queryClient);
    for (const projectId of ['proj_x', 'proj_y', 'proj_z']) {
      queryClient.setQueryData(['chats', projectId], []);
    }

    await turns();
    expect(['proj_x', 'proj_y', 'proj_z'].filter((projectId) => invalidated(queryClient, projectId))).toEqual([]);

    queryClient.setQueryData(['projects'], listingOf(['proj_y', 'proj_z']));
    await turns();

    expect(invalidated(queryClient, 'proj_x')).toBe(true);
    expect(invalidated(queryClient, 'proj_z')).toBe(true);
    expect(invalidated(queryClient, 'proj_y')).toBe(false);
  });

  it('should refetch no chat query when a new listing holds the same projects with new rows', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['projects'], listingOf(['proj_x', 'proj_y']));
    await startWatch(queryClient);
    queryClient.setQueryData(['chats', 'proj_x'], []);
    queryClient.setQueryData(['chats', 'proj_y'], []);

    await turns();
    queryClient.setQueryData(['projects'], listingOf(['proj_x', 'proj_y'], 1));
    await turns();

    expect(invalidated(queryClient, 'proj_x')).toBe(false);
    expect(invalidated(queryClient, 'proj_y')).toBe(false);
  });

  it("should refetch a replaced project directory's chat list and records, and no other project's", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['projects'], listingOf(['proj_x', 'proj_y']));
    const watch = await startWatch(queryClient);
    /* Each project's chat list and its chat records (what a chat's details and options read), all under
     * `['chats', P]`. */
    const recordsKey = (projectId: string) => ['chats', projectId, 'records', 'source', { includeDeleted: false }];
    for (const projectId of ['proj_x', 'proj_y']) {
      queryClient.setQueryData(['chats', projectId], []);
      queryClient.setQueryData(recordsKey(projectId), []);
    }
    await turns();

    watch.emit({ type: 'change', path: '/projects/proj_x' });
    await turns();

    expect(queryClient.getQueryState(recordsKey('proj_x'))?.isInvalidated).toBe(true);
    expect(invalidated(queryClient, 'proj_x')).toBe(true);
    expect(queryClient.getQueryState(recordsKey('proj_y'))?.isInvalidated).toBe(false);
    expect(invalidated(queryClient, 'proj_y')).toBe(false);
  });
});
