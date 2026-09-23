// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- mock for AI SDK's Chat class uses the SDK's own `~`-prefixed subscriber method names verbatim so the mock surface matches the real one. */
/* eslint-disable @typescript-eslint/explicit-member-accessibility -- mock class constructor omits the `public` keyword to mirror the AI SDK's published shape. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { useSelector } from '@xstate/react';
import type { ReactNode } from 'react';
import type { Chat, MyUIMessage } from '@taucad/chat';
import { resolveKernel } from '@taucad/types/constants';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { DraftAttachmentModel } from '#hooks/draft.machine.js';

// ---------------------------------------------------------------------------
// Hoisted harness — mocks the project-manager surface (chat row persistence),
// the AI SDK `Chat` class (with subscriber-callback emit helpers so tests
// can drive `useChatSessionSnapshot` re-renders), the cookie hooks
// (`useModels` / `useKernel`) for stable strategy-helper input, and the
// resize actor for the image-resize toast subscriber assertions.
// ---------------------------------------------------------------------------

type FakeChat = {
  id: string;
  messages: MyUIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  error: Error | undefined;
  emitMessagesChange: () => void;
  emitStatusChange: () => void;
  emitErrorChange: () => void;
};

const harness = vi.hoisted(() => ({
  created: [] as FakeChat[],
  patchChat: vi.fn(),
  touchChatRecency: vi.fn(),
  getChat: vi.fn(),
  consumeChatStartupRequest: vi.fn(),
  commitCancelledDraftRestore: vi.fn(),
  toastError: vi.fn(),
  resize: vi.fn<(image: string) => Promise<string>>(),
  setSelectedModelId: vi.fn(),
  selectedModelId: 'cookie-model',
  selectedModelName: 'Cookie Model',
  setKernel: vi.fn(),
  cookieKernel: 'openscad' as 'openscad' | 'manifold' | 'replicad',
  homeFiles: new Map<string, Uint8Array<ArrayBuffer>>(),
  homeReadFile: vi.fn<(path: string) => Promise<Uint8Array<ArrayBuffer>>>(),
  homeWriteFile: vi.fn<(path: string, bytes: Uint8Array<ArrayBuffer>) => Promise<void>>(),
}));

vi.mock('@ai-sdk/react', () => ({
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- mock requires a `new`able value
  Chat: class {
    public id: string;
    public messages: MyUIMessage[] = [];
    public status: 'submitted' | 'streaming' | 'ready' | 'error' = 'ready';
    public error: Error | undefined = undefined;
    public sendMessage = vi.fn().mockResolvedValue(undefined);
    public regenerate = vi.fn().mockResolvedValue(undefined);
    public stop = vi.fn().mockResolvedValue(undefined);
    public makeRequest = vi.fn().mockResolvedValue(undefined);
    public resumeStream = vi.fn().mockResolvedValue(undefined);
    readonly #messagesListeners = new Set<() => void>();
    readonly #statusListeners = new Set<() => void>();
    readonly #errorListeners = new Set<() => void>();

    constructor(init: { id: string; messages?: MyUIMessage[] }) {
      this.id = init.id;
      this.messages = init.messages ?? [];
      const fake: FakeChat = Object.assign(this, {
        emitMessagesChange: () => {
          for (const l of this.#messagesListeners) {
            l();
          }
        },
        emitStatusChange: () => {
          for (const l of this.#statusListeners) {
            l();
          }
        },
        emitErrorChange: () => {
          for (const l of this.#errorListeners) {
            l();
          }
        },
      });
      harness.created.push(fake);
    }

    public '~registerMessagesCallback' = (onChange: () => void): (() => void) => {
      this.#messagesListeners.add(onChange);
      return () => {
        this.#messagesListeners.delete(onChange);
      };
    };

    public '~registerStatusCallback' = (onChange: () => void): (() => void) => {
      this.#statusListeners.add(onChange);
      return () => {
        this.#statusListeners.delete(onChange);
      };
    };

    public '~registerErrorCallback' = (onChange: () => void): (() => void) => {
      this.#errorListeners.add(onChange);
      return () => {
        this.#errorListeners.delete(onChange);
      };
    };
  },
}));

vi.mock('ai', () => ({
  // oxlint-disable-next-line typescript-eslint/no-extraneous-class -- mock requires a `new`able value
  DefaultChatTransport: class {},
  lastAssistantMessageIsCompleteWithApprovalResponses: vi.fn(),
  isStaticToolUIPart: () => false,
  safeValidateUIMessages: async ({ messages }: { messages: MyUIMessage[] }) => ({ success: true, data: messages }),
}));

vi.mock('#environment.config.js', () => ({
  ENV: { TAU_API_URL: 'http://test.local' },
}));

vi.mock('#machines/inspector.js', () => ({
  inspect: undefined,
}));

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    patchChat: harness.patchChat,
    touchChatRecency: harness.touchChatRecency,
    getChat: harness.getChat,
    consumeChatStartupRequest: harness.consumeChatStartupRequest,
    commitCancelledDraftRestore: harness.commitCancelledDraftRestore,
  }),
}));

vi.mock('#components/ui/sonner.js', () => ({
  toast: {
    error: harness.toastError,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('#hooks/resize-image.actor.js', () => ({
  resizeImageActor: fromSafeAsync<
    { type: 'imageResized'; resized: string },
    { image: string; preserveOriginal: boolean }
  >(async ({ input }) => {
    const resized = await harness.resize(input.image);
    return { type: 'imageResized', resized };
  }),
}));

// Mirror the real `useModels` shape with referentially-stable returns so
// strategy-helper `useMemo` dependencies behave the same in tests as in
// production. Without this, the strategy hooks would synthesise a fresh
// `model` object on every render and the stability tests would fail.
const resolvedModelCache = new Map<string, unknown>();
function stableResolvedModel(id: string, name: string): unknown {
  const key = `${id}|${name}`;
  let cached = resolvedModelCache.get(key);
  if (!cached) {
    cached = {
      id,
      name,
      family: 'unknown',
      provider: { id: 'unknown', name: 'Unknown' },
      isResolved: true,
    };
    resolvedModelCache.set(key, cached);
  }
  return cached;
}
const stableResolveModel = (id: string): unknown =>
  stableResolvedModel(id, id === harness.selectedModelId ? harness.selectedModelName : id);
const useModelsReturnCache = new Map<string, unknown>();
function getStableUseModelsReturn(): unknown {
  const key = `${harness.selectedModelId}|${harness.selectedModelName}`;
  let cached = useModelsReturnCache.get(key);
  if (!cached) {
    cached = {
      selectedModelId: harness.selectedModelId,
      setSelectedModelId: harness.setSelectedModelId,
      selectedModel: stableResolvedModel(harness.selectedModelId, harness.selectedModelName),
      resolveModel: stableResolveModel,
      data: [],
      isLoading: false,
    };
    useModelsReturnCache.set(key, cached);
  }
  return cached;
}
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => getStableUseModelsReturn(),
}));

vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => ({
    kernel: harness.cookieKernel,
    setKernel: harness.setKernel,
    selectedKernel: resolveKernel(harness.cookieKernel),
  }),
}));

vi.mock('#hooks/use-file-manager.js', () => {
  /*
   * An in-memory Home workspace: the composer record and its attachment
   * directory. `homeReadFile` / `homeWriteFile` wrap it so a row can stall or
   * fail one call without replacing the store.
   */
  const notFound = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  const client = {
    readFile: async (path: string, encoding?: 'utf8') => {
      const bytes = await harness.homeReadFile(path);
      return encoding === 'utf8' ? new TextDecoder().decode(bytes) : bytes;
    },
    writeFile: async (path: string, data: string | Uint8Array<ArrayBuffer>) =>
      harness.homeWriteFile(path, typeof data === 'string' ? new TextEncoder().encode(data) : data),
    exists: async (path: string) => harness.homeFiles.has(path),
    readdir: async (path: string) => {
      const names = [...harness.homeFiles.keys()]
        .filter((entry) => entry.startsWith(`${path}/`))
        .map((entry) => entry.slice(path.length + 1));
      if (names.length === 0) {
        throw notFound(path);
      }
      return names;
    },
    unlink: async (path: string) => {
      harness.homeFiles.delete(path);
    },
    rmdir: async (path: string) => {
      for (const entry of [...harness.homeFiles.keys()].filter((key) => key.startsWith(`${path}/`))) {
        harness.homeFiles.delete(entry);
      }
    },
  };
  return { useFileManager: () => ({ recordFiles: client }) };
});

