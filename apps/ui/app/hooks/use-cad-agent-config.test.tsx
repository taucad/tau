import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ChatSnapshot, ContextPayload } from '@taucad/chat';
import type { KernelId } from '@taucad/types/constants';
import { resolveKernel } from '@taucad/types/constants';
import { useCadAgentConfig } from '#hooks/use-cad-agent-config.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useChatSnapshot } from '#hooks/use-chat-snapshot.js';
import { useContextPayload } from '#hooks/use-context-payload.js';

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

const noop = (): void => undefined;

const useChatComposerMock = vi.mocked(useChatComposer);
const useChatSelectorMock = vi.mocked(useChatSelector);
const useCookieMock = vi.mocked(useCookie);
const useChatSnapshotMock = vi.mocked(useChatSnapshot);
const useContextPayloadMock = vi.mocked(useContextPayload);

type CookieReturn = ReturnType<typeof useCookie>;

const buildComposer = (overrides: { modelId?: string; kernelId?: KernelId }): ChatComposerContextValue => {
  const kernelId: KernelId = overrides.kernelId ?? 'replicad';
  return {
    draftActorRef: { send: vi.fn() },
    model: { modelId: overrides.modelId ?? 'openai-gpt-5.5', model: undefined, setActiveModel: noop },
    kernel: { kernelId, kernel: resolveKernel(kernelId), setActiveKernel: noop },
    status: 'ready',
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
  useChatComposerMock.mockReturnValue(buildComposer({}));
  mountChatSelectorMocks();
  useCookieMock.mockReturnValue([true, noop, noop] as unknown as CookieReturn);
  useChatSnapshotMock.mockReturnValue(undefined);
  useContextPayloadMock.mockReturnValue(undefined);
});

describe('useCadAgentConfig', () => {
  it('should stamp profile=cad and compose every field from its source hooks', () => {
    const { result } = renderHook(() => useCadAgentConfig());

    expect(result.current).toEqual({
      profile: 'cad',
      model: 'openai-gpt-5.5',
      kernel: 'replicad',
      mode: 'agent',
      toolChoice: 'auto',
      testingEnabled: true,
      snapshot: undefined,
      contextPayload: undefined,
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
      // eslint-disable-next-line @typescript-eslint/naming-convention -- AGENTS.md is a fixed shared-rules filename, not a JS identifier
      memory: { 'AGENTS.md': 'shared rules' },
    };
    useChatSnapshotMock.mockReturnValue(snapshot);
    useContextPayloadMock.mockReturnValue(contextPayload);

    const { result } = renderHook(() => useCadAgentConfig());

    expect(result.current.snapshot).toBe(snapshot);
    expect(result.current.contextPayload).toBe(contextPayload);
  });
});
