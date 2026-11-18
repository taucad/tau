import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { LargeObjectsFacet, ProjectReadiness, RevisionStatusProjection } from '@taucad/revisions';
import { reachesReadiness } from '@taucad/revisions';
import { useSelector } from '@xstate/react';
import { useProject } from '#hooks/use-project.js';
import { useSessions } from '#hooks/use-sessions.js';
import { useRevisionClient, useRevisionStatus } from '#hooks/use-revision-status.js';
import type { RevisionClient } from '@taucad/revisions-ui/types/revision-client.types';
import { useTauCloudIntent } from '#hooks/use-cloud-projects.js';
import { canOpenCloudProject } from '#lib/tau-cloud-intent.js';
import { followCloudOpen } from '@taucad/ui-core/lib/cloud-open-lock';
import { closureHasPending, kernelClosure } from '@taucad/ui-core/lib/large-object-guard';
import type { KernelClosure } from '@taucad/ui-core/lib/large-object-guard';
import { useReconciledManifest } from '#lib/manifest-reconciliation.js';

/** First-open readiness comes from the durable gesture and the worker's acknowledged checkout. */
export type ProjectAvailability =
  | 'ready'
  | 'connecting'
  | 'downloading'
  | 'preparing'
  | 'offline'
  | 'failed'
  | 'account';

/**
 * A first view that opens on readiness rather than the whole apply (STO-25): the surface asking, and the readiness the
 * project has published for the open.
 */
export type FirstView = Readonly<{ surface: ReadinessSurface; readiness: ProjectReadiness | undefined }>;

/**
 * Whether a first view may open while a Tau Cloud open is still owed.
 *
 * It opens at its surface's readiness (D10), and never before the entry closure has landed: by then the tree write has
 * announced every entry, so a listing shows each one it has yet to land as arriving, never missing (I7), and the
 * project's `tau.json` is readable.
 *
 * @param view - The surface and the open's readiness.
 * @param status - The revision client's projection: a chat view's records.
 * @returns `true` once the surface may open.
 */
const firstViewOpens = (view: FirstView, status: Pick<RevisionStatusProjection, 'sync'> | undefined): boolean =>
  readyFor(view.surface, view.readiness) &&
  reachesReadiness(view.readiness, 'entryReady') &&
  /* Chats open on their own records too (SP2h), never on a partial history (I7). */
  (view.surface !== 'chats' || chatsLanded(status));

/**
 * Whether the chats' records have all landed: projected, or chat sync is off and none is coming.
 *
 * @param status - The revision client's projection.
 * @returns `true` once no chat history is still arriving.
 */
export const chatsLanded = (status: Pick<RevisionStatusProjection, 'sync'> | undefined): boolean =>
  status?.sync.chats === 'ready' || status?.sync.chats === 'disabled';

/**
 * Whether the open's pull failed, was abandoned, conflicted, or its remote needs reconnecting.
 *
 * @param status - The revision client's projection.
 * @returns `true` when the open cannot go on by itself.
 */
export const isFailedOpen = (status: Pick<RevisionStatusProjection, 'sync' | 'remote'> | undefined): boolean =>
  status?.sync.state === 'failed' ||
  status?.sync.state === 'queued' ||
  status?.sync.state === 'conflicted' ||
  status?.remote.phase === 'reconnectRequired' ||
  status?.remote.phase === 'failed';

/**
 * Never equate an empty local checkout with an authoritative missing file.
 *
 * @param isPending - Whether a Tau Cloud open is still owed for the project.
 * @param status - The revision client's projection.
 * @param options - `canOpen` (default `true`), whether this account may open the project; and `firstView`, a surface
 *   that opens on readiness and the open's readiness, without which the surface waits for the whole apply and the
 *   manifest that follows it.
 * @returns What the surface shows.
 */
