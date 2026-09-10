import { createElement } from 'react';
import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderCapabilities, RootedFileSystem } from '@taucad/filesystem';
import { createBrowserRevisionPort, mainRevisionBranch, turnRevisionBranch } from '@taucad/revisions';
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';
import type { FileSystemClientFacade } from '#hooks/use-file-manager.js';
import {
  ChatWorkspaceAuthorityProvider,
  browserWorkspaceAuthorityTestApi,
  createPreparedWorkspaceFileSystems,
  readRootedBridgeCapabilities,
  useChatWorkspaceAuthority,
  usePreparedChatWorkspace,
} from '#providers/chat-workspace-authority-provider.js';
import type { PreparedChatWorkspace } from '#providers/chat-workspace-authority-provider.js';

const hookState = vi.hoisted(() => ({
  projectId: 'project_test',
  fileManager: undefined as unknown,
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => hookState.fileManager,
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: hookState.projectId }),
}));

const client = (exists: ReturnType<typeof vi.fn>): FileSystemClientFacade =>
  ({ exists }) as unknown as FileSystemClientFacade;

const authorityBinding = (filesystemClient: FileSystemClientFacade, rootDirectory: string) => ({
  client: filesystemClient,
  rootDirectory,
  backend: 'memory',
  capabilities: {
    persistent: false,
    writable: true,
    quotaBased: false,
    durability: 'ephemeral',
  } satisfies ProviderCapabilities,
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const installSerialWebLocks = (): void => {
  const tails = new Map<string, Promise<void>>();
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        name: string,
        options: { readonly mode: 'exclusive'; readonly ifAvailable?: boolean },
        // oxlint-disable-next-line typescript/no-restricted-types -- the Web Locks API answers `ifAvailable` with null
        callback: (lock: { readonly name: string; readonly mode: 'exclusive' } | null) => Promise<unknown>,
      ): Promise<unknown> => {
        /* `ifAvailable`: a held name answers `null` at once instead of queueing —
         * the reclaim path's contract (8-review M4). */
        if (options.ifAvailable === true && tails.has(name)) {
          return callback(null);
        }
        const prior = tails.get(name) ?? Promise.resolve();
        const release = Promise.withResolvers<void>();
        const tail = (async (): Promise<void> => {
          await prior;
          await release.promise;
        })();
        tails.set(name, tail);
        await prior;
        try {
          return await callback({ name, mode: 'exclusive' });
        } finally {
          release.resolve();
          if (tails.get(name) === tail) {
            tails.delete(name);
          }
        }
      },
    },
  });
};

beforeEach(() => {
  installSerialWebLocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const memoryFileSystem = (initial: Readonly<Record<string, string>>): RootedFileSystem => {
  const files = new Map(Object.entries(initial).map(([path, content]) => [path, encoder.encode(content)]));
  const directories = new Set(['']);
  const ensureParents = (path: string): void => {
    const segments = path.split('/');
    for (let index = 1; index < segments.length; index++) {
      directories.add(segments.slice(0, index).join('/'));
    }
  };
  for (const path of files.keys()) {
    ensureParents(path);
  }
  const missing = (path: string): Error => {
    const error = Object.assign(new Error(`Missing path: ${path}`), { code: 'ENOENT' });
    return error;
  };
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const content = files.get(path);
    if (!content) {
      throw missing(path);
    }
    return encoding === 'utf8' ? decoder.decode(content) : new Uint8Array(content);
  }
  const stat: RootedFileSystem['stat'] = async (path) => {
    const content = files.get(path);
    if (content) {
      return {
        type: 'file',
        size: content.byteLength,
        mtimeMs: 0,
        contentKind: 'text',
        lineCount: 1,
      };
    }
    if (directories.has(path)) {
      return { type: 'dir', size: 0, mtimeMs: 0 };
    }
    throw missing(path);
  };
  return {
    id: 'test-memory-root',
    capabilities: { persistent: false, writable: true, quotaBased: false, durability: 'ephemeral' },
    readFile,
    async writeFile(path, data) {
      ensureParents(path);
      files.set(path, typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data));
    },
    async appendFile(path, data) {
      const prior = files.get(path) ?? new Uint8Array();
      const bytes = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
      const combined = new Uint8Array(prior.byteLength + bytes.byteLength);
      combined.set(prior);
      combined.set(bytes, prior.byteLength);
      ensureParents(path);
      files.set(path, combined);
    },
    async readdir(path) {
      if (!directories.has(path)) {
        throw missing(path);
      }
      const prefix = path === '' ? '' : `${path}/`;
      return [
        ...new Set(
          [...directories, ...files.keys()]
            .filter((candidate) => candidate.startsWith(prefix) && candidate !== path)
            .map((candidate) => candidate.slice(prefix.length).split('/')[0])
            .filter((candidate): candidate is string => candidate !== undefined && candidate !== ''),
        ),
      ].sort();
    },
    stat,
    lstat: stat,
    async mkdir(path) {
      ensureParents(`${path}/child`);
      directories.add(path);
    },
    async unlink(path) {
      if (!files.delete(path)) {
        throw missing(path);
      }
    },
    async rmdir(path) {
      directories.delete(path);
    },
    async rename(from, to) {
      const content = files.get(from);
      if (!content) {
        throw missing(from);
      }
      // Mirrors `WorkspaceFileService._moveResolved`: `move`/`rename` is
      // fail-closed on an existing target. An overwriting mock here is what let
      // the EEXIST claim-update defect ship.
      if (files.has(to) || directories.has(to)) {
        throw Object.assign(new Error(`EEXIST: target already exists '${to}'`), { code: 'EEXIST' });
      }
      ensureParents(to);
      files.set(to, content);
      files.delete(from);
    },
    async exists(path) {
      return files.has(path) || directories.has(path);
    },
    dispose: () => undefined,
    watch() {
      return () => undefined;
    },
  };
};

/**
 * One file's text out of the *one* store, addressed by revision id.
 *
 * The authority no longer keeps a second uncompressed copy of each tree under
 * `.tau/workspaces/revisions/nodes/<id>/tree`, so a test that wants to see what
 * a revision recorded reads the content-addressed objects the recorder wrote.
 */
const storedText = async (filesystem: RootedFileSystem, id: string, path: string): Promise<string | undefined> => {
  const tree = await createBrowserRevisionPort({ filesystem }).readTree(revisionId(id));
  const entry = tree?.entries().find((candidate) => candidate.path === path);
  return entry === undefined ? undefined : decoder.decode(entry.content);
};

