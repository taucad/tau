import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ChatSnapshot, ContextPayload } from '@taucad/chat';
import type { KernelId } from '@taucad/types/constants';
import { resolveKernel } from '@taucad/types/constants';
import {
  awaitBrowserAgentHostAvailability,
  resetBrowserAgentHostAvailability,
  useBrowserAgentHostProjectAvailability,
  useCadAgentConfig,
} from '#hooks/use-cad-agent-config.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useChatSnapshot } from '#hooks/use-chat-snapshot.js';
import { useContextPayload } from '#hooks/use-context-payload.js';
import { probeBrowserAgentHostCapability } from '#services/agent-host-client.js';

const capabilityHarness = vi.hoisted(() => ({ readError: undefined as Error | undefined, supported: true }));
const durabilityHarness = vi.hoisted(() => ({ value: 'transactional-rewrite' }) as const);
const bridgeHarness = vi.hoisted(() => {
  const open = vi.fn();
  const syncProjectRoots = vi.fn(async () => undefined);
  return {
    open,
    syncProjectRoots,
    fileManagerRef: {
      getSnapshot: () => ({ context: { rootDirectory: '/projects/project-test', openFileSystemBridge: open } }),
    },
  };
});

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: vi.fn(),
}));
vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: vi.fn(),
}));
vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: vi.fn(),
}));
vi.mock('#hooks/use-chat-snapshot.js', () => ({
  useChatSnapshot: vi.fn(),
}));
vi.mock('#hooks/use-context-payload.js', () => ({
  useContextPayload: vi.fn(),
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project-test' }) }));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    fileManagerRef: bridgeHarness.fileManagerRef,
    workspace: { syncProjectRoots: bridgeHarness.syncProjectRoots },
  }),
  useOptionalFileManager: () => ({
    fileManagerRef: bridgeHarness.fileManagerRef,
    workspace: { syncProjectRoots: bridgeHarness.syncProjectRoots },
  }),
}));
vi.mock('#filesystem/handle-store.js', () => ({
  getProjectFileSystemConfig: async () => ({
    projectId: 'project-test',
    backend: 'indexeddb',
    providerBasePath: 'project-test',
  }),
}));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  waitForRootedBridgeOpener: async (fileManagerRef: typeof bridgeHarness.fileManagerRef) =>
    fileManagerRef.getSnapshot().context,
  readRootedBridgeCapabilities: async (openConnection: () => { dispose(): void }) => {
    openConnection().dispose();
    if (capabilityHarness.readError !== undefined) {
      throw capabilityHarness.readError;
    }
    return {
      writable: true,
      persistent: true,
      quotaBased: true,
      durability: durabilityHarness.value,
    };
  },
}));
vi.mock('#services/agent-host-client.js', () => ({
  getBrowserAgentHostCapability: () =>
    capabilityHarness.supported ? { supported: true } : { supported: false, reason: 'STORAGE_NOT_WRITABLE' },
  probeBrowserAgentHostCapability: vi.fn(async () =>
    capabilityHarness.supported ? { supported: true } : { supported: false, reason: 'STORAGE_NOT_WRITABLE' },
  ),
  isBrowserAgentHostProviderKind: (providerKind: string) => providerKind === 'openai' || providerKind === 'anthropic',
}));

const noop = (): void => undefined;

/** A Tau execution carrying the client-only revision mode the strict wire type omits. */
const branchExecutionFields = { kind: 'tau', model: 'openai-gpt-5.5', revision: 'branch' };
const branchExecution = branchExecutionFields as unknown as ChatComposerContextValue['execution']['execution'];

const useChatComposerMock = vi.mocked(useChatComposer);
const useChatSelectorMock = vi.mocked(useChatSelector);
const useCookieMock = vi.mocked(useCookie);
const useChatSnapshotMock = vi.mocked(useChatSnapshot);
const useContextPayloadMock = vi.mocked(useContextPayload);

type CookieReturn = ReturnType<typeof useCookie>;

const buildComposer = (overrides: {
  modelId?: string;
  providerKind?: 'anthropic' | 'ollama' | 'openai';
  kernelId?: KernelId;
  execution?: ChatComposerContextValue['execution']['execution'];
}): ChatComposerContextValue => {
  const kernelId: KernelId = overrides.kernelId ?? 'replicad';
  const modelId = overrides.modelId ?? 'openai-gpt-5.5';
  const providerKind = overrides.providerKind ?? 'openai';
  return {
    draftActorRef: { send: vi.fn() },
    model: {
      modelId,
      model: {
        id: modelId,
        provider: { id: providerKind, name: providerKind },
        isResolved: true,
        model: { provider: { id: providerKind, name: providerKind } },
      },
      setActiveModel: noop,
    },
    execution: {
      execution: overrides.execution ?? { kind: 'tau', model: modelId },
      setActiveExecution: noop,
    },
    kernel: { kernelId, kernel: resolveKernel(kernelId), setActiveKernel: noop },
    status: 'ready',
    agentActivity: 'ready',
    stop: noop,
    contextUsage: undefined,
    session: undefined,
  } as unknown as ChatComposerContextValue;
};

