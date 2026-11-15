import { useEffect, useState } from 'react';
import type { LargeObjectsFacet, ProjectReadiness, RevisionStatusProjection } from '@taucad/revisions';
import { reachesReadiness } from '@taucad/revisions';
import { useProject } from '#hooks/use-project.js';
import { useRevisionClient, useRevisionStatus } from '#hooks/use-revision-status.js';
import { useTauCloudIntent } from '#hooks/use-cloud-projects.js';
import { canOpenCloudProject } from '#lib/tau-cloud-intent.js';
import { followCloudOpen } from '@taucad/ui-core/lib/cloud-open-lock';

/** First-open readiness comes from the durable gesture and the worker's acknowledged checkout. */
export type ProjectAvailability =
  | 'ready'
  | 'connecting'
  | 'downloading'
  | 'preparing'
  | 'offline'
  | 'failed'
  | 'account';

/** Never equate an empty local checkout with an authoritative missing file. */
export function projectAvailability(
  isPending: boolean,
  status: Pick<RevisionStatusProjection, 'sync' | 'remote'> | undefined,
  canOpen = true,
): ProjectAvailability {
  if (!isPending) {
    return 'ready';
  }
  if (!canOpen) {
    return 'account';
  }
  if (status?.sync.hasAppliedRemote === true) {
    return 'preparing';
  }
  if (status?.sync.online === false) {
    return 'offline';
  }
  if (status?.sync.pullPhase === 'applying') {
    return 'preparing';
  }
  if (status?.sync.pullPhase === 'fetching') {
    return 'downloading';
  }
  if (
    status?.sync.state === 'failed' ||
    status?.sync.state === 'queued' ||
    status?.sync.state === 'conflicted' ||
    status?.remote.phase === 'reconnectRequired' ||
    status?.remote.phase === 'failed'
  ) {
    return 'failed';
  }
  return 'connecting';
}

/** Shared readiness for every pane; no local timer or second synchronization store. */
export function useProjectAvailability(): ProjectAvailability {
  const { projectId } = useProject();
  const intent = useTauCloudIntent(projectId);
  return projectAvailability(intent === 'open', useRevisionStatus(), canOpenCloudProject(projectId));
}

/**
 * What a model surface waits for: the project first, then every authored file,
 * then the large objects of its own render closure (T6).
 *
 * The operator's "open the UI, model waits": code, files and chats open once
 * the checkout is written. A render waits until every authored file is a file,
 * and for a large object only when its closure (the manifest and the entry the
 * kernel opens) still holds that object's pointer; media and assets it never
 * reads arrive in the background. A kernel read of any other pending path goes
 * through to its object and waits for it (D9), never reading the pointer.
 */
export type ModelAvailability = ProjectAvailability | 'files' | 'filesFailed' | 'filesChecking';

/**
 * The paths a render reads before anything else: `tau.json` and the main entry (T6).
 *
 * @param mainEntryPath - The manifest's main entry path; empty while unknown.
 * @returns The render closure, manifest first.
 */
export function renderClosure(mainEntryPath: string): readonly string[] {
  return mainEntryPath === '' ? ['tau.json'] : ['tau.json', mainEntryPath];
}

/** What {@link modelAvailability} reads of the projection. */
export type ModelStatus = Readonly<{
  largeObjects?: Pick<LargeObjectsFacet, 'phase' | 'paths'> | undefined;
  readiness?: ProjectReadiness | undefined;
}>;

/**
 * {@link ModelAvailability} from the project's availability, its large-object
 * facet and published readiness, and the render's closure.
 *
 * A render opens at `materialized` (D10, {@link surfaceReadiness}): a project
 * whose host publishes readiness waits for it there, a check and never a
 * download (T5). From there, only a pending path in the closure holds it; a
 * failed fill is shown whatever it was fetching, so Try again stays reachable.
 *
 * @param project - The project's availability.
 * @param status - The large-object facet, and the published readiness when the host publishes one.
 * @param closure - The render closure, see {@link renderClosure}.
 * @returns What the model surface shows.
 */
export function modelAvailability(
  project: ProjectAvailability,
  status: ModelStatus | undefined,
  closure: readonly string[],
): ModelAvailability {
  if (project !== 'ready') {
    return project;
  }
  const { largeObjects, readiness } = status ?? {};
  if (readiness !== undefined && !readyFor('model', readiness)) {
    return 'filesChecking';
  }
  if (largeObjects === undefined) {
    return 'ready';
  }
  if (largeObjects.phase === 'failed') {
    return 'filesFailed';
  }
  const pending = pendingPathSet(largeObjects.paths);
  return closure.some((path) => pending.has(path)) ? 'files' : 'ready';
}

/** Shared readiness for the viewer, export and the other kernel surfaces. */
export function useModelAvailability(): ModelAvailability {
  const { mainEntryPath } = useProject();
  const project = useProjectAvailability();
  const status = useRevisionStatus();
  return modelAvailability(project, status, renderClosure(mainEntryPath));
}