const fileManagerFor = async (filesystem: RootedFileSystem): Promise<unknown> => {
  const { createFileSystemBridgePort, createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
  const rootDirectory = '/project';
  const proxy = createFileSystemBridgeProxy(createFileSystemBridgePort(filesystem));
  const relative = (path: string): string => (path === rootDirectory ? '' : path.slice(`${rootDirectory}/`.length));
  const facade: Partial<FileSystemClientFacade> = {
    readFile: (async (path: string, encoding?: 'utf8') =>
      encoding === 'utf8'
        ? filesystem.readFile(relative(path), encoding)
        : filesystem.readFile(relative(path))) as FileSystemClientFacade['readFile'],
    writeFile: async (path, data) => filesystem.writeFile(relative(path), data),
    readdir: async (path) => filesystem.readdir(relative(path)),
    stat: async (path) => filesystem.stat(relative(path)),
    lstat: async (path) => filesystem.lstat(relative(path)),
    mkdir: async (path, options) => filesystem.mkdir(relative(path), options),
    unlink: async (path) => filesystem.unlink(relative(path)),
    rmdir: async (path) => filesystem.rmdir(relative(path)),
    exists: async (path) => filesystem.exists(relative(path)),
    move: async (from, to) => {
      await filesystem.rename(relative(from), relative(to));
      return filesystem.stat(relative(to));
    },
  };
  return {
    client: facade as FileSystemClientFacade,
    backendType: 'memory',
    workspace: { syncProjectRoots: async () => undefined },
    fileManagerRef: {
      getSnapshot: () => ({
        context: {
          rootDirectory,
          proxy,
          openFileSystemBridge: () => createFileSystemBridgePort(filesystem),
        },
      }),
      subscribe: () => ({ unsubscribe: () => undefined }),
    },
  };
};

const authorityWrapper = ({ children }: PropsWithChildren): React.JSX.Element =>
  createElement(ChatWorkspaceAuthorityProvider, undefined, children);

describe('browser workspace authority singleton', () => {
  afterEach(() => {
    browserWorkspaceAuthorityTestApi.reset();
  });

  it('retains prepared chat authority and rebinds filesystem access across a project-route remount', async () => {
    const firstExists = vi.fn().mockResolvedValue(true);
    const first = browserWorkspaceAuthorityTestApi.get({
      projectId: 'project_1',
      binding: authorityBinding(client(firstExists), '/first'),
    });
    const preparedInput = { chatId: 'chat_1' };
    const prepared = preparedInput as unknown as PreparedChatWorkspace;
    first.prepared.set('chat_1', prepared);

    const secondExists = vi.fn().mockResolvedValue(false);
    const remounted = browserWorkspaceAuthorityTestApi.get({
      projectId: 'project_1',
      binding: authorityBinding(client(secondExists), '/second'),
    });

    expect(remounted).toBe(first);
    expect(remounted.prepared.get('chat_1')).toBe(prepared);
    await expect(remounted.rootedFileSystem.exists('main.ts')).resolves.toBe(false);
    expect(firstExists).not.toHaveBeenCalled();
    expect(secondExists).toHaveBeenCalledWith('/second/main.ts');
  });

  it('isolates authorities by project id', () => {
    const exists = vi.fn().mockResolvedValue(false);
    const first = browserWorkspaceAuthorityTestApi.get({
      projectId: 'project_1',
      binding: authorityBinding(client(exists), '/first'),
    });
    const second = browserWorkspaceAuthorityTestApi.get({
      projectId: 'project_2',
      binding: authorityBinding(client(exists), '/second'),
    });

    expect(second).not.toBe(first);
    expect(second.prepared.size).toBe(0);
  });
});

describe('cross-tab chat workspace claims', () => {
  afterEach(() => {
    browserWorkspaceAuthorityTestApi.reset();
  });

  it('serializes first claim creation so the losing tab reopens the winner workspace', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    const originalExists = filesystem.exists.bind(filesystem);
    filesystem.exists = async (path) => {
      const observed = await originalExists(path);
      if (path === '.tau/workspaces/claims/chat_cross_tab.json' && !observed) {
        await new Promise<void>((resolve) => {
          globalThis.setTimeout(resolve, 0);
        });
      }
      return observed;
    };
    hookState.projectId = 'project_cross_tab';
    hookState.fileManager = await fileManagerFor(filesystem);
    const first = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    browserWorkspaceAuthorityTestApi.reset();
    const second = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });

    const [winner, follower] = await act(async () =>
      Promise.all([first.result.current.prepare('chat_cross_tab'), second.result.current.prepare('chat_cross_tab')]),
    );

    expect(follower.execution.workspaceId).toBe(winner.execution.workspaceId);
    expect(JSON.parse(await filesystem.readFile('.tau/workspaces/claims/chat_cross_tab.json', 'utf8'))).toMatchObject({
      workspaceId: winner.execution.workspaceId,
    });
  });

  it('fails closed when the durable claim names a different workspace authority', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_mismatch';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const prepared = await act(async () => result.current.prepare('chat_mismatch'));
    await filesystem.writeFile(
      '.tau/workspaces/claims/chat_mismatch.json',
      JSON.stringify({
        version: 1,
        chatId: 'chat_mismatch',
        projectId: 'project_mismatch',
        workspaceId: 'workspace_other_tab',
        baseRevisionId: prepared.execution.baseRevisionId,
        admitted: false,
        cancelled: false,
      }),
    );

    await expect(result.current.markRunId('chat_mismatch', 'run_mismatch')).rejects.toMatchObject({
      code: 'WORKSPACE_AUTHORITY_MISMATCH',
    });
    expect(JSON.parse(await filesystem.readFile('.tau/workspaces/claims/chat_mismatch.json', 'utf8'))).toMatchObject({
      workspaceId: 'workspace_other_tab',
    });
  });
});

describe('isolated workspace capability and publication', () => {
  it('derives provider capabilities from the rooted bridge hello', async () => {
    const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
    const filesystem = memoryFileSystem({});

    await expect(readRootedBridgeCapabilities(() => createFileSystemBridgePort(filesystem))).resolves.toEqual({
      persistent: false,
      writable: true,
      quotaBased: false,
      durability: 'ephemeral',
    });
  });

  it('should bridge the confined materialized filesystem without advertising the ineffective browser watch', async () => {
    const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(20);' });
    const prepared = await createPreparedWorkspaceFileSystems(filesystem);
    const proxy = createFileSystemBridgeProxy(prepared.openFileSystemBridge());
    try {
      await proxy.ready;
      await expect(proxy.readFile('main.scad', 'utf8')).resolves.toBe('cube(20);');
      await filesystem.writeFile('main.scad', 'cube(40);');
      await expect(proxy.readFile('main.scad', 'utf8')).resolves.toBe('cube(40);');
      expect(proxy.hello.payload).toMatchObject({ state: 'ready', watchable: false });
    } finally {
      proxy.dispose();
    }
  });
});

describe('chat workspace finalization retries', () => {
  afterEach(() => {
    browserWorkspaceAuthorityTestApi.reset();
    vi.restoreAllMocks();
  });

  it('converges a retry after a failed publication onto one revision', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': '' });
    hookState.projectId = 'project_retry';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const prepared = await act(async () => result.current.prepare('chat_retry'));
    await prepared.workspace.filesystem.writeFile('main.scad', 'cube(20);');

    const writeFile = filesystem.writeFile.bind(filesystem);
    let failPublication = true;
    filesystem.writeFile = async (path, data) => {
      if (failPublication && path.startsWith('.tau/workspaces/publications/')) {
        failPublication = false;
        throw Object.assign(new Error('publication disk full'), { code: 'ENOSPC' });
      }
      await writeFile(path, data);
    };
    const now = vi.spyOn(Date, 'now').mockReturnValue(100);
    const original = {
      actorId: 'agent-a',
      runId: 'run-a',
      turnId: 'turn-a',
      summary: 'Original summary',
    };

    await expect(result.current.finalize('chat_retry', original)).rejects.toMatchObject({ code: 'ENOSPC' });
    now.mockReturnValue(200);
    const state = browserWorkspaceAuthorityTestApi.get({
      projectId: hookState.projectId,
      binding: authorityBinding((hookState.fileManager as { client: FileSystemClientFacade }).client, '/project'),
    });
    await state.revisions.ready;

    /* Identity is content-addressed, so the retry does not have to be compared
       against a stored payload to be safe: the same tree and the same headers
       recompute the same commit id, and the chat's branch ends on exactly the
       revision the retry reports. */
    const settled = await result.current.finalize('chat_retry', original);
    expect(settled).toMatchObject({
      status: 'finalized',
      finalization: { generatedSummary: original.summary, changedPaths: ['main.scad'] },
    });
    /* A direct-mode turn records onto the trunk the live tree tracks (Q11). */
    const head = state.revisions.getBranchHead(mainRevisionBranch);
    expect(head).toBe(settled?.status === 'finalized' ? settled.finalization.revisionId : undefined);
    expect(state.revisions.getRevision(head!)?.summary.generated).toBe(original.summary);
  });

  it('coalesces concurrent finalizers for one chat into one immutable publication', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': '' });
    hookState.projectId = 'project_concurrent';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const prepared = await act(async () => result.current.prepare('chat_concurrent'));
    await prepared.workspace.filesystem.writeFile('main.scad', 'cube(40);');
    const input = {
      actorId: 'agent-a',
      runId: 'run-a',
      turnId: 'turn-a',
      summary: 'Concurrent summary',
    };

    const outcomes = await Promise.all([
      result.current.finalize('chat_concurrent', input),
      result.current.finalize('chat_concurrent', input),
    ]);

    expect(outcomes[0]).toEqual(outcomes[1]);
    expect(outcomes[0]).toMatchObject({ status: 'finalized' });
  });

  it('keeps the in-memory admission false when its durable claim write fails', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': '' });
    hookState.projectId = 'project_admission_rollback';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    await act(async () => result.current.prepare('chat_admission_rollback'));
    const writeFile = filesystem.writeFile.bind(filesystem);
    filesystem.writeFile = async (path, data) => {
      const value = typeof data === 'string' ? data : decoder.decode(data);
      if (path.startsWith('.tau/workspaces/claims/') && value.includes('"admitted":true')) {
        throw Object.assign(new Error('claim disk full'), { code: 'ENOSPC' });
      }
      await writeFile(path, data);
    };

    await expect(result.current.markAdmitted('chat_admission_rollback')).rejects.toMatchObject({ code: 'ENOSPC' });

    expect(result.current.get('chat_admission_rollback')?.admitted).toBe(false);
  });

  it('rewrites an existing claim record on every admission update', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': '' });
    hookState.projectId = 'proj_claim_update';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    await act(async () => result.current.prepare('chat_claim_update'));

    // The claim path already exists after `prepare`; every update rewrites it.
    await result.current.markAdmitted('chat_claim_update', 'turn_1');
    await result.current.markAdmitted('chat_claim_update', 'turn_2');

    expect(result.current.get('chat_claim_update')).toMatchObject({ admitted: true, turnId: 'turn_2' });
    await expect(filesystem.readFile('.tau/workspaces/claims/chat_claim_update.json', 'utf8')).resolves.toContain(
      '"turnId":"turn_2"',
    );
  });

  it('does not notify when a claim update changes nothing', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': '' });
    hookState.projectId = 'proj_claim_noop';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    await act(async () => result.current.prepare('chat_claim_noop'));

    await result.current.markRunId('chat_claim_noop', 'run_same');
    const afterFirst = result.current.get('chat_claim_noop');
    let notifications = 0;
    const unsubscribe = result.current.subscribe(() => {
      notifications += 1;
    });

    // The RPC binding re-marks the same run id on every lease. A notify here
    // mints a new prepared object, whose identity re-runs the join effect,
    // which re-marks — an unbounded join/leave loop that starves tool RPC.
    await result.current.markRunId('chat_claim_noop', 'run_same');
    unsubscribe();

    expect(notifications).toBe(0);
    expect(result.current.get('chat_claim_noop')).toBe(afterFirst);
  });

  it('retires a stale admitted claim so the next submit prepares a fresh workspace', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_stale_claim';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const wedged = await act(async () => result.current.prepare('chat_stale_claim'));
    await result.current.markAdmitted('chat_stale_claim', 'turn_dead');
    await result.current.markRunId('chat_stale_claim', 'run_dead');
    expect(result.current.get('chat_stale_claim')?.admitted).toBe(true);
    // The run id must survive a reload: recovery can only substantiate a claim
    // whose fenced run is on disk.
    expect(result.current.get('chat_stale_claim')?.runId).toBe('run_dead');
    await expect(filesystem.readFile('.tau/workspaces/claims/chat_stale_claim.json', 'utf8')).resolves.toContain(
      '"runId":"run_dead"',
    );

    await result.current.retireClaim('chat_stale_claim');

    expect(result.current.get('chat_stale_claim')).toBeUndefined();
    await expect(filesystem.exists('.tau/workspaces/claims/chat_stale_claim.json')).resolves.toBe(false);
    const replacement = await act(async () => result.current.prepare('chat_stale_claim'));
    expect(replacement.admitted).toBe(false);
    expect(replacement.execution.workspaceId).not.toBe(wedged.execution.workspaceId);
  });

  it('settles a merge conflict by retiring admission while preserving workspace evidence', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'base\n' });
    hookState.projectId = 'project_conflict_settlement';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    // Only branch mode can diverge from the live tree, so only branch mode can conflict.
    const prepared = await act(async () => result.current.prepare('chat_conflict_settlement', { mode: 'candidate' }));
    await result.current.markAdmitted('chat_conflict_settlement');
    await prepared.workspace.filesystem.writeFile('main.scad', 'agent\n');
    await filesystem.writeFile('main.scad', 'live\n');

    await expect(
      result.current.finalize('chat_conflict_settlement', {
        actorId: 'agent-conflict',
        runId: 'run-conflict',
        turnId: 'turn-conflict',
        summary: 'Conflicted change',
      }),
    ).resolves.toMatchObject({ status: 'conflicted', workspaceId: prepared.execution.workspaceId });

    expect(result.current.get('chat_conflict_settlement')).toBeUndefined();
    await expect(filesystem.exists('.tau/workspaces/claims/chat_conflict_settlement.json')).resolves.toBe(false);
    await expect(
      filesystem.exists(`.tau/workspaces/conflicts/${encodeURIComponent(prepared.execution.workspaceId)}.json`),
    ).resolves.toBe(true);
    const replacement = await act(async () => result.current.prepare('chat_conflict_settlement'));
    expect(replacement.execution.workspaceId).not.toBe(prepared.execution.workspaceId);
  });
});

