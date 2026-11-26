/**
 * The chat-metadata watch's membership reset (project-library fast-path blueprint FW1, Finding 5): a listing that
 * gains or loses a project refetches that project's chat queries, and leaves every other project's alone.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { QueryClient } from '@tanstack/react-query';
import type { ObservationWatch } from '@taucad/fs-client/observation-service';
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
  ({
    projects: projectIds.map((projectId) => ({ projectId, library: { projectId, lastActivityAt: activityAt } })),
    conflicts: [],
    recoveries: [],
    workspaceBindingRepairs: [],
  }) as unknown as ProjectListing;

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

/** The chat-metadata watch over a query client, with no change ever delivered. */
const startWatch = async (queryClient: QueryClient): Promise<void> => {
  const fileManager = {
    workerChangeChannel: { watchReady: () => openWatch() },
    watchRecordFile: () => openWatch(),
  } as unknown as ProjectLibraryFileManager;
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
});
