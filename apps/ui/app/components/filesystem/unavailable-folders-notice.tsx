import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { listWorkspaces } from '@taucad/files-ui/filesystem/handle-store';
import type { Workspace } from '@taucad/files-ui/filesystem/handle-store';
import type { RootStatus } from '@taucad/filesystem';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';
import { useRootStatuses, workspaceStorageRootKey } from '@taucad/files-ui/components/filesystem/folder-status';

/**
 * Workspace ids already announced as unavailable, as a JSON array (blueprint D2, Specification "Notice memory"). An
 * id leaves the list when its folder is available again, so a folder lost a second time is announced again.
 */
const notifiedStorageKey = 'tau:unavailable-roots-notified';

function readNotified(): Set<string> {
  try {
    const raw = globalThis.localStorage.getItem(notifiedStorageKey);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeNotified(ids: ReadonlySet<string>): void {
  try {
    globalThis.localStorage.setItem(notifiedStorageKey, JSON.stringify([...ids]));
  } catch {
    // A profile that cannot store the list announces again next launch; nothing else depends on it.
  }
}

type Announcement = { readonly workspace: Workspace; readonly state: RootStatus['state'] };

/**
 * Reconcile the published root statuses with the announced list: return the folders that became unavailable since
 * they were last announced, and forget the ones that are available again or no longer exist.
 *
 * @param workspaces - Every workspace row.
 * @param roots - The published root statuses.
 * @returns The folders to announce now.
 */
function takeNewlyUnavailable(workspaces: readonly Workspace[], roots: readonly RootStatus[]): Announcement[] {
  const byKey = new Map(roots.map((root) => [root.storageRootKey, root] as const));
  const notified = readNotified();
  const next = new Set([...notified].filter((id) => workspaces.some((workspace) => workspace.workspaceId === id)));
  const fresh: Announcement[] = [];
  for (const workspace of workspaces) {
    const root = byKey.get(workspaceStorageRootKey(workspace));
    if (root === undefined) {
      continue;
    }
    if (root.state === 'available') {
      next.delete(workspace.workspaceId);
    } else if (!next.has(workspace.workspaceId)) {
      next.add(workspace.workspaceId);
      fresh.push({ workspace, state: root.state });
    }
  }
  if (next.size !== notified.size || [...next].some((id) => !notified.has(id))) {
    writeNotified(next);
  }
  return fresh;
}

/**
 * Home's notice for a folder that newly became unavailable (D2): one line for each, linking to Files, where the
 * folder can be tried again or removed. It shows once for each loss and does not repeat on later launches, so a list
 * of long-lost folders does not nag. Tau never removes a folder by itself.
 *
 * @returns The notices, or nothing.
 */
export function UnavailableFoldersNotice(): React.JSX.Element | undefined {
  const fileManager = useOptionalFileManager();
  const roots = useRootStatuses(fileManager?.fileManagerRef);
  const [announced, setAnnounced] = useState<readonly Announcement[]>([]);

  useEffect(() => {
    if (roots.length === 0) {
      return;
    }
    const run = { isCurrent: true };
    // async-iife: bootstrap -- an effect cannot await the workspace read.
    void (async () => {
      let workspaces: Workspace[];
      try {
        workspaces = await listWorkspaces();
      } catch {
        return;
      }
      if (!run.isCurrent) {
        return;
      }
      const fresh = takeNewlyUnavailable(workspaces, roots);
      if (fresh.length > 0) {
        setAnnounced((current) => [
          ...current.filter(
            (entry) => !fresh.some((added) => added.workspace.workspaceId === entry.workspace.workspaceId),
          ),
          ...fresh,
        ]);
      }
    })();
    return () => {
      run.isCurrent = false;
    };
  }, [roots]);

  if (announced.length === 0) {
    return undefined;
  }
  return (
    <div className='flex flex-col gap-2 px-4 pt-4 md:px-6'>
      {announced.map(({ workspace, state }) => (
        <div
          key={workspace.workspaceId}
          role='status'
          className='flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm'
        >
          <AlertTriangle aria-hidden className='size-4 shrink-0 text-warning' />
          <span className='min-w-0 flex-1'>
            {state === 'notFound' ? `${workspace.name} can’t be found` : `${workspace.name} isn’t available`}
          </span>
          <Link to='/files' className='font-medium underline'>
            Open Files
          </Link>
        </div>
      ))}
    </div>
  );
}