describe('local revision mode', () => {
  afterEach(() => {
    browserWorkspaceAuthorityTestApi.reset();
  });

  it('binds the live project root and materializes no tree copy', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_local_bind';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });

    const prepared = await act(async () => result.current.prepare('chat_local_bind', { mode: 'direct' }));
    await prepared.workspace.filesystem.writeFile('main.scad', 'cube(20);');

    await expect(filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(20);');
    const workspaceDirectory = `.tau/workspaces/${prepared.execution.workspaceId}`;
    await expect(filesystem.exists(`${workspaceDirectory}/tree`)).resolves.toBe(false);
    await expect(filesystem.exists(`${workspaceDirectory}/base`)).resolves.toBe(false);
    await expect(filesystem.exists(`${workspaceDirectory}/identity.json`)).resolves.toBe(true);
    await expect(filesystem.readFile(`.tau/workspaces/claims/chat_local_bind.json`, 'utf8')).resolves.toContain(
      '"mode":"local"',
    );
  });

  it('publishes a local-mode turn through the unchanged finalization and clears the run directory', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_local_finalize';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const prepared = await act(async () => result.current.prepare('chat_local_finalize', { mode: 'direct' }));
    await result.current.markAdmitted('chat_local_finalize', 'turn_local');
    await prepared.workspace.filesystem.writeFile('main.scad', 'cube(30);');
    // The live tree already carries the agent's write: finalization's three-way
    // merge degenerates to a no-op apply rather than publishing the change.
    await expect(filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(30);');

    await expect(
      result.current.finalize('chat_local_finalize', {
        actorId: 'agent-local',
        runId: 'run-local',
        turnId: 'turn_local',
        summary: 'Local change',
      }),
    ).resolves.toMatchObject({
      status: 'finalized',
      finalization: { changedPaths: ['main.scad'], publication: { status: 'updated' } },
    });
    await expect(
      filesystem.exists(`.tau/workspaces/publications/${encodeURIComponent(prepared.execution.workspaceId)}.json`),
    ).resolves.toBe(true);
    await expect(filesystem.exists(`.tau/workspaces/${prepared.execution.workspaceId}`)).resolves.toBe(false);
    await expect(filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(30);');
  });

  it('publishes a local-mode turn without absorbing a pipeline write made while it settles', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_local_pipeline';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const prepared = await act(async () => result.current.prepare('chat_local_pipeline', { mode: 'direct' }));
    await result.current.markAdmitted('chat_local_pipeline', 'turn_pipeline');
    await prepared.workspace.filesystem.writeFile('main.scad', 'cube(30);');

    const write = filesystem.writeFile.bind(filesystem);
    const readdir = filesystem.readdir.bind(filesystem);
    let rootWalks = 0;
    filesystem.readdir = async (path) => {
      if (path === '') {
        rootWalks += 1;
        if (rootWalks === 2) {
          // In local mode `bindInPlace` hands the live root back as the agent
          // root, so the settlement's second root walk is its *verification*,
          // not a second opinion on the agent tree. A geometry-pipeline write
          // landing here belongs to the pipeline, not to this revision.
          await write('thumbnail.webp', new Uint8Array([7]));
        }
      }
      return readdir(path);
    };

    await expect(
      result.current.finalize('chat_local_pipeline', {
        actorId: 'agent-pipeline',
        runId: 'run-pipeline',
        turnId: 'turn_pipeline',
        summary: 'Local change beside a pipeline write',
      }),
    ).resolves.toMatchObject({
      status: 'finalized',
      finalization: { changedPaths: ['main.scad'], publication: { status: 'updated' } },
    });
    await expect(filesystem.readFile('thumbnail.webp')).resolves.toHaveLength(1);
  });

  it('keeps a concurrent reclaim from replacing the workspace a prepare just claimed', async () => {
    // `reclaim` rebuilds `state.prepared` from the on-disk claim. Run outside
    // the claim lock that `prepare`, `discard` and every claim update take, it
    // could publish a workspace the claim no longer names — and the next
    // `markAdmitted` then failed with WORKSPACE_AUTHORITY_MISMATCH, which is
    // how a dispatch lost its turn.
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_race';
    hookState.fileManager = await fileManagerFor(filesystem);
    const seed = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    // A persisted branch claim to reclaim from.
    await act(async () => seed.result.current.prepare('chat_race', { mode: 'candidate' }));
    browserWorkspaceAuthorityTestApi.reset();

    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    // The picked mode differs, so `prepare` discards the reclaimed branch claim
    // and writes a fresh one — exactly the window a racing reclaim reopens.
    await act(async () => {
      await Promise.all([result.current.reclaim('chat_race'), result.current.prepare('chat_race', { mode: 'direct' })]);
    });

    const claim = JSON.parse(await filesystem.readFile('.tau/workspaces/claims/chat_race.json', 'utf8')) as Record<
      string,
      unknown
    >;
    expect(result.current.get('chat_race')?.execution.workspaceId).toBe(claim['workspaceId']);
    await expect(result.current.markAdmitted('chat_race', 'turn_race')).resolves.toBeUndefined();
  });

  it('destroys a workspace directory that no claim and no publication reference', async () => {
    // `.tau/workspaces/run_orphan` is the operator's live residue: a submit
    // that prepared a workspace and never dispatched, so the claim write never
    // happened and nothing ever reclaims the bytes.
    const filesystem = memoryFileSystem({
      'main.scad': 'cube(10);',
      '.tau/workspaces/run_orphan/identity.json': JSON.stringify({
        version: 1,
        workspaceId: 'run_orphan',
        baseRevisionId: 'rev_orphan',
        metrics: { files: 0, bytes: 0, durationMs: 0 },
      }),
      '.tau/workspaces/run_orphan/tree/main.scad': 'cube(10);',
      '.tau/workspaces/run_claimed/identity.json': JSON.stringify({
        version: 1,
        workspaceId: 'run_claimed',
        baseRevisionId: 'rev_claimed',
        metrics: { files: 0, bytes: 0, durationMs: 0 },
      }),
      '.tau/workspaces/claims/chat_sweep.json': JSON.stringify({
        version: 1,
        chatId: 'chat_sweep',
        projectId: 'project_sweep',
        workspaceId: 'run_claimed',
        baseRevisionId: 'rev_claimed',
        mode: 'branch',
        admitted: false,
        cancelled: false,
      }),
    });
    hookState.projectId = 'project_sweep';
    hookState.fileManager = await fileManagerFor(filesystem);
    renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });

    await waitFor(async () => {
      await expect(filesystem.exists('.tau/workspaces/run_orphan')).resolves.toBe(false);
    });
    await expect(filesystem.exists('.tau/workspaces/run_orphan/identity.json')).resolves.toBe(false);
    // A claimed workspace is live state, never swept.
    await expect(filesystem.exists('.tau/workspaces/run_claimed/identity.json')).resolves.toBe(true);
    await expect(filesystem.exists('.tau/workspaces/claims/chat_sweep.json')).resolves.toBe(true);
    await expect(filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(10);');
  });

  it('M6: keeps the workspace a conflict record still points at', async () => {
    /* A stale-head publication retires the claim and keeps the run's tree so
     * the porcelain can diff and retry it. That made the directory an orphan by
     * the sweep's own definition, and the very next mount deleted the evidence
     * the conflict record names (6-review M6). */
    const filesystem = memoryFileSystem({
      'main.scad': 'cube(10);',
      '.tau/workspaces/run_conflicted/identity.json': JSON.stringify({
        version: 1,
        workspaceId: 'run_conflicted',
        baseRevisionId: 'rev_conflicted',
        metrics: { files: 0, bytes: 0, durationMs: 0 },
      }),
      '.tau/workspaces/run_conflicted/tree/main.scad': 'cube(40);',
      '.tau/workspaces/conflicts/run_conflicted.json': JSON.stringify({
        version: 1,
        status: 'conflicted',
        chatId: 'chat_conflicted',
        projectId: 'project_conflict_sweep',
        turnId: 'turn_conflicted',
        workspaceId: 'run_conflicted',
        branchName: 'agent/chat_conflicted',
        conflict: { type: 'merge', kind: 'text', paths: ['main.scad'] },
      }),
      '.tau/workspaces/run_orphan/identity.json': JSON.stringify({
        version: 1,
        workspaceId: 'run_orphan',
        baseRevisionId: 'rev_orphan',
        metrics: { files: 0, bytes: 0, durationMs: 0 },
      }),
    });
    hookState.projectId = 'project_conflict_sweep';
    hookState.fileManager = await fileManagerFor(filesystem);
    renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });

    // The unreferenced orphan still goes, so the sweep provably ran.
    await waitFor(async () => {
      await expect(filesystem.exists('.tau/workspaces/run_orphan')).resolves.toBe(false);
    });
    await expect(filesystem.readFile('.tau/workspaces/run_conflicted/tree/main.scad', 'utf8')).resolves.toBe(
      'cube(40);',
    );
  });

  it('leaves a Tau Host turn workspace on the shared root to the host that owns it (SR4)', async () => {
    /* The desktop utility and the daemon write `t<runId>` workspaces into the
       same `.tau/workspaces` this authority sweeps, for turns it holds no claim
       for. Sweeping one destroys the tree a live host turn is writing. */
    const filesystem = memoryFileSystem({
      'main.scad': 'cube(10);',
      '.tau/workspaces/trun_host_live/identity.json': JSON.stringify({
        version: 1,
        workspaceId: 'trun_host_live',
        baseRevisionId: 'rev_host',
        metrics: { files: 0, bytes: 0, durationMs: 0 },
      }),
      '.tau/workspaces/trun_host_live/tree/main.scad': 'cube(20);',
      '.tau/workspaces/run_orphan/identity.json': JSON.stringify({
        version: 1,
        workspaceId: 'run_orphan',
        baseRevisionId: 'rev_orphan',
        metrics: { files: 0, bytes: 0, durationMs: 0 },
      }),
    });
    hookState.projectId = 'project_host_sweep';
    hookState.fileManager = await fileManagerFor(filesystem);
    renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });

    // This authority's own orphan still goes, so the sweep is provably running.
    await waitFor(async () => {
      await expect(filesystem.exists('.tau/workspaces/run_orphan')).resolves.toBe(false);
    });
    await expect(filesystem.readFile('.tau/workspaces/trun_host_live/tree/main.scad', 'utf8')).resolves.toBe(
      'cube(20);',
    );
  });

  it('keeps the durable chat log out of a local-mode revision capture', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_local_log';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const prepared = await act(async () => result.current.prepare('chat_local_log', { mode: 'direct' }));
    await result.current.markAdmitted('chat_local_log', 'turn_local_log');
    // PH19: the host writes its canonical log to the project root. In local
    // mode that root IS the agent tree, so an unexcluded log rides into the
    // revision capture and shows up in `changedPaths`.
    await prepared.workspace.filesystem.writeFile('.tau/chats/chat_local_log/events.jsonl', '{"seq":0}\n');
    await prepared.workspace.filesystem.writeFile('main.scad', 'cube(30);');

    await expect(
      result.current.finalize('chat_local_log', {
        actorId: 'agent-local',
        runId: 'run_local_log',
        turnId: 'turn_local_log',
        summary: 'Local change',
      }),
    ).resolves.toMatchObject({ status: 'finalized', finalization: { changedPaths: ['main.scad'] } });
    // The log itself survives on disk — it is excluded from capture, not deleted.
    await expect(filesystem.readFile('.tau/chats/chat_local_log/events.jsonl', 'utf8')).resolves.toBe('{"seq":0}\n');
  });

  it('reclaims a persisted local claim onto the live root and a mode-less claim as a branch', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_local_reclaim';
    hookState.fileManager = await fileManagerFor(filesystem);
    const seeded = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const local = await act(async () => seeded.result.current.prepare('chat_local_reclaim', { mode: 'direct' }));
    const branch = await act(async () => seeded.result.current.prepare('chat_branch_reclaim', { mode: 'candidate' }));
    // A claim written before this field existed must still reclaim as a branch.
    const legacy = JSON.parse(
      await filesystem.readFile('.tau/workspaces/claims/chat_branch_reclaim.json', 'utf8'),
    ) as Record<string, unknown>;
    delete legacy['mode'];
    await filesystem.writeFile('.tau/workspaces/claims/chat_branch_reclaim.json', JSON.stringify(legacy));
    seeded.unmount();
    browserWorkspaceAuthorityTestApi.reset();

    const recovered = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const reclaimedLocal = await act(async () => recovered.result.current.reclaim('chat_local_reclaim'));
    const reclaimedBranch = await act(async () => recovered.result.current.reclaim('chat_branch_reclaim'));

    expect(reclaimedLocal?.execution.workspaceId).toBe(local.execution.workspaceId);
    await reclaimedLocal!.workspace.filesystem.writeFile('main.scad', 'cube(40);');
    await expect(filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(40);');

    expect(reclaimedBranch?.execution.workspaceId).toBe(branch.execution.workspaceId);
    await reclaimedBranch!.workspace.filesystem.writeFile('main.scad', 'cube(50);');
    await expect(
      filesystem.readFile(`.tau/workspaces/${branch.execution.workspaceId}/tree/main.scad`, 'utf8'),
    ).resolves.toBe('cube(50);');
    await expect(filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(40);');
  });

  it('re-prepares an unadmitted claim when the picked mode changes', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_mode_switch';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    // The composer claims a workspace at mount to publish the latest agent body,
    // so the mode the user picks afterwards must still reach the next turn.
    const eager = await act(async () => result.current.prepare('chat_mode_switch'));

    const branched = await act(async () => result.current.prepare('chat_mode_switch', { mode: 'candidate' }));

    expect(branched.execution.workspaceId).not.toBe(eager.execution.workspaceId);
    await expect(filesystem.exists(`.tau/workspaces/${eager.execution.workspaceId}`)).resolves.toBe(false);
    await branched.workspace.filesystem.writeFile('main.scad', 'cube(70);');
    await expect(filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(10);');
    // An admitted claim belongs to a live run: the switch applies to the next turn.
    await result.current.markAdmitted('chat_mode_switch', 'turn_switch');
    await expect(
      act(async () => result.current.prepare('chat_mode_switch', { mode: 'direct' })),
    ).resolves.toMatchObject({ execution: { workspaceId: branched.execution.workspaceId } });
  });

  it('queues a second direct-mode writer behind the chat holding the live tree (DT2)', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_local_conflict';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    await act(async () => result.current.prepare('chat_local_first', { mode: 'direct' }));
    await result.current.markAdmitted('chat_local_first', 'turn_first');

    let settled = false;
    const queued = (async () => {
      const prepared = await result.current.prepare('chat_local_second', { mode: 'direct' });
      settled = true;
      return prepared;
    })();
    // One live-tree writer at a time: the second claim waits rather than
    // throwing the user's turn away (DT2, replacing the old refusal).
    await act(async () => {
      await new Promise((resolve) => {
        globalThis.setTimeout(resolve, 600);
      });
    });
    expect(settled).toBe(false);

    await result.current.discard('chat_local_first');
    await expect(act(async () => queued)).resolves.toMatchObject({ chatId: 'chat_local_second' });

    // Candidate mode is never blocked by a live-tree writer.
    await act(async () => result.current.discard('chat_local_second'));
    await expect(
      act(async () => result.current.prepare('chat_local_second', { mode: 'candidate' })),
    ).resolves.toMatchObject({ chatId: 'chat_local_second' });
  });

  it('admits one live-tree writer at a time when both chats already hold a claim (DT2)', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_local_double_admit';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    /* The composer claims a workspace at mount, so by submit time both chats
       already hold an unadmitted local claim and neither re-enters `prepare`.
       The advisory check there is therefore never the fence — admission is. */
    await act(async () => result.current.prepare('chat_double_first', { mode: 'direct' }));
    await act(async () => result.current.prepare('chat_double_second', { mode: 'direct' }));
    await result.current.markAdmitted('chat_double_first', 'turn_first');

    let secondAdmitted = false;
    const queued = (async () => {
      await result.current.markAdmitted('chat_double_second', 'turn_second');
      secondAdmitted = true;
    })();
    await act(async () => {
      await new Promise((resolve) => {
        globalThis.setTimeout(resolve, 300);
      });
    });

    expect(secondAdmitted).toBe(false);
    expect(result.current.get('chat_double_second')?.admitted).toBe(false);
    expect(result.current.get('chat_double_first')?.admitted).toBe(true);

    // The holder retires; the queued writer is admitted in its turn, not before.
    await result.current.retireClaim('chat_double_first');
    await act(async () => queued);
    expect(result.current.get('chat_double_second')?.admitted).toBe(true);
  });

  it('keeps an agent write off the restore-timeline dirty seam by never emitting a content change', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_local_dirty';
    const fileManager = (await fileManagerFor(filesystem)) as Record<string, unknown>;
    // Seam 3 in `revision-provider.tsx` flips `dirty` on any non-'machine'
    // content-change event for a design path, and only `FileContentService`
    // emits those events. Local-mode agent writes address the live root through
    // the proxy facade instead, so the seam never sees them — pin that here
    // rather than tagging a `source` the stream never carries.
    const contentService = { write: vi.fn(), writeBatch: vi.fn(), delete: vi.fn(), onDidContentChange: vi.fn() };
    hookState.fileManager = { ...fileManager, contentService };
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const prepared = await act(async () => result.current.prepare('chat_local_dirty', { mode: 'direct' }));

    await prepared.workspace.filesystem.writeFile('main.scad', 'cube(60);');

    expect(contentService.write).not.toHaveBeenCalled();
    expect(contentService.writeBatch).not.toHaveBeenCalled();
    expect(contentService.delete).not.toHaveBeenCalled();
    expect(contentService.onDidContentChange).not.toHaveBeenCalled();
    await expect(filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(60);');
  });
});

