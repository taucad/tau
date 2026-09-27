/**
 * What the page still owns of a chat's turns after W8 (TS-S5, TS-S6).
 *
 * The resident agent host places and settles every turn through the worker's
 * revision root; the page records the person's choice of checkout on the chat
 * record, rereads the chats a fetch projected, and adopts a daemon's recorded
 * head into its projection. Placement and settlement themselves are proved in
 * `app/machines/file-manager.worker.revisions.test.ts` and
 * `packages/revisions/src/turn-placement.test.ts`.
 */

import { createElement } from 'react';
import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import {
  ChatWorkspaceAuthorityProvider,
  readRootedBridgeCapabilities,
  useChatWorkspaceAuthority,
  waitForRootedBridgeOpener,
} from '#providers/chat-workspace-authority-provider.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { WorkerRevisionCommand, WorkerRevisionEvent } from '#machines/file-manager.worker.revisions.js';

const hookState = vi.hoisted(() => ({
  projectId: 'project_test',
  invalidateProjectedChats: vi.fn(),
  refreshFromStorage: vi.fn(async () => undefined),
  patchChat: vi.fn(async (_chatId: string, _key: string, _value: unknown): Promise<undefined> => undefined),
}));
const revisionRoot = vi.hoisted(() => ({
  commands: [] as WorkerRevisionCommand[],
  /** Listeners the provider registered for the root's events. */
  eventListeners: new Set<(event: WorkerRevisionEvent) => void>(),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: hookState.projectId }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    invalidateProjectedChats: hookState.invalidateProjectedChats,
    patchChat: hookState.patchChat,
  }),
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({ refreshFromStorage: hookState.refreshFromStorage }),
}));
vi.mock('#hooks/use-revision-status.js', () => {
  /* One client for the whole file, as the real hook memoizes on project and worker. */
  const stableClient = {
    status: () => ({ checkoutId: 'checkout-durable', headRevisionId: 'rev-base' }),
    subscribeEvents: (listener: (event: WorkerRevisionEvent) => void) => {
      revisionRoot.eventListeners.add(listener);
      return () => revisionRoot.eventListeners.delete(listener);
    },
    send: (command: WorkerRevisionCommand) => revisionRoot.commands.push(command),
  };
  return { useRevisionClient: () => stableClient };
});

const wrapper =
  () =>
  ({ children }: PropsWithChildren): React.JSX.Element =>
    createElement(ChatWorkspaceAuthorityProvider, undefined, children);

beforeEach(() => {
  hookState.invalidateProjectedChats.mockClear();
  hookState.refreshFromStorage.mockClear();
  hookState.patchChat.mockClear();
  revisionRoot.commands.length = 0;
});