const {
  ActiveChatProvider,
  ChatComposerProvider,
  HomeNewProjectComposerProvider,
  useActiveChatSession,
  useChatComposer,
} = await import('#hooks/active-chat-provider.js');
const { ChatSessionStoreProvider } = await import('#hooks/chat-session-store-provider.js');
const { UnloadProvider, useFlushOnClose } = await import('#hooks/use-flush-on-close.js');

const testModel: DraftAttachmentModel = {
  name: 'Test Model',
  support: { modalities: { input: ['text', 'image', 'pdf'], output: ['text'] } },
};

function makeChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: 'chat_default',
    resourceId: 'home',
    name: '',
    messages: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function createSessionWrapper(chatId: string) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ChatSessionStoreProvider>
        <ActiveChatProvider chatId={chatId}>{children}</ActiveChatProvider>
      </ChatSessionStoreProvider>
    );
  };
}

function createComposerWrapper() {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ChatSessionStoreProvider>
        <ChatComposerProvider surface='marketing'>{children}</ChatComposerProvider>
      </ChatSessionStoreProvider>
    );
  };
}

function createHomeWrapper() {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <StrictMode>
        <UnloadProvider>
          <HomeNewProjectComposerProvider>{children}</HomeNewProjectComposerProvider>
        </UnloadProvider>
      </StrictMode>
    );
  };
}

