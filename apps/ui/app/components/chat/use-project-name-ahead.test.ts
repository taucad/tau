import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NameAheadDraft, NameAheadRequest } from '#components/chat/use-project-name-ahead.js';

const mockGenerate =
  vi.fn<
    (input: { projectId: string; text: string; imageUrls?: readonly string[]; signal?: AbortSignal }) => Promise<string>
  >();
const session = vi.hoisted(() => ({ signedIn: true }));
/** The draft actor as `useSelector` reads it: a snapshot and its listeners. */
const draft = vi.hoisted(() => {
  type Listener = (() => void) | { next: () => void };
  const listeners = new Set<Listener>();
  let snapshot = { context: { draftText: '', draftAttachments: [] as unknown[], touched: { draft: false } } };
  return {
    actor: {
      getSnapshot: () => snapshot,
      subscribe: (listener: Listener) => {
        listeners.add(listener);
        return {
          unsubscribe: () => {
            listeners.delete(listener);
          },
        };
      },
    },
    reset() {
      snapshot = { context: { draftText: '', draftAttachments: [], touched: { draft: false } } };
    },
    /** A saved record read in after mount (`hydrateDraft`): not written here. */
    hydrate(text: string) {
      snapshot = { context: { ...snapshot.context, draftText: text } };
      for (const listener of listeners) {
        if (typeof listener === 'function') {
          listener();
        } else {
          listener.next();
        }
      }
    },
    type(text: string) {
      snapshot = { context: { ...snapshot.context, draftText: text, touched: { draft: true } } };
      for (const listener of listeners) {
        if (typeof listener === 'function') {
          listener();
        } else {
          listener.next();
        }
      }
    },
  };
});

vi.mock('@better-auth-ui/react', () => ({
  useSession: () => ({ data: session.signedIn ? { user: { id: 'usr_1' } } : null }),
}));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({ draftActorRef: draft.actor, attachmentSource: undefined }),
}));
const fileManager = vi.hoisted(() => ({ recordFiles: {} }));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => fileManager }));
vi.mock('#chat-clients/use-project-name-client.js', () => ({
  useProjectNameClient: () => ({ generate: mockGenerate }),
}));
vi.mock('@taucad/project-library/runtime/project-library-commands', () => ({ namingImageUrls: async () => [] }));

const { createProjectNameAhead, nameAheadPause, useProjectNameAhead } =
  await import('#components/chat/use-project-name-ahead.js');

const textDraft = (text: string): NameAheadDraft => ({ text, attachments: [] });

/** A naming fake whose replies the test settles, one per request. */
const namingFake = () => {
  const calls: Array<{ text: string; signal: AbortSignal; reply: PromiseWithResolvers<string> }> = [];
  const request = vi.fn<NameAheadRequest>(async (asked, { signal }) => {
    const reply = Promise.withResolvers<string>();
    calls.push({ text: asked.text, signal, reply });
    return reply.promise;
  });
  return { request, calls };
};