/**
 * Whether one file still waits for its large object.
 *
 * Such a file holds its pointer on disk; it is shown loading and never opened
 * as text, so its pointer is never read, edited or saved as its content.
 *
 * @param path - The checkout-relative path.
 * @returns `true` until its bytes are written.
 */
export function useLargeObjectPending(path: string | undefined): boolean {
  const paths = useRevisionStatus()?.largeObjects?.paths;
  return path !== undefined && paths !== undefined && pendingPathSet(paths).has(path);
}

/**
 * {@link useLargeObjectPending} for a file someone has open: while it waits,
 * its object jumps the fill queue (D10). A file-tree row asks the other one,
 * so listing a folder never reorders the fill.
 *
 * @param path - The open file's checkout-relative path.
 * @returns `true` until its bytes are written.
 */
export function useOpenedLargeObjectPending(path: string | undefined): boolean {
  const pending = useLargeObjectPending(path);
  const client = useRevisionClient();
  useEffect(() => {
    if (pending && path !== undefined) {
      client?.send({ command: 'prioritizeLargeObjects', paths: [path] });
    }
  }, [client, pending, path]);
  return pending;
}

/* One set per published facet, shared by every file-tree row that asks of it. */
const pendingPathSets = new WeakMap<readonly string[], ReadonlySet<string>>();

/**
 * The pending paths of one facet as a set, built once per facet.
 *
 * @param paths - A facet's `paths`.
 * @returns The same paths, for constant-time lookups.
 */
export function pendingPathSet(paths: readonly string[]): ReadonlySet<string> {
  let set = pendingPathSets.get(paths);
  if (set === undefined) {
    set = new Set(paths);
    pendingPathSets.set(paths, set);
  }
  return set;
}

/** The large-object facet itself, for the one surface that draws its progress. */
export function useLargeObjects(): LargeObjectsFacet | undefined {
  return useRevisionStatus()?.largeObjects;
}

/**
 * The surfaces that wait on readiness, and the state each opens at (D10).
 *
 * The tree opens once the tree is known; the editor and viewer once the entry
 * closure is readable; search, export, the LSP workspace, a revision cut and a
 * model render need every authored file. A render then waits only on the large
 * objects of its own closure ({@link modelAvailability}, T6).
 */
export type ReadinessSurface = 'tree' | 'editor' | 'viewer' | 'search' | 'export' | 'lsp' | 'cut' | 'model';

/** {@link ReadinessSurface} to the readiness state it needs. */
export const surfaceReadiness: Readonly<Record<ReadinessSurface, ProjectReadiness>> = {
  tree: 'treeReady',
  editor: 'entryReady',
  viewer: 'entryReady',
  search: 'materialized',
  export: 'materialized',
  lsp: 'materialized',
  cut: 'materialized',
  model: 'materialized',
};

/**
 * Whether a surface may open on what the project has published.
 *
 * @param surface - The surface asking.
 * @param readiness - The published readiness; `undefined` is unknown and serves nothing (I7).
 * @returns `true` once the project has reached the state the surface needs.
 */
export function readyFor(surface: ReadinessSurface, readiness: ProjectReadiness | undefined): boolean {
  return reachesReadiness(readiness, surfaceReadiness[surface]);
}

/**
 * Readiness while a Tau Cloud project's first open is owed (S20).
 *
 * A tab whose own root has not connected yet knows nothing of the tree: what
 * it can say is what the tab holding the open announced, or `connected`. Once
 * its own root is connected, its own reading is the truth.
 *
 * @param own - This tab's projection.
 * @param followed - The last state the opener announced, if any.
 * @returns The readiness to show.
 */
export function pendingOpenReadiness(
  own: Pick<RevisionStatusProjection, 'readiness' | 'remote'> | undefined,
  followed: ProjectReadiness | undefined,
): ProjectReadiness {
  if (own?.readiness !== undefined && own.remote.kind !== 'none') {
    return own.readiness;
  }
  return followed ?? 'connected';
}

/** The selected checkout's readiness, as its host settled it; `undefined` until published. */
export function useProjectReadiness(): ProjectReadiness | undefined {
  const { projectId } = useProject();
  const pending = useTauCloudIntent(projectId) === 'open';
  const status = useRevisionStatus();
  const [followed, setFollowed] = useState<Readonly<{ projectId: string; readiness: ProjectReadiness }>>();
  useEffect(
    () =>
      pending
        ? followCloudOpen(projectId, (readiness) => {
            setFollowed({ projectId, readiness });
          })
        : undefined,
    [pending, projectId],
  );
  return pending
    ? pendingOpenReadiness(status, followed?.projectId === projectId ? followed.readiness : undefined)
    : status?.readiness;
}

/** {@link readyFor} over the published readiness. */
export function useReadyFor(surface: ReadinessSurface): boolean {
  return readyFor(surface, useProjectReadiness());
}
