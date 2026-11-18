/**
 * The library's workspace commands (app state orchestration charter D9; plan § 4 A4b; inventory L4, L6).
 *
 * Choose a project's directory, connect a workspace folder, retry a failed connection, refresh the catalog and repair
 * duplicated workspace bindings. They moved from `ProjectManagerProvider` with no change of order: the connection is
 * driven through the library's `workspaceConnection` actor, one at a time, with its telemetry, and settles from the
 * actor's snapshots. Nothing here is mounted, so a provider remount never cancels a connection in flight.
 */
import type { ProjectDiscoveryResult, ProjectLocator } from '@taucad/filesystem';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { selectWorkspaceConnectionState } from '#machines/workspace-connection.machine.js';
import type { PreparedWorkspaceCatalog, workspaceConnectionMachine } from '#machines/workspace-connection.machine.js';
import { WorkspaceRecoveryPendingError } from '@taucad/ui-core/filesystem/workspace-errors';
import { directoryPicker } from '#constants/browser.constants.js';
import type { DirectoryPick } from '#constants/browser.constants.js';
import {
  getWorkspaceMetadata,
  requestHandlePermission,
  repairWorkspaceBindings as repairStoredWorkspaceBindings,
  setProjectFileSystemConfig,
} from '#filesystem/handle-store.js';
import type {
  FolderEvidence,
  FolderProject,
  RelinkTarget,
  Workspace,
  WorkspaceBindingRepairResult,
} from '#filesystem/handle-store.js';
import type { ScopedStorageClient } from '@taucad/fs-client/file-system-client';
import { parseWorkspaceMarker, workspaceMarkerPath } from '@taucad/types';
import { deriveWorkspaceBindingRepairs, routeConfigFor } from '#runtime/project-library-storage.js';
import type { PendingProjectOperation } from '#types/pending-project-operation.types.js';
import type { ProjectLibraryFileManager } from '#types/project-library-io.types.js';
import type { WorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import type { Actor, SnapshotFrom } from 'xstate';

/** A connected workspace folder: the row, how many projects it holds, and whether this connection minted it. @public */
export type ConnectedWorkspace = {
  readonly workspace: Workspace;
  readonly projectCount: number;
  readonly minted: boolean;
};

/** Read-only access to one picked folder, for the evidence Locate weighs (blueprint D2 step 3). */
type FolderReader = {
  /** The names of the non-dot child directories of `path` (`''` is the folder itself); none when unreadable. */
  readonly directories: (path: string) => Promise<string[]>;
  /** A file's text, or `undefined` when it is missing or unreadable. */
  readonly readText: (path: string) => Promise<string | undefined>;
};

/** At most this many child folders are read for the picked-the-parent rule, so a huge parent stays bounded. */
const maxEvidenceSubfolders = 64;

/** A project's generated identity, `.tau/project.json` (`@taucad/project-core`'s `projectIdentityPath`). */
const projectIdentityFile = '.tau/project.json';

const parseProjectId = (text: string | undefined): string | undefined => {
  if (text === undefined) {
    return undefined;
  }
  try {
    const record: unknown = JSON.parse(text);
    return typeof record === 'object' &&
      record !== null &&
      'version' in record &&
      record.version === 1 &&
      'projectId' in record &&
      typeof record.projectId === 'string'
      ? record.projectId
      : undefined;
  } catch {
    return undefined;
  }
};

/** The projects one level inside `path`, and the child folders that hold none. */
const readProjectsIn = async (
  reader: FolderReader,
  path: string,
): Promise<{ readonly projects: FolderProject[]; readonly others: string[] }> => {
  const names = await reader.directories(path);
  const read = await Promise.all(
    names.map(async (name) => ({
      name,
      projectId: parseProjectId(
        await reader.readText(
          path === '' ? `${name}/${projectIdentityFile}` : `${path}/${name}/${projectIdentityFile}`,
        ),
      ),
    })),
  );
  return {
    projects: read.flatMap(({ name, projectId }) => (projectId === undefined ? [] : [{ projectId, directory: name }])),
    others: read.filter(({ projectId }) => projectId === undefined).map(({ name }) => name),
  };
};

/**
 * What a picked folder holds for Locate: its workspace marker, its projects, and the projects inside each child folder
 * that is not one. Reads only.
 */
const readFolderEvidenceWith = async (reader: FolderReader): Promise<FolderEvidence> => {
  const [markerText, top] = await Promise.all([reader.readText(workspaceMarkerPath), readProjectsIn(reader, '')]);
  const subfolders = await Promise.all(
    top.others.slice(0, maxEvidenceSubfolders).map(async (name) => {
      const { projects } = await readProjectsIn(reader, name);
      return { name, projects };
    }),
  );
  return {
    marker: markerText === undefined ? undefined : parseWorkspaceMarker(markerText),
    projects: top.projects,
    subfolders: subfolders.filter((subfolder) => subfolder.projects.length > 0),
  };
};

/** A desktop folder, read through the file service's scoped reads: the folder is not a configured root yet. */
const scopedFolderReader = (scopedStorage: ScopedStorageClient, path: string): FolderReader => {
  const scope = { backend: 'node', path } as const;
  return {
    directories: async (directory) => {
      try {
        const nodes = await scopedStorage.readShallowDirectory(directory, { scope });
        return nodes
          .filter((node) => node.children !== undefined && !node.name.startsWith('.'))
          .map((node) => node.name);
      } catch {
        return [];
      }
    },
    readText: async (file) => {
      try {
        return await scopedStorage.readFile(file, { encoding: 'utf8', scope });
      } catch {
        return undefined;
      }
    },
  };
};

/** A web folder, read through its handle on the page, where the permission it was picked with holds. */
const handleFolderReader = (root: FileSystemDirectoryHandle): FolderReader => {
  const directoryAt = async (path: string): Promise<FileSystemDirectoryHandle> => {
    let directory = root;
    for (const segment of path.split('/').filter(Boolean)) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each segment opens inside the one before it.
      directory = await directory.getDirectoryHandle(segment);
    }
    return directory;
  };
  return {
    directories: async (path) => {
      try {
        const names: string[] = [];
        const directory = await directoryAt(path);
        for await (const [name, entry] of directory.entries()) {
          if (entry.kind === 'directory' && !name.startsWith('.')) {
            names.push(name);
          }
        }
        return names;
      } catch {
        return [];
      }
    },
    readText: async (path) => {
      const segments = path.split('/');
      const fileName = segments.pop()!;
      try {
        const directory = await directoryAt(segments.join('/'));
        const handle = await directory.getFileHandle(fileName);
        const file = await handle.getFile();
        return await file.text();
      } catch {
        return undefined;
      }
    },
  };
};