describe('run settlement', () => {
  afterEach(() => {
    browserWorkspaceAuthorityTestApi.reset();
  });

  it('admits the claim of a dispatch path that only records a run id', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': '' });
    hookState.projectId = 'project_seeded_turn';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    // The homepage-seeded first turn claims through the composer's
    // latest-agent-body effect and dispatches through the chat-session store's
    // body fallback, which never runs `withWorkspace` — so `markAdmitted` is
    // never called and only the run id ever reaches the claim.
    const prepared = await act(async () => result.current.prepare('chat_seeded'));
    expect(prepared.admitted).toBe(false);

    await result.current.markRunId('chat_seeded', 'run_seeded');

    expect(result.current.get('chat_seeded')).toMatchObject({ admitted: true, runId: 'run_seeded' });
    await expect(filesystem.readFile('.tau/workspaces/claims/chat_seeded.json', 'utf8')).resolves.toContain(
      '"admitted":true',
    );
    // Settlement is gated on admission: without it the agent's work never
    // publishes and the claim blocks every later submit for this chat.
    await prepared.workspace.filesystem.writeFile('main.scad', 'cube(10);');
    await expect(
      result.current.finalize('chat_seeded', {
        actorId: 'tau-browser-agent-host',
        runId: 'run_seeded',
        turnId: 'turn_seeded',
        summary: 'Seeded first turn',
      }),
    ).resolves.toMatchObject({ status: 'finalized', finalization: { changedPaths: ['main.scad'] } });
    await expect(filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(10);');
    await expect(filesystem.exists('.tau/workspaces/claims/chat_seeded.json')).resolves.toBe(false);
  });

  it('descends a later claim from the chat last published revision instead of minting another root', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': '' });
    hookState.projectId = 'project_lineage';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });

    const first = await act(async () => result.current.prepare('chat_lineage', { mode: 'direct' }));
    await result.current.markAdmitted('chat_lineage', 'turn_1');
    await first.workspace.filesystem.writeFile('main.scad', 'cube(10);');
    const published = await act(async () =>
      result.current.finalize('chat_lineage', {
        actorId: 'agent-lineage',
        runId: 'run_1',
        turnId: 'turn_1',
        summary: 'First turn',
      }),
    );
    expect(published).toMatchObject({ status: 'finalized' });
    const headRevisionId = published?.status === 'finalized' ? published.finalization.revisionId : 'never-published';

    const second = await act(async () => result.current.prepare('chat_lineage', { mode: 'direct' }));

    // A fresh root per claim leaves the durable graph a pile of disconnected
    // "Base for chat" revisions, so nothing downstream can walk the chat's
    // lineage back through the turn that produced the live tree. Content
    // addressing removes even the copy: the live tree the later claim starts
    // from IS the published revision's tree, so that revision is its base.
    expect(second.execution.baseRevisionId).toBe(headRevisionId);
    // The base is the live tree, which already carries the previous turn's write.
    await expect(storedText(filesystem, second.execution.baseRevisionId, 'main.scad')).resolves.toBe('cube(10);');
    // One store: the authority keeps no second copy of the tree.
    await expect(filesystem.exists('.tau/workspaces/revisions')).resolves.toBe(false);
  });

  it('admits a workspace whose directory listing named an atomic write that renamed away', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_vanishing_temp';
    hookState.fileManager = await fileManagerFor(filesystem);
    // `_atomicWrite` lists before it renames: the temp sibling is in the
    // snapshot and gone by the `stat` that follows it.
    const temporary = '.tau/parameters/.main.scad.json.4821.9f3a.tmp';
    const originalReaddir = filesystem.readdir.bind(filesystem);
    filesystem.readdir = async (path) =>
      path === '.tau/parameters'
        ? [...(await originalReaddir(path)), '.main.scad.json.4821.9f3a.tmp']
        : originalReaddir(path);
    await filesystem.writeFile('.tau/parameters/main.scad.json', '{}');
    await expect(filesystem.exists(temporary)).resolves.toBe(false);

    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const prepared = await act(async () => result.current.prepare('chat_vanishing_temp', { mode: 'direct' }));

    expect(prepared.execution.workspaceId).toMatch(/^run_/);
    await expect(storedText(filesystem, prepared.execution.baseRevisionId, 'main.scad')).resolves.toBe('cube(10);');
    await expect(storedText(filesystem, prepared.execution.baseRevisionId, temporary)).resolves.toBeUndefined();
  });

  it('keeps generated kernel cache out of the captured trees and the live merge', async () => {
    const filesystem = memoryFileSystem({
      'main.scad': 'cube(10);',
      '.tau/cache/geometry/warm.bin': 'warm',
    });
    hookState.projectId = 'project_cache_capture';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const prepared = await act(async () => result.current.prepare('chat_cache_capture', { mode: 'candidate' }));

    const workspaceDirectory = `.tau/workspaces/${prepared.execution.workspaceId}`;
    await expect(filesystem.exists(`${workspaceDirectory}/tree/.tau/cache/geometry/warm.bin`)).resolves.toBe(false);
    await expect(filesystem.exists(`${workspaceDirectory}/base/.tau/cache/geometry/warm.bin`)).resolves.toBe(false);
    await expect(filesystem.exists(`${workspaceDirectory}/tree/main.scad`)).resolves.toBe(true);

    await prepared.workspace.filesystem.writeFile('main.scad', 'cube(20);');
    await expect(
      result.current.finalize('chat_cache_capture', {
        actorId: 'agent-cache',
        runId: 'run_cache',
        turnId: 'turn_cache',
        summary: 'Cache stays out',
      }),
    ).resolves.toMatchObject({ status: 'finalized', finalization: { changedPaths: ['main.scad'] } });
    // The merge must not treat the live kernel cache as a path the agent deleted.
    await expect(filesystem.readFile('.tau/cache/geometry/warm.bin', 'utf8')).resolves.toBe('warm');
    await expect(filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(20);');
  });

  it('releases a claim whose materialized bytes cannot be removed', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_unremovable';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const prepared = await act(async () => result.current.prepare('chat_unremovable', { mode: 'candidate' }));
    await result.current.markAdmitted('chat_unremovable', 'turn_unremovable');
    await prepared.workspace.filesystem.writeFile('main.scad', 'cube(20);');
    // Chrome stages File System Access writes through a sibling `<name>.crswap`
    // file that directory listings hide but `rmdir` still trips over, so an
    // abandoned kernel-cache write makes this directory permanently unremovable.
    const treeDirectory = `.tau/workspaces/${prepared.execution.workspaceId}/tree`;
    const originalRmdir = filesystem.rmdir.bind(filesystem);
    filesystem.rmdir = async (path) => {
      if (path === treeDirectory) {
        throw Object.assign(new Error(`ENOTEMPTY: directory not empty '${path}'`), { code: 'ENOTEMPTY' });
      }
      return originalRmdir(path);
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      result.current.finalize('chat_unremovable', {
        actorId: 'agent-unremovable',
        runId: 'run_unremovable',
        turnId: 'turn_unremovable',
        summary: 'Unremovable workspace',
      }),
    ).resolves.toMatchObject({ status: 'finalized' });

    expect(result.current.get('chat_unremovable')).toBeUndefined();
    await expect(filesystem.exists('.tau/workspaces/claims/chat_unremovable.json')).resolves.toBe(false);
    await expect(
      filesystem.exists(`.tau/workspaces/publications/${encodeURIComponent(prepared.execution.workspaceId)}.json`),
    ).resolves.toBe(true);
    await expect(filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(20);');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
    // The next turn must be able to claim a fresh workspace.
    const replacement = await act(async () => result.current.prepare('chat_unremovable'));
    expect(replacement.execution.workspaceId).not.toBe(prepared.execution.workspaceId);
  });
});

