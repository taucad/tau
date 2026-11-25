/**
 * Fixtures for tests of the project library.
 *
 * - {@link testRootFiles}: a root file facade (A4b), a fixed value a test can replace, as `rootFiles` publishes a new
 *   record client when its worker is replaced.
 * - {@link createLibraryProfile}: the 386-directory library of the project-library fast-path blueprint (FW0), with
 *   every full discovery scan, targeted verification and file read the library asks of the authority counted, so a
 *   budget test can hold each mutation to its scans and reads.
 */
import { Topic } from '@taucad/events';
import type { Chat } from '@taucad/chat';
import type {
  ProjectDiscoveryEntry,
  ProjectDiscoveryResult,
  ProjectLocator,
  ProjectRouteVerification,
  StorageRootConfig,
} from '@taucad/filesystem';
import { parseProjectManifestBytes, projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { ProjectManifest } from '@taucad/types';
import type { ProjectLibraryRootFiles } from '#runtime/project-library.js';
import { resolveStorageRootKey } from '@taucad/filesystem/storage-root-key';
import { appMetaConfig } from '@taucad/ui-core/constants/meta.constants';
import type {
  ProjectLibraryRootFacade,
  ProjectManagerWorker,
  AppUiPreferences,
} from '#types/project-library-io.types.js';
import type { ProjectLibraryState } from '#types/project-library.types.js';
import type { PendingProjectOperation, PendingProjectStorage } from '#types/pending-project-operation.types.js';
import type { ChatStorage } from '#types/chat-storage.types.js';

/** A root file facade whose value a test sets. @public */
export type TestRootFiles<Facade extends ProjectLibraryRootFacade = ProjectLibraryRootFacade> =
  ProjectLibraryRootFiles<Facade> & Readonly<{ replace: (fileManager: unknown) => void }>;

/**
 * A root file facade over a test's file manager double.
 *
 * @param fileManager - The double: the parts of the facade the test's rows reach.
 * @returns The facade, and its replacement.
 * @public
 */
export const testRootFiles = <Facade extends ProjectLibraryRootFacade = ProjectLibraryRootFacade>(
  fileManager: unknown,
): TestRootFiles<Facade> => {
  let current = fileManager as Facade;
  const changes = new Topic<void>({ name: 'test-root-files' });
  return {
    get: () => current,
    subscribe: (listener) => changes.subscribe(listener),
    replace: (next) => {
      current = next as Facade;
      changes.emit(undefined);
    },
  };
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* The 386-directory library profile (fast-path blueprint FW0). */

/**
 * How many project directories each root holds, and how many Home projects also have a copy in the folder. The same
 * shape as `operatorDiscoveryProfile` in `@taucad/filesystem`'s test harness, whose cost test measures one scan of it.
 *
 * @public
 */
export type LibraryProfileShape = Readonly<{ home: number; workspace: number; duplicates: number }>;

/** The operator's profile: Home in OPFS with 84 directories, one folder with 302, three ids with a copy in each. @public */
export const operatorLibraryProfile: LibraryProfileShape = { home: 84, workspace: 302, duplicates: 3 };

/** The folder's workspace id in the profile. @public */
export const libraryProfileFolderId = 'wsp_libraryprofile0000000';

/** The id of the Home project at `index`. @public */
export const libraryProfileHomeId = (index: number): string => `proj_h${String(index).padStart(20, '0')}`;

/** The id of the folder project at `index`. @public */
export const libraryProfileWorkspaceId = (index: number): string => `proj_w${String(index).padStart(20, '0')}`;

/** A route the library keeps for a project, as `handle-store` holds it. */
export type LibraryProfileRoute =
  | Readonly<{ projectId: string; backend: 'opfs'; providerBasePath: string }>
  | Readonly<{ projectId: string; backend: 'webaccess'; workspaceId: string; providerBasePath: string }>;

/** What the library asked of the authority since the last reset. @public */
export type LibraryProfileCounts = Readonly<{
  /** Full discovery scans: `listProjectManifests` round trips, each reading every directory of every root. */
  scans: number;
  /** Targeted verifications: `verifyProjectRoute`, two file reads of one directory under its locks. */
  verifications: number;
  /** Root re-syncs (`syncProjectRoots`); not a discovery read, counted to show its share. */
  rootSyncs: number;
}>;

type ProfileDirectory = {
  readonly root: 'home' | 'workspace';
  readonly relativeDirectory: string;
  readonly projectId: string;
  manifest: ProjectManifest;
};

/** The profile: its state, the doubles the library runs over, and its meter. @public */
export type LibraryProfile = Readonly<{
  shape: LibraryProfileShape;
  /** The root file facade the library follows. */
  rootFiles: TestRootFiles;
  /** The object-store worker double: library rows and the journal. */
  worker: ProjectManagerWorker;
  /** The chat store double: one chat per project, `chat_<projectId>`. */
  chatStore: ChatStorage;
  /** The routes `handle-store` holds; a test's `handle-store` mock reads and writes this map. */
  routes: Map<string, LibraryProfileRoute>;
  /** The locator of a directory in the profile. */
  locatorOf: (root: 'home' | 'workspace', relativeDirectory: string) => ProjectLocator;
  /** The authority's scope of the folder. */
  workspaceScope: StorageRootConfig;
  /** What the library asked of the authority since the last reset. */
  counts: () => LibraryProfileCounts;
  reset: () => void;
}>;

const notFound = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });

const manifestNamed = (name: string): ProjectManifest =>
  projectToManifest({ name, description: '', tags: [], assets: { main: { entryPath: 'main.ts' } } });

/**
 * Build the library profile. Every Home project and every folder project is routed to its own directory; each
 * duplicated id is routed to its Home copy, so its folder copy lists as `duplicate-id`. One Home project,
 * `libraryProfileHomeId(shape.duplicates)`, is in the Trash.
 *
 * @param shape - The directories each root holds; the operator's profile by default.
 * @returns The profile.
 * @public
 */
export const createLibraryProfile = (shape: LibraryProfileShape = operatorLibraryProfile): LibraryProfile => {
  const homeRoot: StorageRootConfig = { backend: 'opfs' };
  const workspaceScope = {
    backend: 'webaccess',
    workspaceId: libraryProfileFolderId,
  } as unknown as StorageRootConfig;
  /* `persistentStorageRootKey`'s derivation, without importing the storage module: an app suite that mocks
   * `handle-store` imports this fixture before its mock's values exist. */
  const homeKey = resolveStorageRootKey({ backend: 'opfs' }, appMetaConfig.databasePrefix);
  const workspaceKey = resolveStorageRootKey(
    { backend: 'webaccess', workspaceId: libraryProfileFolderId },
    appMetaConfig.databasePrefix,
  );
  const locatorOf = (root: 'home' | 'workspace', relativeDirectory: string): ProjectLocator =>
    root === 'home'
      ? { backend: 'opfs', storageRootKey: homeKey, relativeDirectory }
      : {
          backend: 'webaccess',
          storageRootKey: workspaceKey,
          relativeDirectory,
          workspaceId: libraryProfileFolderId,
        };

  const directories: ProfileDirectory[] = [];
  const routes = new Map<string, LibraryProfileRoute>();
  const states = new Map<string, ProjectLibraryState>();
  for (let index = 0; index < shape.home; index += 1) {
    const projectId = libraryProfileHomeId(index);
    const relativeDirectory = `home-${String(index).padStart(3, '0')}`;
    directories.push({ root: 'home', relativeDirectory, projectId, manifest: manifestNamed(`Home ${index}`) });
    routes.set(projectId, { projectId, backend: 'opfs', providerBasePath: relativeDirectory });
    states.set(projectId, {
      projectId,
      lastActivityAt: 1_700_000_000_000 + index,
      ...(index === shape.duplicates ? { deletedAt: 1_700_000_100_000 } : {}),
    });
  }
  for (let index = 0; index < shape.duplicates; index += 1) {
    directories.push({
      root: 'workspace',
      relativeDirectory: `copy-${String(index).padStart(3, '0')}`,
      projectId: libraryProfileHomeId(index),
      manifest: manifestNamed(`Home ${index}`),
    });
  }
  for (let index = 0; index < shape.workspace - shape.duplicates; index += 1) {
    const projectId = libraryProfileWorkspaceId(index);
    const relativeDirectory = `folder-${String(index).padStart(3, '0')}`;
    directories.push({ root: 'workspace', relativeDirectory, projectId, manifest: manifestNamed(`Folder ${index}`) });
    routes.set(projectId, {
      projectId,
      backend: 'webaccess',
      workspaceId: libraryProfileFolderId,
      providerBasePath: relativeDirectory,
    });
    states.set(projectId, { projectId, lastActivityAt: 1_600_000_000_000 + index });
  }

  let counts = { scans: 0, verifications: 0, rootSyncs: 0 };
  const rootOf = (storage: Readonly<{ backend: string }>): 'home' | 'workspace' =>
    storage.backend === 'webaccess' ? 'workspace' : 'home';
  const routedDirectory = (projectId: string): ProfileDirectory | undefined => {
    const route = routes.get(projectId);
    return route === undefined
      ? undefined
      : directories.find(
          (directory) =>
            directory.root === rootOf(route) &&
            directory.relativeDirectory === route.providerBasePath &&
            directory.projectId === projectId,
        );
  };

  /* A scan as the authority answers it: every directory, sorted by backend, root and directory, with the ids more than
   * one directory carries marked `duplicate-id`. */
  const listProjectManifests = async (): Promise<ProjectDiscoveryResult> => {
    counts = { ...counts, scans: counts.scans + 1 };
    const occurrences = new Map<string, number>();
    for (const directory of directories) {
      occurrences.set(directory.projectId, (occurrences.get(directory.projectId) ?? 0) + 1);
    }
    const sorted = directories.toSorted(
      (left, right) =>
        (left.root === right.root ? 0 : left.root === 'home' ? -1 : 1) ||
        left.relativeDirectory.localeCompare(right.relativeDirectory),
    );
    const entries = sorted.map(
      (directory): ProjectDiscoveryEntry => ({
        status: (occurrences.get(directory.projectId) ?? 0) > 1 ? 'duplicate-id' : 'valid',
        projectId: directory.projectId,
        manifest: directory.manifest,
        locator: locatorOf(directory.root, directory.relativeDirectory),
      }),
    );
    return {
      entries,
      roots: [
        { status: 'complete', root: homeRoot },
        { status: 'complete', root: workspaceScope },
      ],
    };
  };

  const verifyProjectRoute = async ({ projectId }: Readonly<{ projectId: string }>) => {
    counts = { ...counts, verifications: counts.verifications + 1 };
    const directory = routedDirectory(projectId);
    return (
      directory === undefined
        ? { status: 'discovery-required' }
        : { status: 'verified', project: { projectId, manifest: directory.manifest } }
    ) satisfies ProjectRouteVerification;
  };

  const permanentlyDeleteProjectDirectory = async ({
    projectId,
    providerBasePath,
    scope,
  }: Readonly<{ projectId: string; providerBasePath: string; scope: Readonly<{ backend: string }> }>) => {
    const index = directories.findIndex(
      (directory) =>
        directory.root === rootOf(scope) &&
        directory.relativeDirectory === providerBasePath &&
        directory.projectId === projectId,
    );
    if (index === -1) {
      return { status: 'absent' } as const;
    }
    directories.splice(index, 1);
    return { status: 'deleted' } as const;
  };

  const commitPendingProjectDirectory = async ({
    projectId,
    providerBasePath,
    scope,
    manifest,
  }: Readonly<{
    projectId: string;
    providerBasePath: string;
    scope: Readonly<{ backend: string }>;
    manifest: Uint8Array<ArrayBuffer>;
  }>) => {
    const parsed = parseProjectManifestBytes(manifest);
    if (!parsed.success) {
      throw new Error('The profile commits strict manifests only');
    }
    directories.push({ root: rootOf(scope), relativeDirectory: providerBasePath, projectId, manifest: parsed.data });
    return { status: 'committed' } as const;
  };

  /* The record client: a routed project's `tau.json`, read and written; every other record is absent or ignored. */
  const manifestPath = /^\/projects\/([^/]+)\/tau\.json$/u;
  const recordFiles = {
    readFile: async (path: string, encoding?: 'utf8') => {
      const projectId = manifestPath.exec(path)?.[1];
      const directory = projectId === undefined ? undefined : routedDirectory(projectId);
      if (directory === undefined) {
        throw notFound(path);
      }
      const bytes = serializeProjectManifest(directory.manifest);
      return encoding === 'utf8' ? new TextDecoder().decode(bytes) : bytes;
    },
    writeFile: async (path: string, data: Uint8Array<ArrayBuffer> | string) => {
      const projectId = manifestPath.exec(path)?.[1];
      const directory = projectId === undefined ? undefined : routedDirectory(projectId);
      if (directory === undefined) {
        return;
      }
      const parsed = parseProjectManifestBytes(typeof data === 'string' ? new TextEncoder().encode(data) : data);
      if (parsed.success) {
        directory.manifest = parsed.data;
      }
    },
    readdir: async (path: string) => {
      throw notFound(path);
    },
    stat: async (path: string) => {
      throw notFound(path);
    },
    exists: async () => false,
    unlink: async () => undefined,
    rmdir: async () => undefined,
  };

  const facade = {
    client: {
      listProjectManifests,
      verifyProjectRoute,
      permanentlyDeleteProjectDirectory,
      commitPendingProjectDirectory,
      adoptProjectDirectory: async () => {
        throw new Error('Adoption is not part of the profile');
      },
    },
    recordFiles,
    workspace: {
      syncProjectRoots: async () => {
        counts = { ...counts, rootSyncs: counts.rootSyncs + 1 };
      },
    },
    workerChangeChannel: undefined,
    watchRecordFile: () => {
      throw new Error('The profile runs no observation');
    },
    scopedStorage: {},
    readDuplicateProjectFiles: async () => ({}),
  };

  /* The journal and the library rows. */
  const journal: PendingProjectOperation[] = [];
  let operations = 0;
  const nextOperationId = (): string => {
    operations += 1;
    return `req_profile${String(operations).padStart(16, '0')}`;
  };
  const libraryOf = (projectId: string): ProjectLibraryState =>
    states.get(projectId) ?? { projectId, lastActivityAt: 0 };
  let preferences: AppUiPreferences = { id: 'singleton', projectDisclosure: {} };
  const worker = {
    getProjectLibraryState: async (projectId: string) => states.get(projectId),
    getProjectLibraryStates: async (projectIds?: readonly string[]) =>
      (projectIds ?? [...states.keys()]).flatMap((projectId) => {
        const state = states.get(projectId);
        return state === undefined ? [] : [state];
      }),
    createProjectLibraryState: async (state: ProjectLibraryState) => {
      states.set(state.projectId, state);
      return state;
    },
    createProjectLibraryStates: async (created: readonly ProjectLibraryState[]) => {
      for (const state of created) {
        states.set(state.projectId, state);
      }
      return [...created];
    },
    deleteProjectResources: async (projectId: string) => {
      states.delete(projectId);
    },
    setProjectDisclosure: async () => undefined,
    resumePendingProjectOperationResources: async () => [],
    completePendingProjectOperation: async (operationId: string) => {
      const index = journal.findIndex((operation) => operation.operationId === operationId);
      if (index !== -1) {
        journal.splice(index, 1);
      }
    },
    getPendingProjectOperations: async () => [...journal],
    hasPendingProjectOperationForWorkspace: async () => false,
    prepareProjectCreation: async (request: {
      projectId: string;
      manifest: ProjectManifest;
      storage: PendingProjectStorage;
    }) => {
      const library = { projectId: request.projectId, lastActivityAt: Date.now() };
      states.set(request.projectId, library);
      const operation = {
        ...request.storage,
        operationId: nextOperationId(),
        kind: 'create',
        projectId: request.projectId,
        manifest: request.manifest,
        library,
        files: {},
        editorState: { projectId: request.projectId },
      } as unknown as PendingProjectOperation;
      journal.push(operation);
      return operation;
    },
    prepareProjectDuplicate: async (request: {
      sourceProjectId: string;
      targetProjectId: string;
      targetManifest: ProjectManifest;
      storage: PendingProjectStorage;
    }) => {
      const library = { projectId: request.targetProjectId, lastActivityAt: Date.now() };
      states.set(request.targetProjectId, library);
      const operation = {
        ...request.storage,
        operationId: nextOperationId(),
        kind: 'duplicate',
        sourceProjectId: request.sourceProjectId,
        projectId: request.targetProjectId,
        manifest: request.targetManifest,
        library,
        files: {},
        chats: [],
      } as unknown as PendingProjectOperation;
      journal.push(operation);
      return operation;
    },
    beginPermanentDeleteProject: async (
      projectId: string,
      storage: PendingProjectStorage,
      options?: Readonly<{ copy?: boolean }>,
    ) => {
      if (libraryOf(projectId).deletedAt === undefined && options?.copy !== true) {
        throw new Error('Permanent delete is available only for trashed projects');
      }
      const operationId = nextOperationId();
      journal.push({
        operationId,
        kind: 'permanent-delete',
        projectId,
        storage,
        ...(options?.copy === true ? { copy: true } : {}),
      });
      return operationId;
    },
    touchProjectActivity: async (projectId: string, activityAt?: number) => {
      const state = { ...libraryOf(projectId), lastActivityAt: activityAt ?? Date.now() };
      states.set(projectId, state);
      return state;
    },
    trashProject: async (projectId: string) => {
      const state = { ...libraryOf(projectId), deletedAt: Date.now() };
      states.set(projectId, state);
      return state;
    },
    restoreProject: async (projectId: string) => {
      const { deletedAt: _deletedAt, ...state } = libraryOf(projectId);
      states.set(projectId, state);
      return state;
    },
    getEditorState: async () => undefined,
    updateEditorState: async () => undefined,
    setGeoSpecCandidateConsent: async (projectId: string) => libraryOf(projectId),
    getAppUiPreferences: async () => preferences,
  } as unknown as ProjectManagerWorker;
  Object.assign(worker, {
    setProjectDisclosure: async (projectId: string, expanded: boolean | undefined) => {
      preferences = {
        ...preferences,
        projectDisclosure: {
          ...preferences.projectDisclosure,
          ...(expanded === undefined ? {} : { [projectId]: expanded }),
        },
      };
      return undefined;
    },
  });

  /* One chat per project, created on demand. */
  const chats = new Map<string, Chat>();
  const chatOf = (resourceId: string, id = `chat_${resourceId}`): Chat => {
    const existing = chats.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const chat: Chat = { id, resourceId, name: 'Chat', messages: [], createdAt: 0, updatedAt: 0 };
    chats.set(id, chat);
    return chat;
  };
  const resourceOf = (chatId: string): string => chatId.replace(/^chat_/u, '');
  const chatStore = {
    createChat: async (resourceId: string, chat: Readonly<{ id?: string; name?: string }>) =>
      chatOf(resourceId, chat.id ?? `chat_new_${String(chats.size)}`),
    getChat: async (chatId: string) => chats.get(chatId) ?? chatOf(resourceOf(chatId), chatId),
    getChatsForResource: async (resourceId: string) => [chatOf(resourceId)],
    softDeleteChat: async (chatId: string) => ({ ...chatOf(resourceOf(chatId), chatId), deletedAt: Date.now() }),
    deleteChat: async (chatId: string) => {
      chats.delete(chatId);
    },
    purgeChat: async (chatId: string) => {
      chats.delete(chatId);
    },
    touchChatRecency: async (chatId: string, requestedAt: number) => ({
      ...chatOf(resourceOf(chatId), chatId),
      recencyAt: requestedAt,
    }),
    putChatRecord: async () => undefined,
  } as unknown as ChatStorage;

  return {
    shape,
    rootFiles: testRootFiles(facade),
    worker,
    chatStore,
    routes,
    locatorOf,
    workspaceScope,
    counts: () => counts,
    reset: () => {
      counts = { scans: 0, verifications: 0, rootSyncs: 0 };
    },
  };
};