describe('ChatWorkspaceAuthorityProvider', () => {
  it('should reread the chats a remote fetch projected', async () => {
    renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    for (const listener of revisionRoot.eventListeners) {
      listener({ type: 'chats.projected', projectId: 'project_test', chatIds: ['chat_remote'] });
    }

    await waitFor(() => {
      expect(hookState.refreshFromStorage).toHaveBeenCalledWith('chat_remote');
    });
    expect(hookState.invalidateProjectedChats).toHaveBeenCalledWith('project_test', ['chat_remote']);
  });

  it('should adopt a finalized daemon turn into the browser revision projection', async () => {
    const transport = await import('#chat-clients/_internal/browser-agent-host-transport.js');

    act(() => {
      transport.recordHostTurnSettlement({
        type: 'turn.finalized',
        turnId: 'turn_daemon',
        runId: 'run_daemon',
        chatId: 'chat_daemon',
        projectId: 'project_test',
        checkoutId: 'live',
        revisionId: 'rev-daemon',
        treeId: 'tree-daemon',
        branch: 'main',
        changedPaths: ['main.scad'],
        trigger: 'turn',
        runIds: ['run_daemon'],
      });
    });
    /* A seeded turn can settle while the project is still being renamed. The
     * final project provider mounts afterward and must replay that retained
     * settlement rather than waiting for another turn. */
    renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    expect(revisionRoot.commands).toContainEqual({
      command: 'adoptHostFinalized',
      checkoutId: 'live',
      revisionId: 'rev-daemon',
      treeId: 'tree-daemon',
      branch: 'main',
    });
  });

  it('should write a chat’s checkout once when it is placed by id', async () => {
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    await act(async () => result.current.placeChat('chat_1', 'checkout-branch'));

    expect(hookState.patchChat.mock.calls).toEqual([['chat_1', 'checkoutId', 'checkout-branch']]);
  });

  /* Lane x1 §1: the seeded chat's checkout lived only in the in-memory
     conflict map, so a reload dropped that chat onto the live checkout. The
     conflict's terms ride one turn; its placement is durable. */
  it('should persist the checkout a conflict chat is seeded onto', async () => {
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    act(() => {
      result.current.bindConflict('chat_fix', {
        revisionId: 'rev-conflicted',
        paths: ['src/bracket.ts'],
        checkoutId: 'checkout-fillet',
      });
    });

    await waitFor(() => {
      expect(hookState.patchChat.mock.calls).toEqual([['chat_fix', 'checkoutId', 'checkout-fillet']]);
    });
  });

  /* Lane x1 §1: the seeded chat's checkout lived only in the in-memory
     conflict map, so a reload dropped that chat onto the live checkout. The
     conflict's terms ride one turn; its placement is durable. */
  it('should persist the checkout a conflict chat is seeded onto', async () => {
    const { result } = renderHook(() => useChatWorkspaceAuthority(), { wrapper: wrapper() });

    act(() => {
      result.current.bindConflict('chat_fix', {
        revisionId: 'rev-conflicted',
        paths: ['src/bracket.ts'],
        checkoutId: 'checkout-fillet',
      });
    });

    await waitFor(() => {
      expect(hookState.patchChat.mock.calls).toEqual([['chat_fix', 'checkoutId', 'checkout-fillet']]);
    });
  });
});

describe('readRootedBridgeCapabilities', () => {
  it('should read the selected provider capabilities from the rooted bridge hello', async () => {
    const provider = new MemoryProvider();
    const mountTable = new MountTable();
    mountTable.mount('/projects/project_test', provider, {
      class: 'authored',
      backend: 'memory',
      storageRootKey: 'memory:provider-test',
    });
    const eventBus = new ChangeEventBus();
    const service = new WorkspaceFileService({
      providerRegistry: new ProviderRegistry(),
      resourceQueue: new ResourceQueue(),
      eventBus,
      mountTable,
    });
    const { watch: _watch, ...handlers } = service.createRootedFileSystem('/projects/project_test');
    try {
      await expect(
        readRootedBridgeCapabilities(() =>
          createFileSystemBridgePort(handlers as Parameters<typeof createFileSystemBridgePort>[0]),
        ),
      ).resolves.toMatchObject({ writable: true });
    } finally {
      service.dispose();
      provider.dispose();
      eventBus.dispose();
    }
  });
});

describe('waitForRootedBridgeOpener', () => {
  type FileManagerSnapshot = ReturnType<FileManagerRef['getSnapshot']>;

  /** A file-manager actor that never mints the opener, with the context a test dictates. */
  const openerlessFileManager = (error?: Error): FileManagerRef =>
    mock<FileManagerRef>({
      getSnapshot: () =>
        mock<FileManagerSnapshot>({
          context: mock<FileManagerSnapshot['context']>({ error, openFileSystemBridge: undefined }),
        }),
      subscribe: () => ({ unsubscribe: () => undefined }),
    });

  it('should reject the rooted bridge wait when the file manager fails', async () => {
    await expect(waitForRootedBridgeOpener(openerlessFileManager(new Error('worker crashed')))).rejects.toThrow(
      'worker crashed',
    );
  });

  it('should reject the rooted bridge wait when no opener arrives within the timeout', async () => {
    vi.useFakeTimers();
    try {
      const pending = expect(waitForRootedBridgeOpener(openerlessFileManager())).rejects.toThrow(
        'did not finish starting',
      );

      await vi.advanceTimersByTimeAsync(30_000);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });
});