describe('DT1 revision porcelain', () => {
  afterEach(() => {
    browserWorkspaceAuthorityTestApi.reset();
  });

  /**
   * A revision store two agents already wrote into: `main` from a Tau turn, and
   * a candidate branch from an external (Codex) turn a Tau Host recorded on the
   * same root.
   *
   * Minted through the port, because there is one store: a revision's id **is**
   * its Git commit id, so a seeded literal like `rev_main` is not a revision
   * this authority can ever load, merge or check out.
   */
  const seededStore = async (): Promise<{
    filesystem: RootedFileSystem;
    main: string;
    codex: string;
    /** Mints one more revision in the same store — a turn no branch names. */
    mint: (input: {
      readonly parents: readonly string[];
      readonly actorId: string;
      readonly summary: string;
      readonly files: Readonly<Record<string, string>>;
    }) => Promise<string>;
  }> => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    const port = createBrowserRevisionPort({ filesystem });
    const mint = async (input: {
      readonly parents: readonly string[];
      readonly actorId: string;
      readonly summary: string;
      readonly files: Readonly<Record<string, string>>;
    }): Promise<string> => {
      const receipt = await port.writeRevision({
        parents: input.parents.map((parent) => revisionId(parent)),
        tree: new ImmutableRevisionTree(Object.entries(input.files)),
        provenance: { source: 'agent', actorId: input.actorId, createdAt: 1_700_000_000_000 },
        summary: { generated: input.summary },
      });
      return receipt.commitId;
    };
    const main = await mint({
      parents: [],
      actorId: 'chat_tau',
      summary: 'Tau turn',
      files: { 'main.scad': 'cube(10);' },
    });
    const codex = await mint({
      parents: [main],
      actorId: 'codex',
      summary: 'Codex turn',
      files: { 'main.scad': 'cube(10);', 'bracket.scad': 'cube(5);' },
    });
    await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(main) });
    await port.updateRef({
      name: 'agent/chat-codex/trun-codex',
      expectedHead: undefined,
      head: revisionId(codex),
    });
    // The live tree is on the trunk, as every project this authority opens is.
    await port.setHead('main');
    return { filesystem, main, codex, mint };
  };

  const porcelain = async (projectId: string) => {
    const seeded = await seededStore();
    hookState.projectId = projectId;
    hookState.fileManager = await fileManagerFor(seeded.filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    await waitFor(() => {
      expect(result.current.listBranches().length).toBe(2);
    });
    return { ...seeded, result };
  };

  it('8-review S7/S1: checks out a revision whose branch was deleted before a reload dropped it', async () => {
    const { codex, filesystem, result } = await porcelain('project_deleted_branch_checkout');
    await act(async () => {
      await result.current.deleteBranch('agent/chat-codex/trun-codex');
    });
    expect(result.current.listBranches().map((branch) => branch.name)).toEqual(['main']);

    // A reload: the projection is rebuilt from refs, and the deleted branch's
    // revision is reachable from none of them.
    browserWorkspaceAuthorityTestApi.reset();
    installSerialWebLocks();
    hookState.fileManager = await fileManagerFor(filesystem);
    const reloaded = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    await waitFor(() => {
      expect(reloaded.result.current.listBranches().length).toBe(1);
    });

    /* The store still holds the revision, and checkout is the store's verb,
     * not the projection's (8-review S1). */
    await expect(act(async () => reloaded.result.current.checkout(codex))).resolves.toEqual([
      { path: 'bracket.scad', change: 'added' },
    ]);
    await expect(filesystem.readFile('bracket.scad', 'utf8')).resolves.toBe('cube(5);');
  });

  it('lists every branch head the authority holds, whichever agent wrote it', async () => {
    const { codex, main, result } = await porcelain('project_porcelain_list');

    // The Codex turn's branch is a peer of main, not a second-class record.
    expect(result.current.listBranches()).toEqual([
      {
        name: 'agent/chat-codex/trun-codex',
        headRevisionId: codex,
        summary: 'Codex turn',
        actorId: 'codex',
        source: 'agent',
        createdAt: 1_700_000_000_000,
      },
      {
        name: 'main',
        headRevisionId: main,
        summary: 'Tau turn',
        actorId: 'chat_tau',
        source: 'agent',
        createdAt: 1_700_000_000_000,
      },
    ]);
    // Identity-stable, or every `useSyncExternalStore` subscriber spins.
    expect(result.current.listBranches()).toBe(result.current.listBranches());
  });

  it('switches the live project tree to a branch head, and restores it back', async () => {
    const { codex, filesystem, main, result } = await porcelain('project_porcelain_switch');

    await expect(act(async () => result.current.checkout(codex))).resolves.toEqual([
      { path: 'bracket.scad', change: 'added' },
    ]);
    await expect(filesystem.readFile('bracket.scad', 'utf8')).resolves.toBe('cube(5);');

    // Restore is the same verb: any revision, from any agent, in either direction.
    await expect(act(async () => result.current.checkout(main))).resolves.toEqual([
      { path: 'bracket.scad', change: 'removed' },
    ]);
    await expect(filesystem.exists('bracket.scad')).resolves.toBe(false);
    await expect(filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(10);');
  });

  it('moves the head reference on a switch, and lands a merge into it in the live tree (Q11)', async () => {
    const { codex, filesystem, main, result } = await porcelain('project_porcelain_head');
    expect(result.current.headBranch()).toBe('main');

    // A checkout moves where the live tree is, so it moves the head reference.
    await act(async () => {
      await result.current.checkout(codex);
    });
    await waitFor(() => {
      expect(result.current.headBranch()).toBe('agent/chat-codex/trun-codex');
    });

    await act(async () => {
      await result.current.checkout(main);
    });
    await waitFor(() => {
      expect(result.current.headBranch()).toBe('main');
    });
    await expect(filesystem.exists('bracket.scad')).resolves.toBe(false);

    /* Merging into the branch the live tree is on lands in the folder, with no
     * second checkout: the working tree follows the head reference. */
    await act(async () => {
      await result.current.mergeBranch({ source: 'agent/chat-codex/trun-codex', target: 'main', actorId: 'user_1' });
    });
    await expect(filesystem.readFile('bracket.scad', 'utf8')).resolves.toBe('cube(5);');

    // Durable: the next process opening this project reads the same head.
    await expect(createBrowserRevisionPort({ filesystem }).readHead()).resolves.toMatchObject({ branch: 'main' });
  });

  it('c2-review S1: a restore to a revision no branch names leaves nothing Current', async () => {
    const { filesystem, main, mint, result } = await porcelain('project_porcelain_detached');
    // What a Restore of an older turn checks out: a revision the store holds
    // and no branch head names.
    const older = await mint({
      parents: [main],
      actorId: 'chat_tau',
      summary: 'An earlier turn',
      files: { 'main.scad': 'cube(1);' },
    });

    await act(async () => {
      await result.current.checkout(older);
    });
    await expect(filesystem.readFile('main.scad', 'utf8')).resolves.toBe('cube(1);');
    /* The pane's `activeBranch`: nothing is "The live project tree" while the
     * folder is on none of the branches. */
    await waitFor(() => {
      expect(result.current.headBranch()).toBeUndefined();
    });

    /* The head reference itself was not nulled — the next direct turn still
     * publishes onto the branch it names, which is what ends the detachment. */
    const prepared = await act(async () => result.current.prepare('chat_detached', { mode: 'direct' }));
    await result.current.markAdmitted('chat_detached', 'turn_detached');
    await prepared.workspace.filesystem.writeFile('main.scad', 'cube(2);');
    await expect(
      result.current.finalize('chat_detached', {
        actorId: 'agent-local',
        runId: 'run-detached',
        turnId: 'turn_detached',
        summary: 'Back on the trunk',
      }),
    ).resolves.toMatchObject({ status: 'finalized', finalization: { branchName: 'main' } });
    expect(result.current.headBranch()).toBe('main');
  });

  it('refuses to check out a revision this project does not hold', async () => {
    const { result } = await porcelain('project_porcelain_missing');

    await expect(result.current.checkout('0'.repeat(40))).rejects.toMatchObject({ code: 'REVISION_NOT_FOUND' });
  });

  it('diffs two revisions by path, in both directions', async () => {
    const { codex, main, result } = await porcelain('project_porcelain_diff');

    expect(result.current.diffRevisions({ from: main, to: codex })).toEqual([
      { path: 'bracket.scad', change: 'added' },
    ]);
    expect(result.current.diffRevisions({ from: codex, to: main })).toEqual([
      { path: 'bracket.scad', change: 'removed' },
    ]);
    // No base names the whole tree as new: what a branch introduced from nothing.
    expect(result.current.diffRevisions({ to: codex })).toEqual([
      { path: 'bracket.scad', change: 'added' },
      { path: 'main.scad', change: 'added' },
    ]);
  });

  it('merges a candidate branch back into main and publishes the merge revision', async () => {
    const { codex, filesystem, result } = await porcelain('project_porcelain_merge');

    const merged = await act(async () =>
      result.current.mergeBranch({
        source: 'agent/chat-codex/trun-codex',
        target: 'main',
        actorId: 'user_1',
      }),
    );

    expect(merged).toMatchObject({ status: 'merged', branchName: 'main', changedPaths: ['bracket.scad'] });
    const main = result.current.listBranches().find((entry) => entry.name === 'main');
    expect(main?.headRevisionId).toBe(merged.status === 'merged' ? merged.revisionId : undefined);
    expect(main?.summary).toBe('Merged agent/chat-codex/trun-codex into main');
    // The merge is a revision like any other: checking it out is the whole result.
    await act(async () => {
      await result.current.checkout(main!.headRevisionId);
    });
    expect(result.current.diffRevisions({ from: codex, to: main!.headRevisionId })).toEqual([]);
    // The merge revision was recorded by the recorder, into the one store.
    await expect(storedText(filesystem, main!.headRevisionId, 'bracket.scad')).resolves.toBe('cube(5);');
    await expect(filesystem.exists('.tau/workspaces/revisions')).resolves.toBe(false);
  });

  it('returns a merge conflict as a value, losing neither branch (I-CONF)', async () => {
    // Both branches edited the same path differently, from a shared base.
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    const port = createBrowserRevisionPort({ filesystem });
    const mint = async (
      parents: readonly string[],
      input: Readonly<{ actorId: string; summary: string; source: string }>,
    ): Promise<string> => {
      const { actorId, summary, source } = input;
      const receipt = await port.writeRevision({
        parents: parents.map((parent) => revisionId(parent)),
        tree: new ImmutableRevisionTree([['main.scad', source]]),
        provenance: { source: 'agent', actorId, createdAt: 1_700_000_000_000 },
        summary: { generated: summary },
      });
      return receipt.commitId;
    };
    const base = await mint([], { actorId: 'chat_tau', summary: 'Base', source: 'cube(1);' });
    const main = await mint([base], { actorId: 'chat_tau', summary: 'Tau turn', source: 'cube(30);' });
    const codex = await mint([base], { actorId: 'codex', summary: 'Codex turn', source: 'cube(20);' });
    await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(main) });
    await port.updateRef({
      name: 'agent/chat-codex/trun-codex',
      expectedHead: undefined,
      head: revisionId(codex),
    });

    hookState.projectId = 'project_porcelain_conflict';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    await waitFor(() => {
      expect(result.current.listBranches().length).toBe(2);
    });

    const conflicted = await act(async () =>
      result.current.mergeBranch({
        source: 'agent/chat-codex/trun-codex',
        target: 'main',
        actorId: 'user_1',
      }),
    );

    expect(conflicted).toEqual({
      status: 'conflicted',
      branchName: 'main',
      conflict: { type: 'merge', kind: 'text', paths: ['main.scad'] },
    });
    // Nothing was published and nothing was lost: both heads still stand.
    expect(result.current.listBranches().map((entry) => entry.headRevisionId)).toEqual([codex, main]);
  });

  it('M1: prepares a turn on a branch whose head is a merge the porcelain published', async () => {
    // The chat's own lane, which `prepare` will later descend from.
    const chatId = 'chat_m1';
    const branch = turnRevisionBranch(chatId);
    const { codex, filesystem, main } = await seededStore();
    await createBrowserRevisionPort({ filesystem }).updateRef({
      name: branch,
      expectedHead: undefined,
      head: revisionId(main),
    });
    hookState.projectId = 'project_porcelain_m1';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    await waitFor(() => {
      expect(result.current.listBranches().length).toBe(3);
    });
    expect(codex).not.toBe(main);

    const merged = await act(async () =>
      result.current.mergeBranch({
        source: 'agent/chat-codex/trun-codex',
        target: branch,
        actorId: 'user_1',
      }),
    );
    expect(merged).toMatchObject({ status: 'merged' });

    /* The merge revision has to be a real object in the store, or the next turn
     * on this lane cannot descend from it: the porcelain used to publish a
     * merge minted by the authority alone, whose `rev_*` id the recorder then
     * refused with `Invalid sha1 Git object id` (6-review M1). */
    const nextTurn = await act(async () => result.current.prepare(chatId, { mode: 'direct' }));
    expect(nextTurn.execution.baseRevisionId).toMatch(/^[\da-f]{40}$/u);
  });
});