const mountChatSelectorMocks = (overrides: { draftMode?: string; draftToolChoice?: string | string[] } = {}): void => {
  const draftMode = overrides.draftMode ?? 'agent';
  const draftToolChoice = overrides.draftToolChoice ?? 'auto';
  useChatSelectorMock.mockImplementation((selector) =>
    selector({
      // Only the fields the assembler reads need to be present.
      draftMode,
      draftToolChoice,
    } as unknown as Parameters<typeof selector>[0]),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  resetBrowserAgentHostAvailability();
  capabilityHarness.supported = true;
  capabilityHarness.readError = undefined;
  bridgeHarness.open.mockReturnValue({ port: new MessageChannel().port1, dispose: vi.fn() });
  useChatComposerMock.mockReturnValue(buildComposer({}));
  mountChatSelectorMocks();
  useCookieMock.mockReturnValue([true, noop, noop] as unknown as CookieReturn);
  useChatSnapshotMock.mockReturnValue(undefined);
  useContextPayloadMock.mockReturnValue(undefined);
});

describe('useCadAgentConfig', () => {
  it('registers the active project root before reading rooted bridge capabilities', async () => {
    const { result } = renderHook(() => useBrowserAgentHostProjectAvailability('openai'));

    // Pending is not unsupported: the probe has not answered yet, and a
    // dispatch in this window must wait rather than be refused or rerouted.
    expect(result.current).toEqual({ status: 'pending' });
    await waitFor(() => {
      expect(result.current).toMatchObject({ status: 'available', durability: 'transactional-rewrite' });
    });
    expect(bridgeHarness.syncProjectRoots).toHaveBeenCalledOnce();
    expect(bridgeHarness.syncProjectRoots.mock.invocationCallOrder[0]).toBeLessThan(
      bridgeHarness.open.mock.invocationCallOrder[0]!,
    );
  });

  it('resolves an unavailable rooted bridge without an unhandled rejection', async () => {
    capabilityHarness.readError = new Error('Rooted filesystem bridge is unavailable.');
    const unhandled = vi.fn();
    globalThis.addEventListener('unhandledrejection', unhandled);

    try {
      const { result } = renderHook(() => useBrowserAgentHostProjectAvailability('openai'));

      await waitFor(() => {
        expect(bridgeHarness.open).toHaveBeenCalled();
      });
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 0);
      });
      expect(result.current).toEqual({
        status: 'unavailable',
        reason: 'Rooted filesystem bridge is unavailable.',
      });
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      globalThis.removeEventListener('unhandledrejection', unhandled);
    }
  });

  it('should stamp profile=cad and compose every field from its source hooks', () => {
    const { result } = renderHook(() => useCadAgentConfig());

    expect(result.current).toEqual({
      profile: 'cad',
      execution: { kind: 'tau', model: 'openai-gpt-5.5' },
      kernel: 'replicad',
      mode: 'agent',
      toolChoice: 'auto',
      testingEnabled: true,
      snapshot: undefined,
      contextPayload: undefined,
    });
  });

  it('never downgrades the execution — the browser host is the only Tau placement', async () => {
    useChatComposerMock.mockReturnValue(buildComposer({ execution: branchExecution }));

    const { result } = renderHook(() => useCadAgentConfig());

    // The assembler is placement-free: it carries the execution through
    // verbatim. Capability is a *gate* on dispatch, never a silent rewrite.
    expect(result.current.execution).toEqual({ kind: 'tau', model: 'openai-gpt-5.5', revision: 'branch' });
    await waitFor(() => {
      expect(result.current.execution).toEqual({ kind: 'tau', model: 'openai-gpt-5.5', revision: 'branch' });
    });
  });

  it('reports the probe reason when this project cannot host the agent log', async () => {
    capabilityHarness.supported = false;

    const { result } = renderHook(() => useBrowserAgentHostProjectAvailability('openai'));

    await waitFor(() => {
      expect(probeBrowserAgentHostCapability).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'unavailable',
        reason: 'This project’s storage cannot hold a durable agent log.',
      });
    });
  });

  it('resolves availability for the Anthropic gateway wire', async () => {
    const { result } = renderHook(() => useBrowserAgentHostProjectAvailability('anthropic'));

    await waitFor(() => {
      expect(result.current).toMatchObject({ status: 'available' });
    });
    expect(probeBrowserAgentHostCapability).toHaveBeenCalledWith({ durability: 'transactional-rewrite' });
  });

  it('refuses a model whose provider has no gateway wire', async () => {
    const { result } = renderHook(() => useBrowserAgentHostProjectAvailability('ollama'));

    await waitFor(() => {
      expect(result.current).toEqual({
        status: 'unavailable',
        reason: 'Tau cannot run the ollama provider wire in your browser. Pick a different model.',
      });
    });
  });

  it('stays pending for a model whose catalog row has not loaded yet', async () => {
    // `ResolvedModel.provider` reads `unknown` until `GET /v1/models` answers.
    // Refusing that would refuse the seeded first turn, which dispatches first.
    const { result } = renderHook(() => useBrowserAgentHostProjectAvailability('unknown'));

    await waitFor(() => {
      expect(probeBrowserAgentHostCapability).toHaveBeenCalled();
    });
    expect(result.current).toEqual({ status: 'pending' });
  });

  it('makes a dispatch wait out an in-flight probe instead of refusing it', async () => {
    // The seeded first turn dispatches at chat load, before the probe answers.
    // Awaiting availability is what keeps it on the host.
    const settled = awaitBrowserAgentHostAvailability('project-test');
    renderHook(() => useBrowserAgentHostProjectAvailability('openai'));

    await expect(settled).resolves.toMatchObject({ status: 'available', durability: 'transactional-rewrite' });
  });

  it('answers a dispatch with the recorded reason once the probe refuses', async () => {
    capabilityHarness.supported = false;
    const settled = awaitBrowserAgentHostAvailability('project-test');
    renderHook(() => useBrowserAgentHostProjectAvailability('openai'));

    await expect(settled).resolves.toEqual({
      status: 'unavailable',
      reason: 'This project’s storage cannot hold a durable agent log.',
    });
  });

  it('bounds the dispatch wait rather than hanging a turn forever', async () => {
    const settled = await awaitBrowserAgentHostAvailability('project-never-probed', 1);

    expect(settled).toEqual({
      status: 'unavailable',
      reason: 'Timed out while checking whether this project can run the agent in your browser.',
    });
  });

  it('should source `kernel` from useChatComposer().kernel.kernelId — not from model', () => {
    useChatComposerMock.mockReturnValue(buildComposer({ kernelId: 'openscad' }));

    const { result } = renderHook(() => useCadAgentConfig());

    expect(result.current.kernel).toBe('openscad');
  });

  it('should source `mode` and `toolChoice` from the chat draft selector', () => {
    mountChatSelectorMocks({ draftMode: 'plan', draftToolChoice: ['read_file', 'edit_file'] });

    const { result } = renderHook(() => useCadAgentConfig());

    expect(result.current.mode).toBe('plan');
    expect(result.current.toolChoice).toEqual(['read_file', 'edit_file']);
  });

  it('should source `testingEnabled` from the chat-testing-enabled cookie', () => {
    useCookieMock.mockReturnValue([false, noop, noop] as unknown as CookieReturn);

    const { result } = renderHook(() => useCadAgentConfig());

    expect(result.current.testingEnabled).toBe(false);
  });

  it('should pass an undefined snapshot through untouched so the server applies the schema default `{}`', () => {
    useChatSnapshotMock.mockReturnValue(undefined);

    const { result } = renderHook(() => useCadAgentConfig());

    expect(result.current.snapshot).toBeUndefined();
  });

  it('should pass an undefined contextPayload through untouched so the server applies the schema default `{}`', () => {
    useContextPayloadMock.mockReturnValue(undefined);

    const { result } = renderHook(() => useCadAgentConfig());

    expect(result.current.contextPayload).toBeUndefined();
  });

  it('should forward a present snapshot/contextPayload verbatim from the source hooks', () => {
    const snapshot: ChatSnapshot = { activeFile: { path: 'src/main.ts', name: 'main.ts' } };
    const contextPayload: ContextPayload = {
      memory: { 'AGENTS.md': 'shared rules' },
    };
    useChatSnapshotMock.mockReturnValue(snapshot);
    useContextPayloadMock.mockReturnValue(contextPayload);

    const { result } = renderHook(() => useCadAgentConfig());

    expect(result.current.snapshot).toBe(snapshot);
    expect(result.current.contextPayload).toBe(contextPayload);
  });
});
