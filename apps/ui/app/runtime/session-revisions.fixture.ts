/**
 * The `revisions` session child started on its own, over the real module stores, for rows that drive the revision
 * client from the page side without composing a session (A7b): `useRevisionClientLifecycle` did this from a mount
 * before the session owned it.
 */
import type { ActorRefFrom } from 'xstate';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { UnloadSequencer } from '#runtime/environment.js';
import { createSessionRevisionsPorts, sessionRevisionsCallback } from '#runtime/session-revisions.js';

/**
 * Start one project's revision-client lifecycle as its session's `revisions` child would.
 *
 * @param options - The project, its workspace and file manager, the sequencer its close cut joins (none: no cut),
 *   whether focus is on it (not by default, so it follows no checkout) and its root synchronisation.
 * @returns The stop, as the session stops its child.
 * @public
 */
export function startSessionRevisionsStandIn({
  projectId,
  workspace = '',
  fileManagerRef,
  sequencer,
  focused = false,
  syncProjectRoots = async () => undefined,
}: Readonly<{
  projectId: string;
  workspace?: string;
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
  sequencer?: UnloadSequencer;
  focused?: boolean;
  syncProjectRoots?: () => Promise<void>;
}>): () => void {
  const callback = sessionRevisionsCallback(
    createSessionRevisionsPorts({
      closeCut: { register: (cut) => sequencer?.register('session', cut) ?? (() => undefined) },
      focusedProject: { get: () => (focused ? projectId : undefined), subscribe: () => () => undefined },
      chatFacts: () => undefined,
      reportFault: (error) => {
        throw error;
      },
    }),
  );
  return callback({
    input: { projectId, workspace, fileManagerRef, syncProjectRoots },
    sendBack: () => undefined,
    receive: () => undefined,
  });
}