export function projectAvailability(
  isPending: boolean,
  status: Pick<RevisionStatusProjection, 'sync' | 'remote'> | undefined,
  options: Readonly<{ canOpen?: boolean; firstView?: FirstView | undefined }> = {},
): ProjectAvailability {
  const { canOpen = true, firstView } = options;
  if (!isPending) {
    return 'ready';
  }
  if (!canOpen) {
    return 'account';
  }
  const failed = isFailedOpen(status);
  const applied = status?.sync.hasAppliedRemote === true;
  /*
   * A failed or abandoned apply left a partial tree whose readiness stays where it got to (I7): the failure speaks,
   * and so does the retry that follows until its own write announces the next tree. Only a write running now, or one
   * that landed, has a tree whose arriving rows the listing shows.
   */
  const hasTree = !failed && (status?.sync.pullPhase === 'applying' || applied);
  if (firstView !== undefined && hasTree && firstViewOpens(firstView, status)) {
    return 'ready';
  }
  if (applied) {
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
  return failed ? 'failed' : 'connecting';
}

/**
 * Whether a project's chats may open and a new one be made (SP2h): their records have landed and, while a Tau Cloud
 * open is owed, the chats surface may open on this tab's own readiness. Read outside React by the focused chat's
 * ensure and the session's retry of a deferred one, so both decide as the chat pane does.
 *
 * @param status - The revision client's projection.
 * @param isPending - Whether a Tau Cloud open is still owed for the project.
 * @param canOpen - Whether this account may open the project.
 * @returns `true` once the chats may open.
 */
export function chatsOpen(
  status: Pick<RevisionStatusProjection, 'sync' | 'remote' | 'readiness'> | undefined,
  isPending: boolean,
  canOpen = true,
): boolean {
  return (
    chatsLanded(status) &&
    projectAvailability(isPending, status, {
      canOpen,
      firstView: { surface: 'chats', readiness: ownOpenReadiness(status) },
    }) === 'ready'
  );
}

/**
 * Shared readiness for every pane; no local timer or second synchronization store.
 *
 * @param surface - A first view (the tree, the editor, a file viewer) opens on its readiness during a Tau Cloud open
 *   (STO-25); a pane that names none waits for the whole apply.
 * @returns What the pane shows.
 */
export function useProjectAvailability(surface?: ReadinessSurface): ProjectAvailability {
  const { projectId } = useProject();
  const intent = useTauCloudIntent(projectId);
  const status = useRevisionStatus();
  return projectAvailability(intent === 'open', status, {
    canOpen: canOpenCloudProject(projectId),
    /* This tab's own reading only: a followed one speaks for the opener's tree write, which this tab's listing does
       not know, so its arriving rows would be missing here (I7). */
    firstView: surface === undefined ? undefined : { surface, readiness: ownOpenReadiness(status) },
  });
}

/** What a file pane shows: its project's availability, or `waiting` while the open has yet to land its own file. */
export type FilePaneAvailability = ProjectAvailability | 'waiting';

/**
 * What one file pane shows while a Tau Cloud open may still be owed (STO-25, I7).
 *
 * The entry closure's own pane opens on the open's first view, `entryReady`. Any other file may hold the previous
 * revision's bytes, or be absent, until the open's write lands it (D9: an unlanded path is what is on disk), so its
 * pane opens once every authored file has landed, or, from that same first view on, once this tab's own write has
 * landed that very file ({@link usePathLanded}); until then it waits on its own file alone. A failed open and an
 * account that may not open the project speak as the project does, whatever has landed.
 *
 * @param input - Whether the file is in the entry closure; the project's availability for the editor's first view and
 *   for an absence (every authored file); and whether this tab's write has landed the file.
 * @returns What the pane shows.
 */
export function filePaneAvailability(
  input: Readonly<{
    inClosure: boolean;
    firstView: ProjectAvailability;
    absence: ProjectAvailability;
    landed: boolean;
  }>,
): FilePaneAvailability {
  const { inClosure, firstView, absence, landed } = input;
  if (inClosure) {
    return firstView;
  }
  if (absence === 'ready') {
    return 'ready';
  }
  if (firstView !== 'ready') {
    return absence;
  }
  return landed ? 'ready' : 'waiting';
}

/**
 * {@link filePaneAvailability} for one open file pane: while it waits on its own file it asks this tab's revision host
 * to say when the open's write lands it.
 *
 * @param path - The pane's checkout-relative path.
 * @param inClosure - Whether the path is in the entry closure.
 * @returns What the pane shows.
 */
export function useFilePaneAvailability(path: string, inClosure: boolean): FilePaneAvailability {
  const absence = useProjectAvailability('absence');
  const firstView = useProjectAvailability('editor');
  const asks = !inClosure && absence !== 'ready' && firstView === 'ready';
  const landed = usePathLanded(asks ? path : undefined);
  return filePaneAvailability({ inClosure, firstView, absence, landed });
}

/**
 * Whether a Tau Cloud open is still owed for the focused project: what a pane read before it opened may be bytes the
 * open has since replaced (I7).
 *
 * @returns `true` while the open is owed.
 */
export function useCloudOpenPending(): boolean {
  const { projectId } = useProject();
  return useTauCloudIntent(projectId) === 'open';
}

/* One watcher id per pane, unique in this tab whatever React root it renders in. */
let landingWatchers = 0;

/**
 * One pane's landing watch, held by the revision client's own subscription rather than a React effect: it is said to
 * the host while the client is connected, said again to a host the client reconnects to (whose status is absent until
 * its first), and withdrawn when the last listener goes.
 *
 * @param watch - The project's revision client, the pane's watcher id and the checkout-relative path to watch.
 * @param watch.client - The project's revision client.
 * @param watch.watcher - The pane's watcher id.
 * @param watch.path - The checkout-relative path to watch.
 * @param onChange - Called on every status the client publishes.
 * @returns Withdraws the watch and stops listening.
 */
function watchPathLanding(
  { client, watcher, path }: Readonly<{ client: RevisionClient; watcher: string; path: string }>,
  onChange: () => void,
): () => void {
  let said = false;
  const say = (): void => {
    const connected = client.status() !== undefined;
    if (connected && !said) {
      client.send({ command: 'watchLanding', watcher, paths: [path] });
    }
    said = connected;
  };
  say();
  const stop = client.subscribe(() => {
    say();
    onChange();
  });
  return () => {
    stop();
    if (said) {
      client.send({ command: 'watchLanding', watcher, paths: [] });
    }
  };
}

/**
 * Whether this tab's own Tau Cloud open has landed one path for good (STO-25): the revision host is asked to watch it
 * while a path is given, and its projection names it once the open's write has landed it (`landedPaths`). Absent is
 * unknown, never landed (I7).
 *
 * @param path - The checkout-relative path to watch; `undefined` watches nothing.
 * @returns `true` once the write has landed it.
 */
export function usePathLanded(path: string | undefined): boolean {
  const client = useRevisionClient();
  const [watcher] = useState(() => {
    landingWatchers += 1;
    return `pane-${String(landingWatchers)}`;
  });
  const watch = useCallback(
    (onChange: () => void) =>
      client === undefined || path === undefined
        ? (): void => undefined
        : watchPathLanding({ client, watcher, path }, onChange),
    [client, path, watcher],
  );
  const landed = useCallback(() => {
    const paths = client?.status()?.landedPaths;
    return path !== undefined && paths !== undefined && pendingPathSet(paths).has(path);
  }, [client, path]);
  return useSyncExternalStore(watch, landed, () => false);
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
 * through to its object and waits for it (D9), never reading the pointer, and
 * a kernel that mirrors the whole workspace lists such a path at its object's
 * size, so it waits in the same reads.
 */
export type ModelAvailability = ProjectAvailability | 'files' | 'filesFailed' | 'filesChecking';

/** What {@link modelAvailability} reads of the projection. */
export type ModelStatus = Readonly<{
  largeObjects?: Pick<LargeObjectsFacet, 'phase' | 'paths'> | undefined;
  readiness?: ProjectReadiness | undefined;
  /** The render opened on a Tau Cloud open's first view ({@link modelFirstViewOpens}). */
  firstView?: boolean | undefined;
}>;

/**
 * The model surfaces: the viewer and what draws from its render (Parameters, the model panel, kinematics) render from
 * a Tau Cloud open's first view; export and print need every authored file (D10).
 */
export type ModelSurface = 'viewer' | 'export';

/**
 * {@link ModelAvailability} from the project's availability, its large-object
 * facet and published readiness, and the render's closure.
 *
 * A render opens at `materialized` (D10, {@link surfaceReadiness}): a project
 * whose host publishes readiness waits for it there, a check and never a
 * download (T5). A render that opened on a Tau Cloud open's first view
 * (`firstView`, see {@link modelFirstViewOpens}) opens from `entryReady`: every
 * read of a path the open's write has yet to land waits for it (D10, Rule 33).
 * From there, only a pending path in the closure holds it; a failed fill is
 * shown whatever it was fetching, so Try again stays reachable.
 *
 * @param project - The project's availability.
 * @param status - The large-object facet, the published readiness when the host publishes one, and `firstView` when
 *   the render opened on the open's first view.
 * @param closure - The render closure, see {@link kernelClosure}.
 * @returns What the model surface shows.
 */
export function modelAvailability(
  project: ProjectAvailability,
  status: ModelStatus | undefined,
  closure: KernelClosure,
): ModelAvailability {
  if (project !== 'ready') {
    return project;
  }
  const { largeObjects, readiness, firstView } = status ?? {};
  if (readiness !== undefined && !readyFor(firstView === true ? 'viewer' : 'model', readiness)) {
    return 'filesChecking';
  }
  if (largeObjects === undefined) {
    return 'ready';
  }
  if (largeObjects.phase === 'failed') {
    return 'filesFailed';
  }
  return closureHasPending(closure, largeObjects.paths) ? 'files' : 'ready';
}

/**
 * The render closure of every entry the project's views run (T6): the main entry and each other viewed entry, each
 * with the manifest ({@link kernelClosure}).
 *
 * @param mainEntryPath - The main entry; empty while the project names none.
 * @param viewEntryPaths - The entries the views and geometry units run.
 * @returns Their combined closure.
 */
export function projectRenderClosure(mainEntryPath: string, viewEntryPaths: Iterable<string>): readonly string[] {
  return [...new Set([mainEntryPath, ...viewEntryPaths].flatMap((path) => kernelClosure(path)))];
}

/**
 * Whether a project's file check has settled, as its session reports it (A14; U13, U20): its revision client has
 * published a status, and the model is not checking its files. Until then the session is `pending` and focus's open
 * waits, up to its bound, so the viewer is not shown and then withdrawn for the check that follows.
 *
 * A Tau Cloud open that is still owed is not a file check: its project placeholder speaks, as it does today.
 *
 * @param status - The revision client's published status, `undefined` until its first.
 * @param isCloudOpenPending - Whether a Tau Cloud open is still owed for the project (its intent is `open`).
 * @returns `true` once the check has settled.
 */
export function isFileCheckSettled(status: RevisionStatusProjection | undefined, isCloudOpenPending: boolean): boolean {
  /* Checked first: before its first status the open's placeholder ("Connecting to Tau Cloud") speaks, as on main. */
  if (isCloudOpenPending) {
    return true;
  }
  if (status === undefined) {
    return false;
  }
  /* Only the readiness decides `filesChecking`, as {@link modelAvailability} reads it: no closure is asked. */
  return status.readiness === undefined || readyFor('model', status.readiness);
}

/**
 * Whether the focused project's file check has outlasted its patience, as its session reports it (A14): the
 * "Preparing model" view then offers "Try again".
 */
export function useFileCheckSlow(): boolean {
  const { projectId } = useProject();
  return useSelector(useSessions(), (state) => state.context.status[projectId]?.availability === 'slow');
}

/**
 * Whether a model surface opens on a Tau Cloud open's first view, before the whole apply and the intent (STO-25).
 *
 * It opens once its first view does (the entry closure has landed, the write is running or landed and has not failed,
 * the account may open the project) and only while the project's loaded manifest is the `tau.json` that write landed:
 * the host names those bytes (`entryManifest`) and the manifest observation names the bytes the loaded manifest was
 * found equal to. Until both name the same bytes the project may still hold the open's placeholder manifest, whose
 * main entry the tree need not hold (I7). Every other file the render reads waits for the write to land it (Rule 33).
 *
 * @param input - The surface, the project's whole and first-view availability, the projection, and the digest of the
 *   manifest the project holds.
 * @returns `true` when the surface opens now.
 */
export function modelFirstViewOpens(
  input: Readonly<{
    surface: ModelSurface;
    project: ProjectAvailability;
    firstView: ProjectAvailability;
    status: Pick<RevisionStatusProjection, 'entryManifest'> | undefined;
    reconciled: string | undefined;
  }>,
): boolean {
  const { surface, project, firstView, status, reconciled } = input;
  return (
    surface === 'viewer' &&
    project !== 'ready' &&
    firstView === 'ready' &&
    status?.entryManifest !== undefined &&
    status.entryManifest === reconciled
  );
}

/**
 * Shared readiness for the viewer, export and the other kernel surfaces.
 *
 * @param surface - `viewer` (the default) renders from a Tau Cloud open's first view once its manifest is the landed
 *   one ({@link modelFirstViewOpens}); `export` waits for the whole apply.
 * @returns What the model surface shows.
 */
export function useModelAvailability(surface: ModelSurface = 'viewer'): ModelAvailability {
  const { projectId, mainEntryPath, viewRecords, geometryUnits } = useProject();
  const project = useProjectAvailability();
  const firstView = useProjectAvailability('viewer');
  const status = useRevisionStatus();
  const reconciled = useReconciledManifest(projectId);
  const opensEarly = modelFirstViewOpens({ surface, project, firstView, status, reconciled });
  const viewEntryPaths = [
    ...[...viewRecords.values()].map(({ entryPath }) => entryPath),
    ...geometryUnits.keys(),
  ].filter((path): path is string => typeof path === 'string' && path !== '');
  return modelAvailability(
    opensEarly ? 'ready' : project,
    opensEarly ? { largeObjects: status?.largeObjects, readiness: status?.readiness, firstView: true } : status,
    projectRenderClosure(mainEntryPath, viewEntryPaths),
  );
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
 * The tree opens once the tree is known; the editor, viewer and chats once the
 * entry closure is readable (chats once their records land too); search, export, the LSP workspace, a revision cut and a
 * model render need every authored file. A render then waits only on the large
 * objects of its own closure ({@link modelAvailability}, T6).
 */
export type ReadinessSurface =
  | 'tree'
  | 'absence'
  | 'editor'
  | 'viewer'
  | 'chats'
  | 'search'
  | 'export'
  | 'lsp'
  | 'cut'
  | 'model';

/** {@link ReadinessSurface} to the readiness state it needs. */
export const surfaceReadiness: Readonly<Record<ReadinessSurface, ProjectReadiness>> = {
  tree: 'treeReady',
  /* A surface that says a file is missing, or the project has none, speaks for every authored file (I7). */
  absence: 'materialized',
  editor: 'entryReady',
  viewer: 'entryReady',
  /* With their records landed ({@link chatsOpen}): the manifest a chat reads is the entry closure's. */
  chats: 'entryReady',
  search: 'materialized',
  export: 'materialized',
  lsp: 'materialized',
  cut: 'materialized',
  /* A render during a Tau Cloud open opens at the viewer's `entryReady` once its manifest is the landed one
     ({@link modelFirstViewOpens}). */
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
  return ownOpenReadiness(own) ?? followed ?? 'connected';
}

/**
 * This tab's own readiness during a Tau Cloud open: once its own root is connected, its reading; before, nothing.
 *
 * @param own - This tab's projection.
 * @returns Its own readiness, or `undefined` while its root has not connected.
 */
export function ownOpenReadiness(
  own: Pick<RevisionStatusProjection, 'readiness' | 'remote'> | undefined,
): ProjectReadiness | undefined {
  return own?.readiness !== undefined && own.remote.kind !== 'none' ? own.readiness : undefined;
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