beforeEach(() => {
  harness.created = [];
  harness.patchChat.mockReset().mockResolvedValue(undefined);
  harness.touchChatRecency.mockReset().mockResolvedValue(undefined);
  harness.getChat.mockReset().mockResolvedValue(undefined);
  harness.consumeChatStartupRequest.mockReset().mockResolvedValue(undefined);
  harness.commitCancelledDraftRestore.mockReset().mockResolvedValue(undefined);
  harness.toastError.mockReset();
  harness.resize.mockReset().mockImplementation(async (image: string) => image);
  harness.setSelectedModelId.mockReset();
  harness.selectedModelId = 'cookie-model';
  harness.selectedModelName = 'Cookie Model';
  harness.setKernel.mockReset();
  harness.cookieKernel = 'openscad';
  harness.homeFiles.clear();
  harness.homeReadFile.mockReset().mockImplementation(async (path: string) => {
    const bytes = harness.homeFiles.get(path);
    if (bytes === undefined) {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    }
    return bytes;
  });
  harness.homeWriteFile.mockReset().mockImplementation(async (path: string, bytes: Uint8Array<ArrayBuffer>) => {
    harness.homeFiles.set(path, bytes);
  });
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ===========================================================================
// ChatComposerProvider — composer-only contract
// ===========================================================================
describe('ChatComposerProvider', () => {
  it('should expose a draftActorRef via useChatComposer', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.draftActorRef).toBeDefined();
  });

  it('should populate status as constant `ready` (no session to stream)', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.status).toBe('ready');
  });

  it('should expose a no-op `stop` callback that does not throw', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(typeof result.current.stop).toBe('function');
    expect(() => {
      result.current.stop();
    }).not.toThrow();
  });

  it('should keep the `stop` callback referentially stable across rerenders', () => {
    const { result, rerender } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    const first = result.current.stop;
    rerender();
    expect(result.current.stop).toBe(first);
  });

  it('should report contextUsage as undefined (no message history)', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.contextUsage).toBeUndefined();
  });

  it('should report session as undefined', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.session).toBeUndefined();
  });

  it('should expose the cookie-resolved model', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.model.modelId).toBe('cookie-model');
    expect(result.current.model.model.id).toBe('cookie-model');
  });

  /*
   * `<NewProjectChatComposer>` seeds a created chat with this execution
   * verbatim, so what it tracks is what a project started from the marketing
   * hero, the final CTA or the empty library runs on. There is no agent chip on
   * those surfaces (both textareas gate it on `session`), so the browser host at
   * the cookie model is the whole contract.
   */
  it('should expose an execution tracking the cookie model on this browser’s own host', () => {
    const { result, rerender } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.execution.execution).toEqual({ kind: 'tau', model: 'cookie-model' });

    harness.selectedModelId = 'new-model';
    rerender();

    expect(result.current.execution.execution).toEqual({ kind: 'tau', model: 'new-model' });
  });

  it('should expose the cookie-resolved kernel', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    expect(result.current.kernel.kernelId).toBe('openscad');
    expect(result.current.kernel.kernel.id).toBe('openscad');
  });

  it('should write only the cookie when setActiveModel is called (no chat row to patch)', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    act(() => {
      result.current.model.setActiveModel('new-model');
    });

    expect(harness.setSelectedModelId).toHaveBeenCalledWith('new-model');
    expect(harness.patchChat).not.toHaveBeenCalled();
  });

  it('should write only the cookie when setActiveKernel is called', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    act(() => {
      result.current.kernel.setActiveKernel('manifold');
    });

    expect(harness.setKernel).toHaveBeenCalledWith('manifold');
    expect(harness.patchChat).not.toHaveBeenCalled();
  });

  it('should NOT invoke getChat (no session acquisition)', async () => {
    renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(harness.getChat).not.toHaveBeenCalled();
  });

  it('should NOT persist the draft when no chat session is bound (ephemeral mode)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createComposerWrapper(),
    });

    act(() => {
      result.current.draftActorRef.send({ type: 'setDraftText', text: 'hello ephemeral' });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(harness.patchChat).not.toHaveBeenCalled();
  });

  it('should throw with a descriptive message when useChatComposer is used outside both providers', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => renderHook(() => useChatComposer())).toThrow(/composer/i);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('should throw when useActiveChatSession is used under ChatComposerProvider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => renderHook(() => useActiveChatSession(), { wrapper: createComposerWrapper() })).toThrow(
        /activechatprovider/i,
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  describe('imageResizeFailed toast subscriber', () => {
    it('should emit toast.error when the draft actor emits imageResizeFailed', async () => {
      harness.resize.mockRejectedValueOnce(new Error('boom'));

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createComposerWrapper(),
      });

      act(() => {
        result.current.draftActorRef.send({
          type: 'addDraftAttachment',
          dataUrl: 'data:image/png;base64,raw',
          model: testModel,
        });
      });

      await waitFor(() => {
        expect(harness.toastError).toHaveBeenCalledOnce();
      });
      expect(harness.toastError).toHaveBeenCalledWith('Failed to process image', expect.any(Object));
    });

    it('should unsubscribe the toast listener on unmount', async () => {
      let rejectResize!: (error: Error) => void;
      harness.resize.mockImplementationOnce(
        async () =>
          new Promise<string>((_resolve, reject) => {
            rejectResize = reject;
          }),
      );

      const { result, unmount } = renderHook(() => useChatComposer(), {
        wrapper: createComposerWrapper(),
      });

      act(() => {
        result.current.draftActorRef.send({
          type: 'addDraftAttachment',
          dataUrl: 'data:image/png;base64,raw',
          model: testModel,
        });
      });

      unmount();

      rejectResize(new Error('post-unmount failure'));

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });

      expect(harness.toastError).not.toHaveBeenCalled();
    });
  });
});

const recordPath = '/.tau/composers/new-project.json';
const homeAttachments = '/.tau/composers/new-project/attachments';
const pngDataUrl = 'data:image/png;base64,iVBORw0KGgo=';

const chatRecordPath = (projectId: string, chatId: string): string =>
  `/.tau/composers/chats/${projectId}/${chatId}.json`;