describe('createProjectNameAhead', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    return () => {
      vi.useRealTimers();
    };
  });

  it('should ask once the draft has three words and has been still for the pause', () => {
    const { request } = namingFake();
    const nameAhead = createProjectNameAhead(request);

    nameAhead.update(textDraft('A wall'), false);
    vi.advanceTimersByTime(nameAheadPause);
    expect(request).not.toHaveBeenCalled();

    nameAhead.update(textDraft('A wall bracket'), false);
    vi.advanceTimersByTime(nameAheadPause - 1);
    nameAhead.update(textDraft('A wall bracket for'), false);
    vi.advanceTimersByTime(nameAheadPause - 1);
    expect(request).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toEqual(textDraft('A wall bracket for'));
    expect(request.mock.calls[0]?.[1].projectId).toMatch(/^proj_/);
  });

  it('should ask at once after a paste', () => {
    const { request } = namingFake();
    createProjectNameAhead(request).update(textDraft('A wall bracket for a 32 mm pipe'), true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('should hand the latest answer to a submit at once, for both name and slug', async () => {
    const { request, calls } = namingFake();
    const nameAhead = createProjectNameAhead(request);
    nameAhead.update(textDraft('A wall bracket for a pipe'), true);
    calls[0]?.reply.resolve('Pipe Wall Bracket\nextra');
    await vi.runAllTimersAsync();

    expect(nameAhead.take(textDraft('A wall bracket for a pipe, 32 mm'))).toBe('Pipe Wall Bracket');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("should not wait for a request in flight, taking the earlier answer or the prompt's first words", async () => {
    const { request, calls } = namingFake();
    const nameAhead = createProjectNameAhead(request);
    nameAhead.update(textDraft('a wall bracket for a pipe with two holes'), true);
    expect(nameAhead.take(textDraft('a wall bracket for a pipe with two holes'))).toBe('A wall bracket for a pipe');

    calls[0]?.reply.resolve('Pipe Wall Bracket');
    await vi.runAllTimersAsync();
    nameAhead.update(
      textDraft(
        'a wall bracket for a pipe with two holes, 40 mm apart, chamfered on every outer edge, with countersunk screws',
      ),
      true,
    );
    /* The newer request is still in flight: the submit takes the answer it has, and the late answer renames nothing. */
    expect(
      nameAhead.take(
        textDraft(
          'a wall bracket for a pipe with two holes, 40 mm apart, chamfered on every outer edge, with countersunk screws',
        ),
      ),
    ).toBe('Pipe Wall Bracket');
    expect(calls).toHaveLength(2);
  });

  it('should not give a rewritten prompt the name of the one it replaced', async () => {
    const { request, calls } = namingFake();
    const nameAhead = createProjectNameAhead(request);
    nameAhead.update(textDraft('A wall bracket for a pipe'), true);
    calls[0]?.reply.resolve('Pipe Wall Bracket');
    await vi.runAllTimersAsync();

    expect(nameAhead.take(textDraft('A phone stand with a cable slot'))).toBe('A phone stand with a cable');
  });

  it("should take the prompt's first words when every request failed, without asking again", async () => {
    const { request, calls } = namingFake();
    const nameAhead = createProjectNameAhead(request);
    nameAhead.update(textDraft('A wall bracket for a pipe'), true);
    calls[0]?.reply.reject(new Error('offline'));
    await vi.runAllTimersAsync();

    expect(nameAhead.take(textDraft('A wall bracket for a pipe'))).toBe('A wall bracket for a pipe');
    expect(request).toHaveBeenCalledTimes(1);
    nameAhead.update(textDraft('A wall bracket'), true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("should forget a cleared draft's answer and give an empty draft no name", async () => {
    const { request, calls } = namingFake();
    const nameAhead = createProjectNameAhead(request);
    nameAhead.update(textDraft('A wall bracket for a pipe'), true);
    calls[0]?.reply.resolve('Pipe Wall Bracket');
    await vi.runAllTimersAsync();
    nameAhead.update(textDraft(''), false);

    expect(nameAhead.take(textDraft('  '))).toBeUndefined();
    expect(nameAhead.take(textDraft('A wall bracket for a pipe'))).toBe('A wall bracket for a pipe');
  });

  it('should keep one request in flight, aborting the older one, and ask at most three times per draft', () => {
    const { request, calls } = namingFake();
    const nameAhead = createProjectNameAhead(request);
    for (const text of ['A wall bracket', 'A phone stand', 'A cable clip', 'A pen holder']) {
      nameAhead.update(textDraft(text), true);
    }

    expect(calls.map((call) => call.text)).toEqual(['A wall bracket', 'A phone stand', 'A cable clip']);
    expect(calls.map((call) => call.signal.aborted)).toEqual([true, true, false]);

    /* Clearing the draft starts a new one, with its own budget and project id. */
    nameAhead.update(textDraft(''), false);
    nameAhead.update(textDraft('A pen holder'), true);
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls[3]?.[1].projectId).not.toBe(request.mock.calls[0]?.[1].projectId);
  });

  it('should clear a pending pause on dispose', () => {
    const { request } = namingFake();
    const nameAhead = createProjectNameAhead(request);
    nameAhead.update(textDraft('A wall bracket'), false);
    nameAhead.dispose();
    vi.advanceTimersByTime(nameAheadPause);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('useProjectNameAhead', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGenerate.mockReset();
    mockGenerate.mockResolvedValue('Pipe Wall Bracket');
    session.signedIn = true;
    draft.reset();
    return () => {
      vi.useRealTimers();
    };
  });

  it('should ask for the draft being written, under a draft-scoped project id', async () => {
    const { result } = renderHook(() => useProjectNameAhead());

    act(() => {
      draft.type('A wall bracket for a pipe');
    });
    await act(async () => vi.advanceTimersByTimeAsync(nameAheadPause));

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const [input] = mockGenerate.mock.calls[0] ?? [];
    expect(input).toMatchObject({ text: 'A wall bracket for a pipe', imageUrls: [] });
    expect(input?.signal).toBeInstanceOf(AbortSignal);
    expect(input?.projectId).toMatch(/^proj_/);
    await act(async () => vi.runAllTimersAsync());
    expect(result.current.take(textDraft('A wall bracket for a pipe'))).toBe('Pipe Wall Bracket');
  });

  it('should not ask for a draft restored on mount until the person changes it', async () => {
    draft.type('A wall bracket for a pipe');
    const { rerender } = renderHook(() => useProjectNameAhead());
    await act(async () => vi.advanceTimersByTimeAsync(nameAheadPause));
    rerender();
    expect(mockGenerate).not.toHaveBeenCalled();

    act(() => {
      draft.type('A wall bracket for a pipe, 32 mm');
    });
    await act(async () => vi.advanceTimersByTimeAsync(nameAheadPause));
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('should not ask for a saved draft read in after mount until the person changes it', async () => {
    renderHook(() => useProjectNameAhead());
    act(() => {
      draft.hydrate('A wall bracket for a pipe');
    });
    await act(async () => vi.advanceTimersByTimeAsync(nameAheadPause));
    expect(mockGenerate).not.toHaveBeenCalled();

    act(() => {
      draft.type('A wall bracket for a pipe, 32 mm');
    });
    await act(async () => vi.advanceTimersByTimeAsync(nameAheadPause));
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('should keep the per-draft cap when the name client changes identity', async () => {
    const { rerender } = renderHook(() => useProjectNameAhead());
    for (const text of ['A wall bracket', 'A phone stand', 'A cable clip', 'A pen holder']) {
      act(() => {
        draft.type(text);
      });
      // oxlint-disable-next-line eslint/no-await-in-loop -- each pause must elapse before the next change
      await act(async () => vi.advanceTimersByTimeAsync(nameAheadPause));
      fileManager.recordFiles = {};
      rerender();
    }
    expect(mockGenerate).toHaveBeenCalledTimes(3);
  });

  it('should cancel a superseded request through the signal it passes to the name client', async () => {
    renderHook(() => useProjectNameAhead());

    act(() => {
      draft.type('A wall bracket for a pipe');
    });
    await act(async () => vi.advanceTimersByTimeAsync(nameAheadPause));
    act(() => {
      draft.type('A phone stand with a cable slot');
    });
    await act(async () => vi.advanceTimersByTimeAsync(nameAheadPause));

    expect(mockGenerate.mock.calls.map(([input]) => input.signal?.aborted)).toEqual([true, false]);
  });

  it('should ask at once after a paste', async () => {
    const { result } = renderHook(() => useProjectNameAhead());

    act(() => {
      result.current.onPasteCapture();
      draft.type('A wall bracket for a pipe');
    });
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('should send nothing when signed out', async () => {
    session.signedIn = false;
    const { result } = renderHook(() => useProjectNameAhead());

    act(() => {
      result.current.onPasteCapture();
      draft.type('A wall bracket for a pipe');
    });
    await act(async () => vi.advanceTimersByTimeAsync(nameAheadPause));

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.current.take(textDraft('A wall bracket for a pipe'))).toBe('A wall bracket for a pipe');
  });

  it('should return a stable take across rerenders', () => {
    const { result, rerender } = renderHook(() => useProjectNameAhead());
    const { take } = result.current;
    rerender();
    expect(result.current.take).toBe(take);
  });

  it('should clear a pending pause on unmount', async () => {
    const { unmount } = renderHook(() => useProjectNameAhead());
    act(() => {
      draft.type('A wall bracket for a pipe');
    });
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(nameAheadPause));
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
