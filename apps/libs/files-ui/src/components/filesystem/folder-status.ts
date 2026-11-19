import { useSelector } from '@xstate/react';
import type { RootStatus } from '@taucad/filesystem';
import { resolveStorageRootKey } from '@taucad/filesystem/storage-root-key';
import type { ActorRef, Snapshot } from 'xstate';
import type { WorkspaceDirectoryStatus } from '@taucad/ui-core/constants/workspace-directory-copy.constants';
import type { Workspace } from '#filesystem/handle-store.js';

/** The root file manager as far as root statuses go: the app's file manager actor satisfies it. */
export type RootStatusSource = ActorRef<
  Snapshot<unknown> & { readonly context: { readonly rootStatuses: readonly RootStatus[] } },
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- any event: only the snapshot is read.
  any
>;

/**
 * The storage-root key a workspace's root status is published under: `node:<path>` for a picked folder,
 * `webaccess:<workspaceId>` for a handle.
 *
 * @param workspace - The workspace row.
 * @returns Its storage-root key.
 */
export const workspaceStorageRootKey = (workspace: Workspace): string =>
  resolveStorageRootKey(
    workspace.path === undefined
      ? { backend: 'webaccess', workspaceId: workspace.workspaceId }
      : { backend: 'node', path: workspace.path },
    '',
  );

const noRootStatuses: readonly RootStatus[] = [];

/**
 * The root statuses the file service published (blueprint D1): the one source a folder row's status is read from.
 *
 * @param fileManagerRef - The root file manager, which configures every root.
 * @returns Its statuses, or none before it has configured any.
 */
export function useRootStatuses(fileManagerRef: RootStatusSource | undefined): readonly RootStatus[] {
  return useSelector(fileManagerRef, (snapshot) => snapshot?.context.rootStatuses ?? noRootStatuses);
}

/**
 * A granted folder's row status from its published root state (D2). `connected` is the root state `available`; every
 * other state, `error` included, keeps its name.
 *
 * @param root - The folder's published status.
 * @returns The row status.
 */
export function folderStatusOf(root: RootStatus): WorkspaceDirectoryStatus {
  return root.state === 'available' ? 'connected' : root.state;
}

/**
 * Why a folder in `conflict` or `error` can't be used, for the row's label. Codes only: a root status never carries a message.
 *
 * @param code - The root status code.
 * @returns The reason, or nothing when there is no code.
 */
export function conflictReasonOf(code: string | undefined): string | undefined {
  switch (code) {
    case undefined: {
      return undefined;
    }
    case 'AUTHORITY_ROOT_OVERLAP': {
      return 'it holds Tau’s own data';
    }
    default: {
      return `error ${code}`;
    }
  }
}