const writeRecord = (record: unknown, path = recordPath): void => {
  harness.homeFiles.set(path, new TextEncoder().encode(JSON.stringify(record)));
};
const readRecord = (path = recordPath): Record<string, unknown> | undefined => {
  const bytes = harness.homeFiles.get(path);
  return bytes === undefined ? undefined : (JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>);
};
const textDraft = (text: string): MyUIMessage => ({
  id: 'draft',
  role: 'user',
  metadata: { createdAt: 1, status: 'pending' },
  parts: [{ type: 'text', text }],
});
const homeAttachmentNames = (): string[] =>
  [...harness.homeFiles.keys()].filter((path) => path.startsWith(`${homeAttachments}/`));

/** A read the row settles by hand, so it can act while the record is still loading. */
const deferRecordRead = (): (() => void) => {
  const settled = Promise.withResolvers<void>();
  const read = harness.homeReadFile.getMockImplementation()!;
  harness.homeReadFile.mockImplementation(async (path) => {
    if (path === recordPath) {
      await settled.promise;
    }
    return read(path);
  });
  return () => {
    settled.resolve();
  };
};

function HomeProbe({ onRender }: { readonly onRender: (draftText: string) => void }) {
  const { draftActorRef } = useChatComposer();
  const draftText = useSelector(draftActorRef, (snapshot) => snapshot.context.draftText);
  onRender(draftText);
  return <p data-testid='home-composer'>ready</p>;
}