describe('DT2 live-tree hold lifecycle', () => {
  afterEach(() => {
    browserWorkspaceAuthorityTestApi.reset();
  });

  it('M4: gives the project hold back when the claim write that would admit a writer fails', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_hold_release';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });

    await act(async () => result.current.prepare('chat_a', { mode: 'direct' }));
    const originalWriteFile = filesystem.writeFile.bind(filesystem);
    filesystem.writeFile = async (path: string, content: string | Uint8Array<ArrayBuffer>): Promise<void> => {
      if (path.startsWith('.tau/workspaces/claims/chat_a')) {
        throw Object.assign(new Error('Quota exceeded'), { code: 'QUOTA_EXCEEDED' });
      }
      return originalWriteFile(path, content);
    };
    await expect(result.current.markAdmitted('chat_a', 'turn_a')).rejects.toThrow('Quota exceeded');
    filesystem.writeFile = originalWriteFile;

    // The hold was taken before the write. Leaked, it makes every later
    // live-tree turn in this project wait out a writer that never existed.
    await expect(act(async () => result.current.prepare('chat_b', { mode: 'direct' }))).resolves.toMatchObject({
      chatId: 'chat_b',
    });
  });

  it('M3: re-takes the project hold for an admitted claim it reclaimed after a reload', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_hold_reclaim';
    hookState.fileManager = await fileManagerFor(filesystem);
    const first = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    await act(async () => first.result.current.prepare('chat_holder', { mode: 'direct' }));
    await act(async () => {
      await first.result.current.markAdmitted('chat_holder', 'turn_holder');
    });
    first.unmount();

    // A reload: the document's state and every Web Lock it held are gone, and
    // the claim on disk is all that survives.
    browserWorkspaceAuthorityTestApi.reset();
    installSerialWebLocks();
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const reclaimed = await act(async () => result.current.reclaim('chat_holder'));
    expect(reclaimed?.admitted).toBe(true);

    /* Reclaim restores `admitted` exactly as it was persisted and takes no lock
     * of its own, so after a reload an admitted live-tree writer had no hold in
     * this document and the next chat walked straight past the queue into the
     * same tree (6-review M3). */
    const queued = result.current.prepare('chat_other', { mode: 'direct' });
    await expect(
      Promise.race([
        queued.then((): 'prepared' => 'prepared'),
        new Promise<'waiting'>((resolve) => {
          globalThis.setTimeout(() => {
            resolve('waiting');
          }, 100);
        }),
      ]),
    ).resolves.toBe('waiting');

    await act(async () => {
      await result.current.discard('chat_holder');
      await queued;
    });
  });

  it('M5: keeps a queued live-tree turn from blocking its own chat claim operations', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_hold_queue';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });

    // `chat_holder` is the admitted live-tree writer, so `chat_queued` waits.
    await act(async () => result.current.prepare('chat_holder', { mode: 'direct' }));
    await act(async () => {
      await result.current.markAdmitted('chat_holder', 'turn_holder');
    });
    const queued = result.current.prepare('chat_queued', { mode: 'direct' });
    const settled = await Promise.race([
      queued.then((): 'prepared' => 'prepared'),
      new Promise<'waiting'>((resolve) => {
        globalThis.setTimeout(() => {
          resolve('waiting');
        }, 100);
      }),
    ]);
    expect(settled).toBe('waiting');

    /* The wait is `liveTreeWaitTimeout` long. Under this chat's own claim lock
     * it queued every other operation on it behind five minutes — including the
     * `reclaim` a second tab performs at mount, and the `discard` that would
     * end the wait (6-review M5). This resolves only because the wait is not
     * holding that lock.
     */
    await expect(result.current.reclaim('chat_queued')).resolves.toBeUndefined();

    // Retiring the holder lets the queued turn through.
    await act(async () => {
      await result.current.discard('chat_holder');
      await queued;
    });
    expect(result.current.get('chat_queued')?.chatId).toBe('chat_queued');
  });

  it('8-review S2: records the settled tree id, not the revision id, as the finalization tree', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_tree_id';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const prepared = await act(async () => result.current.prepare('chat_tree', { mode: 'direct' }));
    await prepared.workspace.filesystem.writeFile('main.scad', 'cube(20);');
    const settled = await act(async () =>
      result.current.finalize('chat_tree', {
        actorId: 'agent-a',
        runId: 'run-a',
        turnId: 'turn-a',
        summary: 'Tree turn',
      }),
    );
    expect(settled?.status).toBe('finalized');
    if (settled?.status !== 'finalized') {
      return;
    }
    const state = browserWorkspaceAuthorityTestApi.get({
      projectId: hookState.projectId,
      binding: authorityBinding((hookState.fileManager as { client: FileSystemClientFacade }).client, '/project'),
    });
    const revision = await state.recorder.port.readRevision(revisionId(settled.finalization.revisionId));
    // The same fact the host records: a tree id names content, a revision id names a commit.
    expect(settled.finalization.treeId).toBe(revision?.treeId);
    expect(settled.finalization.treeId).not.toBe(settled.finalization.revisionId);
  });

  it('8-review M3: a branch-mode chat settles under the project hold, never beside the live-tree writer', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_hold_settle';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });

    await act(async () => result.current.prepare('chat_holder', { mode: 'direct' }));
    await act(async () => {
      await result.current.markAdmitted('chat_holder', 'turn_holder');
    });
    const prepared = await act(async () => result.current.prepare('chat_branch', { mode: 'candidate' }));
    await prepared.workspace.filesystem.writeFile('main.scad', 'cube(20);');

    /* Settlement touches the same store the admitted writer is publishing
     * into; a chat without the hold must queue behind it (8-review M3). */
    const settling = result.current.finalize('chat_branch', {
      actorId: 'agent-b',
      runId: 'run-b',
      turnId: 'turn-b',
      summary: 'Branch turn',
    });
    await expect(
      Promise.race([
        settling.then((): 'settled' => 'settled'),
        new Promise<'waiting'>((resolve) => {
          globalThis.setTimeout(() => {
            resolve('waiting');
          }, 100);
        }),
      ]),
    ).resolves.toBe('waiting');

    await act(async () => {
      await result.current.discard('chat_holder');
      await settling;
    });
  });

  it('8-review M4: reclaims an admitted writer without waiting out a hold another document keeps', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_hold_foreign';
    hookState.fileManager = await fileManagerFor(filesystem);
    const first = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    await act(async () => first.result.current.prepare('chat_holder', { mode: 'direct' }));
    await act(async () => {
      await first.result.current.markAdmitted('chat_holder', 'turn_holder');
    });
    first.unmount();

    browserWorkspaceAuthorityTestApi.reset();
    installSerialWebLocks();
    // Another tab of the same project holds the live tree and is not letting go.
    const foreign = Promise.withResolvers<void>();
    void navigator.locks.request(
      `tau:chat-workspace-claim:${encodeURIComponent('project_hold_foreign')}:live-tree`,
      { mode: 'exclusive' },
      async () => foreign.promise,
    );
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });

    /* Reclaim runs on every reload for every persisted claim; blocking it on a
     * hold that belongs to another document stalls the whole boot (8-review M4). */
    const reclaimed = await Promise.race([
      act(async () => result.current.reclaim('chat_holder')),
      new Promise<'blocked'>((resolve) => {
        globalThis.setTimeout(() => {
          resolve('blocked');
        }, 500);
      }),
    ]);
    expect(reclaimed).not.toBe('blocked');
    expect((reclaimed as { admitted?: boolean } | undefined)?.admitted).toBe(true);
    foreign.resolve();
  });
});