/** The telemetry of one workspace connection, filled in as its services run. @public */
export type WorkspaceConnectionTrace = {
  readonly operationId: string;
  startedAt: number;
  workspaceId: string | undefined;
  registeringDuration: number;
  mountingDuration: number;
  catalogDuration: number;
  publishingDuration: number;
  candidateCount: number;
  projectCount: number;
  conflictCount: number;
};

type ConnectionSnapshot = SnapshotFrom<typeof workspaceConnectionMachine>;

/**
 * The object-store worker's pending-operation journal reads the workspace commands make. The app passes its
 * `Remote<ObjectStoreWorker>`.
 *
 * @public
 */
export type WorkspaceJournal = Readonly<{
  getPendingProjectOperations: () => Promise<readonly PendingProjectOperation[]>;
  hasPendingProjectOperationForWorkspace: (workspaceId: string) => Promise<boolean>;
}>;

/** What the workspace commands read from the library that builds them. @public */
export type WorkspaceCommandsHost = Readonly<{
  workspaceConnection: Actor<typeof workspaceConnectionMachine>;
  /** The root file facade, once there is one; the commands resync its project roots and read a picked folder. */
  facade: () => Promise<
    Pick<ProjectLibraryFileManager, 'workspace'> & Readonly<{ scopedStorage: ScopedStorageClient }>
  >;
  /** The object-store worker, ready; the commands only read its pending-operation journal. */
  readiedWorker: () => Promise<WorkspaceJournal>;
  whenDiscoveryReady: () => Promise<void>;
  discover: () => Promise<ProjectDiscoveryResult>;
  prepareCurrentWorkspaceCatalog: (selected?: Workspace, signal?: AbortSignal) => Promise<PreparedWorkspaceCatalog>;
  invalidateListing: () => void;
  /** One project's own queries changed. */
  invalidateProject: (projectId: string) => void;
  /** The connection's telemetry; a library built without it reports none. */
  telemetry: Pick<WorkspaceTelemetry, 'workspaceConnection'> | undefined;
}>;

/**
 * The library's workspace commands. `ProjectLibrary` builds one over itself; every member is a bound arrow function, so
 * a caller may hold it.
 *
 * @public
 */
export class WorkspaceCommands {
  readonly #host: WorkspaceCommandsHost;
  /** One workspace connection at a time, and its telemetry. */
  #connection: Promise<unknown> | undefined;
  #connectionTrace: WorkspaceConnectionTrace | undefined;

  public constructor(host: WorkspaceCommandsHost) {
    this.#host = host;
  }

  /** The telemetry of the connection that runs now, which the connection's services fill in. */
  public get connectionTrace(): WorkspaceConnectionTrace | undefined {
    return this.#connectionTrace;
  }