describe('HomeNewProjectComposerProvider', () => {
  it('mounts an empty selectable composer without acquiring a chat when the file is absent', async () => {
    const { result } = renderHook(() => useChatComposer(), { wrapper: createHomeWrapper() });
    await waitFor(() => {
      expect(harness.homeReadFile).toHaveBeenCalledWith(recordPath);
    });
    expect(result.current.draftActorRef.getSnapshot().context.draftText).toBe('');
    expect(result.current.canSelectExecution).toBe(true);
    expect(result.current.session).toBeUndefined();
    expect(harness.getChat).not.toHaveBeenCalled();
    expect(harness.homeWriteFile).not.toHaveBeenCalled();
  });

  // New (W6): the composer is interactive before, during and after the read — there is no loader to render.
  it('renders the composer on every render of the lifecycle, before the record resolves', async () => {
    const release = deferRecordRead();
    writeRecord({ version: 1, draft: textDraft('stored') });
    const texts: string[] = [];
    const view = render(
      <StrictMode>
        <UnloadProvider>
          <HomeNewProjectComposerProvider>
            <HomeProbe onRender={(text) => texts.push(text)} />
          </HomeNewProjectComposerProvider>
        </UnloadProvider>
      </StrictMode>,
    );

    expect(view.getByTestId('home-composer')).toBeInTheDocument();
    expect(view.container.textContent).toBe('ready');
    await act(async () => {
      release();
    });
    await waitFor(() => {
      expect(texts.at(-1) ?? '').toBe('stored');
    });
    // The first render already held the composer; nothing but it was ever in the tree.
    expect(texts[0]).toBe('');
    expect(view.container.textContent).toBe('ready');
  });

  it('hydrates the draft and ACP execution from the exact Home record', async () => {
    writeRecord({
      version: 1,
      draft: textDraft('restored from Home'),
      execution: { kind: 'acp', hostId: 'origin', agentId: 'codex' },
    });
    const { result } = renderHook(() => useChatComposer(), { wrapper: createHomeWrapper() });
    await waitFor(() => {
      expect(result.current.draftActorRef.getSnapshot().context.draftText).toBe('restored from Home');
    });
    expect(result.current.execution.execution).toEqual({ kind: 'acp', hostId: 'origin', agentId: 'codex' });
    expect(harness.homeReadFile).toHaveBeenCalledWith(recordPath);
  });

  it('should keep a keystroke typed just before the Home composer unmounts (R9)', async () => {
    const { result, unmount } = renderHook(() => useChatComposer(), { wrapper: createHomeWrapper() });
    await waitFor(() => {
      expect(harness.homeReadFile).toHaveBeenCalledWith(recordPath);
    });

    act(() => {
      result.current.draftActorRef.send({ type: 'setDraftText', text: 'typed then navigated' });
    });
    unmount();

    await waitFor(() => {
      expect(readRecord()).toMatchObject({ draft: { parts: [{ type: 'text', text: 'typed then navigated' }] } });
    });
  });

  it('should write the Home draft before session close preparation runs (R9)', async () => {
    const seenBySession: unknown[] = [];
    const { result } = renderHook(
      () => {
        useFlushOnClose(
          () => {
            seenBySession.push(readRecord());
          },
          { stage: 'session' },
        );
        return useChatComposer();
      },
      { wrapper: createHomeWrapper() },
    );
    await waitFor(() => {
      expect(harness.homeReadFile).toHaveBeenCalledWith(recordPath);
    });
    act(() => {
      result.current.draftActorRef.send({ type: 'setDraftText', text: 'typed then hidden' });
    });

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(seenBySession).toHaveLength(1);
    });
    expect(seenBySession[0]).toMatchObject({ draft: { parts: [{ type: 'text', text: 'typed then hidden' }] } });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });

  it('should hydrate the Home mode and tool choice from its record (R2)', async () => {
    writeRecord({ version: 1, toolChoice: 'none', mode: 'plan' });
    const { result } = renderHook(() => useChatComposer(), { wrapper: createHomeWrapper() });
    await waitFor(() => {
      expect(result.current.draftActorRef.getSnapshot().context).toMatchObject({
        draftMode: 'plan',
        draftToolChoice: 'none',
      });
    });
  });

  // New (W6, D7): a late read applies only to what the user has not touched; what was typed reaches the record on its own.
  it('never overwrites typing or an execution chosen before the record resolves', async () => {
    const release = deferRecordRead();
    writeRecord({
      version: 1,
      draft: textDraft('stale draft'),
      execution: { kind: 'acp', hostId: 'origin', agentId: 'codex' },
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useChatComposer(), { wrapper: createHomeWrapper() });

    act(() => {
      result.current.draftActorRef.send({ type: 'setDraftText', text: 'typed first' });
      result.current.execution.setActiveExecution({ kind: 'tau', model: 'picked-model' });
    });
    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(250);
    });

    await waitFor(() => {
      expect(readRecord()).toMatchObject({
        draft: { parts: [{ type: 'text', text: 'typed first' }] },
        execution: { kind: 'tau', model: 'picked-model' },
      });
    });
    expect(result.current.draftActorRef.getSnapshot().context.draftText).toBe('typed first');
    expect(result.current.execution.execution).toEqual({ kind: 'tau', model: 'picked-model' });
  });

  // Rewritten (W6): the shared record toast replaces the provider's own console.error + toast; still exactly one.
  it.each([
    ['invalid bytes', async () => new TextEncoder().encode('{')],
    [
      'read failure',
      async () => {
        throw Object.assign(new Error('offline'), { code: 'EIO' });
      },
    ],
  ])('mounts a usable composer and toasts once after %s', async (_name, read) => {
    harness.homeReadFile.mockImplementation(read);
    const { result } = renderHook(() => useChatComposer(), { wrapper: createHomeWrapper() });
    await waitFor(() => {
      expect(harness.toastError).toHaveBeenCalled();
    });
    expect(result.current.draftActorRef.getSnapshot().context.draftText).toBe('');
    expect(result.current.status).toBe('ready');
    expect(harness.toastError).toHaveBeenCalledOnce();
    expect(harness.toastError).toHaveBeenCalledWith('Could not restore your draft', expect.any(Object));
  });

  it('persists edits and awaits a draft-only clear while retaining execution', async () => {
    writeRecord({ version: 1, execution: { kind: 'tau', model: 'cookie-model', hostId: 'desktop' } });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useChatComposer(), { wrapper: createHomeWrapper() });
    await waitFor(() => {
      expect(result.current.execution.execution).toMatchObject({ hostId: 'desktop' });
    });
    act(() => {
      result.current.draftActorRef.send({ type: 'setDraftText', text: 'persist me' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await waitFor(() => {
      expect(readRecord()).toMatchObject({ draft: { parts: [{ type: 'text', text: 'persist me' }] } });
    });
    await act(async () => result.current.consumeDraft());
    // Rewritten (W4 semantics): a clear resets tool choice as a touched field, so its default is written too.
    expect(readRecord()).toEqual({
      version: 1,
      toolChoice: 'auto',
      execution: { kind: 'tau', model: 'cookie-model', hostId: 'desktop' },
    });
  });

  // Rewritten (W6): the failure is now reported by the shared record toast, not a provider catch.
  it('clears local draft state and resolves when the durable clear fails', async () => {
    writeRecord({ version: 1, draft: textDraft('already created') });
    const { result } = renderHook(() => useChatComposer(), { wrapper: createHomeWrapper() });
    await waitFor(() => {
      expect(result.current.draftActorRef.getSnapshot().context.draftText).toBe('already created');
    });
    harness.homeWriteFile.mockRejectedValueOnce(new Error('disk full'));
    await act(async () => result.current.consumeDraft());
    expect(result.current.draftActorRef.getSnapshot().context.draftText).toBe('');
    expect(harness.toastError).toHaveBeenCalledOnce();
    expect(harness.toastError).toHaveBeenCalledWith('Could not save your draft', expect.any(Object));
  });

  // New (W6, P27): a pasted image is stored in the record's own directory and survives a remount.
  it('persists a pasted image across remount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = renderHook(() => useChatComposer(), { wrapper: createHomeWrapper() });
    act(() => {
      first.result.current.draftActorRef.send({ type: 'addDraftAttachment', dataUrl: pngDataUrl, model: testModel });
    });
    await waitFor(() => {
      expect(first.result.current.draftActorRef.getSnapshot().context.draftAttachments).toHaveLength(1);
    });
    const [stored] = first.result.current.draftActorRef.getSnapshot().context.draftAttachments;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await waitFor(() => {
      expect(readRecord()).toMatchObject({
        draft: { parts: [{ type: 'file', url: `attachments/${stored!.hash}.png`, mediaType: 'image/png' }] },
      });
    });
    first.unmount();

    const second = renderHook(() => useChatComposer(), { wrapper: createHomeWrapper() });
    await waitFor(() => {
      expect(second.result.current.draftActorRef.getSnapshot().context.draftAttachments).toEqual([
        expect.objectContaining({ hash: stored!.hash, mediaType: 'image/png' }),
      ]);
    });
    expect(homeAttachmentNames()).toEqual([`${homeAttachments}/${stored!.hash}.png`]);
  });

  // New (W6, P27 / D14): a legacy `data:` part in the record is converted to a stored attachment on the next write.
  it('converts a legacy data URL in the record on the next write', async () => {
    writeRecord({
      version: 1,
      draft: { ...textDraft('legacy'), parts: [{ type: 'file', mediaType: 'image/png', url: pngDataUrl }] },
    });
    const { result } = renderHook(() => useChatComposer(), { wrapper: createHomeWrapper() });

    await waitFor(() => {
      expect(result.current.draftActorRef.getSnapshot().context.draftAttachments).toHaveLength(1);
    });
    const [stored] = result.current.draftActorRef.getSnapshot().context.draftAttachments;
    await waitFor(() => {
      expect(JSON.stringify(readRecord())).toContain(`attachments/${stored!.hash}.png`);
    });
    expect(JSON.stringify(readRecord())).not.toContain('data:');
    expect(homeAttachmentNames()).toEqual([`${homeAttachments}/${stored!.hash}.png`]);
  });

  // New (W6, P39): each pre-project surface releases only its own directory.
  it("leaves every other surface's attachment bytes in place when one surface consumes its draft", async () => {
    const marketing = renderHook(() => useChatComposer(), { wrapper: createComposerWrapper() });
    const home = renderHook(() => useChatComposer(), { wrapper: createHomeWrapper() });
    const libraryBytes = '/.tau/composers/library/attachments/' + 'c'.repeat(64) + '.png';
    harness.homeFiles.set(libraryBytes, new Uint8Array([1]));
    act(() => {
      marketing.result.current.draftActorRef.send({
        type: 'addDraftAttachment',
        dataUrl: pngDataUrl,
        model: testModel,
      });
      home.result.current.draftActorRef.send({ type: 'addDraftAttachment', dataUrl: pngDataUrl, model: testModel });
    });
    await waitFor(() => {
      expect(homeAttachmentNames()).toHaveLength(1);
      expect(marketing.result.current.draftActorRef.getSnapshot().context.draftAttachments).toHaveLength(1);
    });
    const marketingBytes = [...harness.homeFiles.keys()].find((path) =>
      path.startsWith('/.tau/composers/marketing/attachments/'),
    );
    expect(marketing.result.current.attachmentSource).toBe('/.tau/composers/marketing/attachments');
    expect(home.result.current.attachmentSource).toBeUndefined();

    await act(async () => marketing.result.current.consumeDraft());

    expect(marketingBytes).toBeDefined();
    expect(harness.homeFiles.has(marketingBytes!)).toBe(false);
    expect(homeAttachmentNames()).toHaveLength(1);
    expect(harness.homeFiles.has(libraryBytes)).toBe(true);
  });

  // New (W6): once a project has been created from the draft, consuming it releases the draft-stage copies.
  it('releases the draft-stage attachment copies when the draft is consumed', async () => {
    const { result } = renderHook(() => useChatComposer(), { wrapper: createHomeWrapper() });
    act(() => {
      result.current.draftActorRef.send({ type: 'addDraftAttachment', dataUrl: pngDataUrl, model: testModel });
    });
    await waitFor(() => {
      expect(homeAttachmentNames()).toHaveLength(1);
    });

    await act(async () => result.current.consumeDraft());

    expect(homeAttachmentNames()).toEqual([]);
    expect(readRecord()).toEqual({ version: 1, toolChoice: 'auto' });
  });
});