describe('persisted workspace boundary validation', () => {
  afterEach(() => {
    browserWorkspaceAuthorityTestApi.reset();
  });

  it('quarantines one malformed claim without suppressing valid chat recovery', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_claim_validation';
    hookState.fileManager = await fileManagerFor(filesystem);
    const seeded = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const valid = await act(async () => seeded.result.current.prepare('chat_valid_claim'));
    await act(async () => seeded.result.current.prepare('chat_invalid_claim'));
    await filesystem.writeFile('.tau/workspaces/claims/chat_invalid_claim.json', '{"version":1');
    seeded.unmount();
    browserWorkspaceAuthorityTestApi.reset();
    const recovered = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });

    await expect(recovered.result.current.reclaimAll()).resolves.toMatchObject([
      { chatId: 'chat_valid_claim', execution: { workspaceId: valid.execution.workspaceId } },
    ]);
    await expect(filesystem.exists('.tau/workspaces/claims/chat_invalid_claim.json')).resolves.toBe(false);
  });

  it('hydrates valid publications while quarantining a malformed sibling record', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    await filesystem.mkdir('.tau/workspaces/publications', { recursive: true });
    await filesystem.writeFile(
      '.tau/workspaces/publications/workspace_valid.json',
      JSON.stringify({
        turnId: 'turn_valid',
        revisionId: 'revision_valid',
        baseRevisionId: 'revision_base',
        treeId: 'revision_valid',
        branchName: 'agent/chat_valid/workspace_valid',
        publication: {
          status: 'updated',
          branchName: 'agent/chat_valid/workspace_valid',
          expectedHeadRevisionId: 'revision_base',
          headRevisionId: 'revision_valid',
        },
        changedPaths: ['main.scad'],
        provenance: { source: 'agent', actorId: 'agent-valid', runId: 'run-valid', createdAt: 1 },
        generatedSummary: 'Valid publication',
        chatId: 'chat_valid',
        jobIds: [],
        workspaceId: 'workspace_valid',
        nativeGit: { status: 'not-configured' },
        projectId: 'project_publication_validation',
        runId: 'run-valid',
      }),
    );
    await filesystem.writeFile('.tau/workspaces/publications/workspace_invalid.json', '{');
    hookState.projectId = 'project_publication_validation';
    hookState.fileManager = await fileManagerFor(filesystem);
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });

    await waitFor(() => {
      expect(result.current.listFinalized()).toMatchObject([
        { chatId: 'chat_valid', workspaceId: 'workspace_valid', revisionId: 'revision_valid' },
      ]);
    });
    await expect(filesystem.exists('.tau/workspaces/publications/workspace_invalid.json')).resolves.toBe(false);
  });
});