  /**
   * Connect a workspace folder: the picker's choice, or `selectedHandle`. A second call while one runs joins it.
   *
   * @param selectedHandle - A folder already chosen; the picker opens without one.
   * @returns The connected workspace, or `undefined` when no picker is available or the person cancelled.
   */
  public readonly connectWorkspace = async (
    selectedHandle?: FileSystemDirectoryHandle,
  ): Promise<ConnectedWorkspace | undefined> => {
    const picker = directoryPicker();
    if (!picker.available) {
      return undefined;
    }
    return this.#connectOnce(async (): Promise<ConnectedWorkspace | undefined> => {
      const { workspaceConnection } = this.#host;
      const operationId = generatePrefixedId(idPrefix.request);
      workspaceConnection.send({ type: 'beginSelection', operationId });
      let selection: DirectoryPick | undefined =
        selectedHandle === undefined ? undefined : { backend: 'webaccess', handle: selectedHandle };
      try {
        selection ??= await picker.pick({ id: 'tau-workspace', mode: 'readwrite' });
        if (selection === undefined) {
          workspaceConnection.send({ type: 'selectionCancelled' });
          return undefined;
        }
      } catch (error) {
        workspaceConnection.send({ type: 'selectionCancelled' });
        throw error;
      }
      const trace: WorkspaceConnectionTrace = {
        operationId,
        startedAt: performance.now(),
        workspaceId: undefined,
        registeringDuration: 0,
        mountingDuration: 0,
        catalogDuration: 0,
        publishingDuration: 0,
        candidateCount: 0,
        projectCount: 0,
        conflictCount: 0,
      };
      this.#connectionTrace = trace;
      const completion = this.#settled(operationId, workspaceConnection.getSnapshot().context.faults);
      workspaceConnection.send({ type: 'workspaceSelected', operationId, selection });
      try {
        const connected = await completion;
        this.#report(trace, 'ready');
        return connected;
      } catch (error) {
        this.#report(trace, 'failed');
        throw error;
      }
    });
  };

  /**
   * Resume a failed connection where it failed: pick again, ask again for access, or run the failed step again.
   *
   * @returns The connected workspace, or `undefined` when nothing failed or access was refused.
   */
  public readonly retryWorkspaceConnection = async (): Promise<ConnectedWorkspace | undefined> => {
    const { workspaceConnection } = this.#host;
    const snapshot = workspaceConnection.getSnapshot();
    const current = selectWorkspaceConnectionState(snapshot);
    if (current.phase !== 'failed') {
      return undefined;
    }
    if (current.retry === 'pick-again') {
      return this.connectWorkspace();
    }
    if (current.retry === 'grant-access') {
      const { selection } = snapshot.context;
      if (selection?.backend !== 'webaccess' || !(await requestHandlePermission(selection.handle))) {
        return undefined;
      }
    }
    /* The fault count is read before the retry, so a defect the retry itself meets ends this wait too. */
    const { faults } = snapshot.context;
    workspaceConnection.send({ type: 'retry' });
    return this.#settled(current.operationId, faults);
  };

  /** Publish a fresh catalog of every connected workspace. */
  public readonly refreshWorkspaceCatalog = async (): Promise<void> => {
    const catalog = await this.#host.prepareCurrentWorkspaceCatalog(undefined);
    await catalog.publish();
  };

  /**
   * Rebind the projects a duplicated workspace row holds to its canonical row.
   *
   * @param canonicalWorkspaceId - The row the projects keep.
   * @returns What was repaired, removed and skipped.
   */
  public readonly repairWorkspaceBindings = async (
    canonicalWorkspaceId: string,
  ): Promise<WorkspaceBindingRepairResult> => {
    await this.#host.whenDiscoveryReady();
    const groups = await deriveWorkspaceBindingRepairs(await this.#host.discover());
    const group = groups.find((candidate) => candidate.canonicalWorkspaceId === canonicalWorkspaceId);
    if (!group) {
      return { repairedProjectCount: 0, removedWorkspaceIds: [], skipped: [] };
    }
    const result = await repairStoredWorkspaceBindings({ canonicalWorkspaceId, repairs: group.repairs });
    if (result.repairedProjectCount === 0) {
      return result;
    }
    const fileManager = await this.#host.facade();
    await fileManager.workspace.syncProjectRoots();
    await this.refreshWorkspaceCatalog();
    return result;
  };

  /**
   * Bind a project id's route to one of the directories that claim it; writes no project file (R7).
   *
   * @param locator - The chosen directory.
   * @param projectId - The project.
   */
  public readonly chooseProjectDirectory = async (locator: ProjectLocator, projectId: string): Promise<void> => {
    await this.#host.whenDiscoveryReady();
    // Re-verify on a fresh scan: the folder may have changed since the card
    // rendered. Only the route binding moves; no project file is written (R7).
    const discovery = await this.#host.discover();
    const chosen = discovery.entries.find(
      (entry) =>
        (entry.status === 'duplicate-id' || entry.status === 'valid') &&
        entry.projectId === projectId &&
        entry.locator.storageRootKey === locator.storageRootKey &&
        entry.locator.relativeDirectory === locator.relativeDirectory,
    );
    if (!chosen) {
      throw new Error('This folder no longer holds that project.');
    }
    await setProjectFileSystemConfig(routeConfigFor(projectId, chosen.locator));
    const fileManager = await this.#host.facade();
    await fileManager.workspace.syncProjectRoots();
    this.#host.invalidateListing();
    this.#host.invalidateProject(projectId);
  };

  /**
   * Read what a folder picked for Locate holds (blueprint D2 step 3): its marker, its projects, and the projects in
   * each child folder. Reads only; the folder is not admitted as a root.
   *
   * @param target - The picked folder.
   * @returns The evidence `relinkWorkspace` weighs.
   */
  public readonly readFolderEvidence = async (target: RelinkTarget): Promise<FolderEvidence> => {
    if (target.backend === 'webaccess') {
      return readFolderEvidenceWith(handleFolderReader(target.handle));
    }
    const { scopedStorage } = await this.#host.facade();
    return readFolderEvidenceWith(scopedFolderReader(scopedStorage, target.path));
  };

  /**
   * Refuse a workspace change while a journal row needs the workspace to recover.
   *
   * @param workspaceId - The workspace.
   */
  public readonly assertWorkspaceMutationAllowed = async (workspaceId: string): Promise<void> => {
    const worker = await this.#host.readiedWorker();
    const workspace = await getWorkspaceMetadata(workspaceId);
    const operations = workspace?.path === undefined ? [] : await worker.getPendingProjectOperations();
    const pendingNative = operations.some((operation) => {
      const storage = operation.kind === 'permanent-delete' ? operation.storage : operation;
      return storage.backend === 'node' && storage.path === workspace?.path;
    });
    if (pendingNative || (await worker.hasPendingProjectOperationForWorkspace(workspaceId))) {
      throw new WorkspaceRecoveryPendingError();
    }
  };

  /** One connection at a time: a second call while one runs joins it. */
  async #connectOnce<Value>(run: () => Promise<Value>): Promise<Value> {
    if (this.#connection !== undefined) {
      return this.#connection as Promise<Value>;
    }
    const connection = run();
    this.#connection = connection;
    try {
      return await connection;
    } finally {
      if (this.#connection === connection) {
        this.#connection = undefined;
      }
    }
  }

  /** Report a connection's telemetry once, while it is still the connection that runs. */
  #report(trace: WorkspaceConnectionTrace, outcome: 'ready' | 'failed'): void {
    if (this.#connectionTrace !== trace) {
      return;
    }
    const { startedAt, ...metrics } = trace;
    this.#host.telemetry?.workspaceConnection({ ...metrics, outcome, totalMs: performance.now() - startedAt });
  }

  /**
   * Settles when the operation is ready, failed, superseded by a later `beginSelection`, or met a defect the machine's
   * root `onError` caught after `faultsBefore`: the machine keeps answering where it was, so this operation can no
   * longer settle (B2).
   */
  async #settled(operationId: string, faultsBefore: number): Promise<ConnectedWorkspace> {
    const { workspaceConnection } = this.#host;
    return new Promise<ConnectedWorkspace>((resolve, reject) => {
      const settle = (snapshot: ConnectionSnapshot): void => {
        if (snapshot.context.faults > faultsBefore) {
          subscription.unsubscribe();
          reject(new Error(`Workspace connection fault: ${snapshot.context.fault ?? 'unknown'}`));
          return;
        }
        if (snapshot.context.operationId !== operationId) {
          /* Only a later `beginSelection` sets another id: this operation was superseded, so it settles. */
          if (snapshot.context.operationId !== undefined) {
            subscription.unsubscribe();
            reject(new Error('Workspace connection was superseded.'));
          }
          return;
        }
        if (snapshot.matches('ready')) {
          subscription.unsubscribe();
          resolve({
            workspace: snapshot.context.workspace!.workspace,
            projectCount: snapshot.context.catalog!.projectCount,
            minted: snapshot.context.workspace!.minted,
          });
        } else if (snapshot.matches('failed')) {
          subscription.unsubscribe();
          const failure = snapshot.context.error;
          reject(failure instanceof Error ? failure : new Error('Workspace connection failed.', { cause: failure }));
        }
      };
      const subscription = workspaceConnection.subscribe(settle);
      settle(workspaceConnection.getSnapshot());
    });
  }
}