// ===========================================================================
// ActiveChatProvider — session-backed contract
// ===========================================================================
describe('ActiveChatProvider', () => {
  it('should expose a draftActorRef + session triple via useChatComposer', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createSessionWrapper('chat_active'),
    });

    expect(result.current.draftActorRef).toBeDefined();
    expect(result.current.session).toBeDefined();
    expect(result.current.session!.activeChatId).toBe('chat_active');
    expect(result.current.session!.chat).toBeDefined();
    expect(result.current.session!.persistenceActorRef).toBeDefined();
  });

  it('should expose the strict session triple via useActiveChatSession', () => {
    const { result } = renderHook(() => useActiveChatSession(), {
      wrapper: createSessionWrapper('chat_active'),
    });

    expect(result.current.activeChatId).toBe('chat_active');
    expect(result.current.chat).toBeDefined();
    expect(result.current.persistenceActorRef).toBeDefined();
    expect(result.current.draftActorRef).toBeDefined();
  });

  it('should reflect the live AI SDK status via useChatComposer().status', () => {
    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createSessionWrapper('chat_status'),
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.agentActivity).toBe('ready');

    act(() => {
      const live = harness.created[0]!;
      live.status = 'streaming';
      live.emitStatusChange();
    });

    expect(result.current.status).toBe('streaming');
    expect(result.current.agentActivity).toBe('working');
  });

  it('should surface approval and cancellation activity independently from the execution provider', () => {
    const { result } = renderHook(() => ({ composer: useChatComposer(), session: useActiveChatSession() }), {
      wrapper: createSessionWrapper('chat_activity'),
    });

    act(() => {
      const live = harness.created[0]!;
      live.messages = [
        {
          id: 'approval-message',
          role: 'assistant',
          metadata: { createdAt: 1, status: 'pending' },
          parts: [
            {
              type: 'tool-delete_file',
              toolCallId: 'tool-1',
              state: 'approval-requested',
              input: { targetFile: 'main.ts' },
              approval: { id: 'approval-1' },
            } as unknown as MyUIMessage['parts'][number],
          ],
        },
      ];
      live.emitMessagesChange();
    });
    expect(result.current.composer.agentActivity).toBe('approval-required');

    act(() => {
      const live = harness.created[0]!;
      live.messages = [];
      live.emitMessagesChange();
      result.current.session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'continue' } });
      result.current.composer.stop();
    });
    expect(result.current.composer.agentActivity).toBe('stopping');
  });

  it('should dispatch stopRequest on the persistence machine when stop() is called', () => {
    const { result } = renderHook(() => ({ composer: useChatComposer(), session: useActiveChatSession() }), {
      wrapper: createSessionWrapper('chat_stop'),
    });

    // v6 exposes `send` as a bound getter: wrap what it returns and keep calling through.

    const sendSpy = vi.fn(result.current.session.persistenceActorRef.send);

    vi.spyOn(result.current.session.persistenceActorRef, 'send', 'get').mockReturnValue(sendSpy);

    act(() => {
      result.current.composer.stop();
    });

    expect(sendSpy).toHaveBeenCalledWith({ type: 'stopRequest' });
  });

  it('should scan messages for the latest data-context-usage part', () => {
    const initialMessages: MyUIMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        metadata: { createdAt: 0, status: 'success' },
        parts: [
          { type: 'text', text: 'hello' },
          {
            type: 'data-context-usage',
            data: {
              type: 'context-usage',
              id: 'usage-1',
              totalInputTokens: 100,
              contextWindow: 200_000,
              percentUsed: 0.05,
              modelId: 'gpt-5.4-medium',
            },
          },
        ],
      },
    ];

    const { result } = renderHook(() => useChatComposer(), {
      wrapper: createSessionWrapper('chat_usage'),
    });

    expect(result.current.contextUsage).toBeUndefined();

    act(() => {
      const live = harness.created[0]!;
      live.messages = initialMessages;
      live.emitMessagesChange();
    });

    expect(result.current.contextUsage?.totalInputTokens).toBe(100);
    expect(result.current.contextUsage?.percentUsed).toBe(0.05);
  });

  // ── Session-backed model resolver (chat row preferred, cookie fallback,
  // dual-write on set) ──
  describe('model resolver', () => {
    it('should prefer a Tau Chat.activeExecution when present', async () => {
      harness.getChat.mockResolvedValue(
        makeChat({
          id: 'chat_with_model',
          activeExecution: { kind: 'tau', model: 'chat-local-model' },
        }),
      );

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_with_model'),
      });

      await waitFor(() => {
        expect(result.current.model.modelId).toBe('chat-local-model');
      });
      expect(result.current.model.model.id).toBe('chat-local-model');
    });

    it('should fall back to the cookie when Chat.activeExecution is undefined', async () => {
      harness.getChat.mockResolvedValue(makeChat({ id: 'chat_no_model' }));

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_no_model'),
      });

      await waitFor(() => {
        expect(harness.getChat).toHaveBeenCalledWith('chat_no_model');
      });
      expect(result.current.model.modelId).toBe('cookie-model');
    });

    it('should dual-write (chat row + cookie) when setActiveModel is called', async () => {
      harness.getChat.mockResolvedValue(makeChat({ id: 'chat_dual_write' }));

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_dual_write'),
      });

      await waitFor(() => {
        expect(result.current.model.modelId).toBe('cookie-model');
      });

      act(() => {
        result.current.model.setActiveModel('new-model');
      });

      await waitFor(() => {
        expect(harness.patchChat).toHaveBeenCalledWith('chat_dual_write', 'activeExecution', {
          kind: 'tau',
          model: 'new-model',
        });
      });
      expect(harness.setSelectedModelId).toHaveBeenCalledWith('new-model');
    });

    it('drops a persisted browser-host placement when the active model changes', async () => {
      const legacyExecution = { kind: 'tau', model: 'old-model', placement: 'browser-host' } as const;
      harness.getChat.mockResolvedValue(
        makeChat({
          id: 'chat_browser_model',
          activeExecution: legacyExecution,
        }),
      );

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_browser_model'),
      });

      await waitFor(() => {
        expect(result.current.model.modelId).toBe('old-model');
      });
      act(() => {
        result.current.model.setActiveModel('new-model');
      });

      await waitFor(() => {
        // The browser host is the only Tau placement now: the pre-cutover
        // property still parses, and is dropped rather than propagated.
        expect(harness.patchChat).toHaveBeenCalledWith('chat_browser_model', 'activeExecution', {
          kind: 'tau',
          model: 'new-model',
        });
      });
    });
  });

  // ── Session-backed kernel resolver ──
  describe('kernel resolver', () => {
    it('should prefer Chat.activeKernel when present', async () => {
      harness.getChat.mockResolvedValue(
        makeChat({
          id: 'chat_with_kernel',
          activeKernel: 'manifold',
        }),
      );

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_with_kernel'),
      });

      await waitFor(() => {
        expect(result.current.kernel.kernelId).toBe('manifold');
      });
      expect(result.current.kernel.kernel.id).toBe('manifold');
    });

    it('should fall back to the cookie when Chat.activeKernel is undefined', async () => {
      harness.getChat.mockResolvedValue(makeChat({ id: 'chat_no_kernel' }));

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_no_kernel'),
      });

      await waitFor(() => {
        expect(harness.getChat).toHaveBeenCalledWith('chat_no_kernel');
      });
      expect(result.current.kernel.kernelId).toBe('openscad');
    });

    it('should heal a retired openscad chat value through the cookie fallback', async () => {
      harness.getChat.mockResolvedValue(makeChat({ id: 'chat_retired_kernel', activeKernel: 'openscad' }));

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_retired_kernel'),
      });

      await waitFor(() => {
        expect(result.current.kernel.kernelId).toBe('openscad');
      });
      expect(result.current.kernel.kernel.id).toBe('openscad');
    });

    it('should dual-write (chat row + cookie) when setActiveKernel is called', async () => {
      harness.getChat.mockResolvedValue(makeChat({ id: 'chat_kernel_dual_write' }));

      const { result } = renderHook(() => useChatComposer(), {
        wrapper: createSessionWrapper('chat_kernel_dual_write'),
      });

      await waitFor(() => {
        expect(result.current.kernel.kernelId).toBe('openscad');
      });

      act(() => {
        result.current.kernel.setActiveKernel('manifold');
      });

      await waitFor(() => {
        expect(harness.patchChat).toHaveBeenCalledWith('chat_kernel_dual_write', 'activeKernel', 'manifold');
      });
      expect(harness.setKernel).toHaveBeenCalledWith('manifold');
    });
  });

  it('should throw with a descriptive message when useActiveChatSession is used outside any provider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => renderHook(() => useActiveChatSession())).toThrow(/activechatprovider/i);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  // Rewritten (P40): a project chat's draft lives in its composer record, not on the chat row (D2).
  it('should persist the draft to the chat’s composer record when chatId is defined', async () => {
    harness.getChat.mockResolvedValue(makeChat({ id: 'chat_persist', resourceId: 'proj_persist' }));
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useActiveChatSession(), {
      wrapper: createSessionWrapper('chat_persist'),
    });

    act(() => {
      result.current.draftActorRef.send({ type: 'setDraftText', text: 'hello world' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    await waitFor(() => {
      expect(readRecord(chatRecordPath('proj_persist', 'chat_persist'))).toMatchObject({
        draft: { parts: [{ type: 'text', text: 'hello world' }] },
      });
    });
    expect(harness.patchChat).not.toHaveBeenCalledWith('chat_persist', 'draft', expect.anything());
  });

  it('should switch draft state cleanly when chatId prop changes', async () => {
    function Probe(): ReactNode {
      return null;
    }

    const { rerender } = render(
      <ChatSessionStoreProvider>
        <ActiveChatProvider chatId='chat_first'>
          <Probe />
        </ActiveChatProvider>
      </ChatSessionStoreProvider>,
    );

    expect(harness.getChat).toHaveBeenCalledWith('chat_first');

    rerender(
      <ChatSessionStoreProvider>
        <ActiveChatProvider chatId='chat_second'>
          <Probe />
        </ActiveChatProvider>
      </ChatSessionStoreProvider>,
    );

    await waitFor(() => {
      expect(harness.getChat).toHaveBeenCalledWith('chat_second');
    });
  });

  // Rewritten (P40): the draft hydrates from the chat's composer record once the chat names its project (D7).
  it('should hydrate the draft from the chat’s composer record when one exists', async () => {
    writeRecord(
      { version: 1, draft: textDraft('preserved homepage draft') },
      chatRecordPath('proj_load', 'chat_with_draft'),
    );
    harness.getChat.mockResolvedValue(makeChat({ id: 'chat_with_draft', resourceId: 'proj_load' }));

    const { result } = renderHook(() => useActiveChatSession(), {
      wrapper: createSessionWrapper('chat_with_draft'),
    });

    await waitFor(() => {
      expect(result.current.draftActorRef.getSnapshot().context.draftText).toBe('preserved homepage draft');
    });
  });

  describe('imageResizeFailed toast subscriber', () => {
    it('should emit toast.error when the draft actor emits imageResizeFailed', async () => {
      harness.resize.mockRejectedValueOnce(new Error('boom'));

      const { result } = renderHook(() => useActiveChatSession(), {
        wrapper: createSessionWrapper('chat_toast'),
      });

      act(() => {
        result.current.draftActorRef.send({
          type: 'addDraftAttachment',
          dataUrl: 'data:image/png;base64,raw',
          model: testModel,
        });
      });

      await waitFor(() => {
        expect(harness.toastError).toHaveBeenCalledOnce();
      });
      expect(harness.toastError).toHaveBeenCalledWith('Failed to process image', expect.any(Object));
    });

    // Rewritten (P40): the resized image is stored through the session's real store actor, into the chat's record directory.
    it('should not toast on successful resize', async () => {
      harness.resize.mockResolvedValueOnce('data:image/jpeg;base64,resized');
      harness.getChat.mockResolvedValue(makeChat({ id: 'chat_no_toast', resourceId: 'proj_toast' }));

      const { result } = renderHook(() => useActiveChatSession(), {
        wrapper: createSessionWrapper('chat_no_toast'),
      });

      act(() => {
        result.current.draftActorRef.send({
          type: 'addDraftAttachment',
          dataUrl: 'data:image/png;base64,raw',
          model: testModel,
        });
      });

      // Rewritten (W4 rename): a resized image is now stored and referenced, not kept as its data URL.
      await waitFor(() => {
        expect(result.current.draftActorRef.getSnapshot().context.draftAttachments).toEqual([
          expect.objectContaining({ mediaType: 'image/jpeg' }),
        ]);
      });
      const [stored] = result.current.draftActorRef.getSnapshot().context.draftAttachments;
      expect(
        harness.homeFiles.has(`/.tau/composers/chats/proj_toast/chat_no_toast/attachments/${stored!.hash}.jpg`),
      ).toBe(true);

      expect(harness.toastError).not.toHaveBeenCalled();
    });
  });
});