describe('background workspace reclaim', () => {
  afterEach(() => {
    browserWorkspaceAuthorityTestApi.reset();
  });

  it('contains an unavailable rooted bridge rejection', async () => {
    const syncProjectRoots = vi.fn().mockResolvedValue(undefined);
    const openFileSystemBridge = vi.fn(() => {
      throw new Error('Rooted filesystem bridge is unavailable.');
    });
    hookState.projectId = 'project_unavailable';
    hookState.fileManager = {
      client: client(vi.fn().mockResolvedValue(false)),
      backendType: 'memory',
      workspace: { syncProjectRoots },
      fileManagerRef: {
        getSnapshot: () => ({
          context: { rootDirectory: '/project', proxy: {}, openFileSystemBridge },
        }),
      },
    };
    const unhandled = vi.fn();
    globalThis.addEventListener('unhandledrejection', unhandled);

    try {
      const { result } = renderHook(() => usePreparedChatWorkspace('chat_unavailable'), {
        wrapper: authorityWrapper,
      });

      await waitFor(() => {
        expect(openFileSystemBridge).toHaveBeenCalledOnce();
      });
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 0);
      });
      expect(result.current).toBeUndefined();
      expect(syncProjectRoots).toHaveBeenCalledOnce();
      expect(syncProjectRoots.mock.invocationCallOrder[0]).toBeLessThan(
        openFileSystemBridge.mock.invocationCallOrder[0]!,
      );
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      globalThis.removeEventListener('unhandledrejection', unhandled);
    }
  });

  it('retries reclaim reactively when the rooted bridge opener becomes ready after mount', async () => {
    const filesystem = memoryFileSystem({ 'main.scad': 'cube(10);' });
    hookState.projectId = 'project_late_bridge';
    const ready = (await fileManagerFor(filesystem)) as {
      readonly client: FileSystemClientFacade;
      readonly backendType: 'memory';
      readonly workspace: { readonly syncProjectRoots: () => Promise<void> };
      readonly fileManagerRef: {
        readonly getSnapshot: () => {
          readonly context: {
            readonly rootDirectory: string;
            readonly proxy: unknown;
            readonly openFileSystemBridge: () => { readonly port: MessagePort; dispose(): void };
          };
        };
      };
    };
    hookState.fileManager = ready;
    const seeded = renderHook(() => useChatWorkspaceAuthority(), { wrapper: authorityWrapper });
    const expected = await act(async () => seeded.result.current.prepare('chat_late_bridge'));
    seeded.unmount();
    browserWorkspaceAuthorityTestApi.reset();
    const readyContext = ready.fileManagerRef.getSnapshot().context;
    let context: Omit<typeof readyContext, 'openFileSystemBridge'> & {
      openFileSystemBridge?: typeof readyContext.openFileSystemBridge;
    } = {
      rootDirectory: readyContext.rootDirectory,
      proxy: readyContext.proxy,
    };
    const listeners = new Set<(state: { readonly context: typeof context }) => void>();
    const syncProjectRoots = vi.fn().mockResolvedValue(undefined);
    hookState.fileManager = {
      ...ready,
      workspace: { syncProjectRoots },
      fileManagerRef: {
        getSnapshot: () => ({ context }),
        subscribe: (listener: (state: { readonly context: typeof context }) => void) => {
          listeners.add(listener);
          return { unsubscribe: () => listeners.delete(listener) };
        },
      },
    };
    const recovered = renderHook(() => usePreparedChatWorkspace('chat_late_bridge'), { wrapper: authorityWrapper });
    await waitFor(() => {
      expect(syncProjectRoots).toHaveBeenCalledOnce();
    });
    expect(recovered.result.current).toBeUndefined();

    context = { ...context, openFileSystemBridge: readyContext.openFileSystemBridge };
    for (const listener of listeners) {
      listener({ context });
    }

    await waitFor(() => {
      expect(recovered.result.current?.execution.workspaceId).toBe(expected.execution.workspaceId);
    });
  });
});
