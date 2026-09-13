// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  resolveKernel,
  tauEditorPanelDragMime,
  tauFileDragMime,
  tauViewerPanelDragMime,
} from '@taucad/types/constants';
import type { ResolvedModel } from '#hooks/use-models.js';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';

// ---------------------------------------------------------------------------
// Unified composer-context mock — `useChatTextareaLogic` is a single
// consumer of `useChatComposer()` (which the providers populate). We mock
// that one hook and feed it a shape mirroring the production contract;
// `useDraftActions` / `useDraftSelector` proxy to the same actorRef under
// the hood, so a single mock object backs all surfaces. This collapses
// the previous five-mock arrangement (use-active-chat-model + use-chat
// + use-keyboard + sonner + ...) into one composer mock + the keyboard
// + sonner mocks.
// ---------------------------------------------------------------------------

const stableModel: ResolvedModel = {
  id: 'chat-scoped-model',
  details: { family: 'gpt' },
} as unknown as ResolvedModel;

let mockActiveModel: ResolvedModel = stableModel;

const chatActionsMock = {
  stop: vi.fn<() => void>(),
  setDraftText: vi.fn<(text: string) => void>(),
  addDraftImage: vi.fn<(image: string) => void>(),
  removeDraftImage: vi.fn<(index: number) => void>(),
  setDraftToolChoice: vi.fn<(choice: string | string[]) => void>(),
  setEditDraftText: vi.fn<(text: string) => void>(),
  addEditDraftImage: vi.fn<(image: string) => void>(),
  removeEditDraftImage: vi.fn<(index: number) => void>(),
};

const defaultDraftState = {
  status: 'idle',
  draftText: 'hello world',
  draftImages: [] as string[],
  draftToolChoice: 'auto',
  draftMode: 'agent',
  editDraftText: '',
  editDraftImages: [] as string[],
};

const mockUseChatSelector = vi.fn((selector: (state: unknown) => unknown) => selector(defaultDraftState));

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => chatActionsMock,
  useChatSelector: (selector: (state: unknown) => unknown) => mockUseChatSelector(selector),
  useDraftActions: () => chatActionsMock,
  useDraftSelector: (selector: (state: unknown) => unknown) => mockUseChatSelector(selector),
}));

// Single composer mock. Fields the hook actually reads:
//   - model.model (selectedModel display)
//   - status / stop (no-op pair for marketing-route tests; the textarea
//     never reads `model.modelId`, `kernel`, `contextUsage` or `session`
//     so we leave them at default-shape values).
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: (): ChatComposerContextValue =>
    ({
      draftActorRef: undefined,
      model: { modelId: mockActiveModel.id, model: mockActiveModel, setActiveModel: vi.fn() },
      kernel: { kernelId: 'openscad', kernel: resolveKernel('openscad'), setActiveKernel: vi.fn() },
      status: 'ready',
      stop: () => undefined,
      contextUsage: undefined,
      session: undefined,
    }) as unknown as ChatComposerContextValue,
}));

vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Ctrl+Backspace' }),
}));

const toastErrorMock = vi.fn();

vi.mock('#components/ui/sonner.js', () => ({
  toast: { error: toastErrorMock },
}));

const { useChatTextareaLogic } = await import('#components/chat/chat-textarea-types.js');

describe('useChatTextareaLogic — onSubmit surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveModel = stableModel;
  });

  it('should expose the chat-scoped model on selectedModel (UI display)', () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({
        ref: undefined,
        onSubmit: vi.fn(async () => undefined),
      }),
    );

    expect(result.current.selectedModel.id).toBe('chat-scoped-model');
  });

  it('should invoke onSubmit with ONLY content and imageUrls when handleSubmit fires (no model / no metadata)', async () => {
    const onSubmit = vi.fn<(payload: { content: string; imageUrls: string[] }) => Promise<void>>(async () => undefined);
    const { result } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit }));

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledOnce();
    const submittedPayload = onSubmit.mock.calls[0]?.[0];
    expect(submittedPayload).toEqual({ content: 'hello world', imageUrls: [] });
  });

  it('should never thread model or metadata to onSubmit even when the chat-scoped model changes between submits', async () => {
    const onSubmit = vi.fn<(payload: { content: string; imageUrls: string[] }) => Promise<void>>(async () => undefined);
    const { result, rerender } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit }));

    await act(async () => {
      await result.current.handleSubmit();
    });

    mockActiveModel = { id: 'next-chat-scoped-model', details: { family: 'gpt' } } as unknown as ResolvedModel;
    rerender();

    await act(async () => {
      await result.current.handleSubmit();
    });

    for (const call of onSubmit.mock.calls) {
      const submittedPayload = call[0] as Record<string, unknown>;
      expect(submittedPayload).not.toHaveProperty('model');
      expect(submittedPayload).not.toHaveProperty('metadata');
      expect(Object.keys(submittedPayload).sort()).toEqual(['content', 'imageUrls']);
    }
  });
});

/**
 * Drag-detection + drop-routing contract for the outer container handler.
 *
 * `handleDragOver` derives `dragKind` from `event.dataTransfer.types`, and
 * `handleDrop` dispatches by MIME — viewer→onViewerScreenshotDrop,
 * editor/file→onAddContextChips, otherwise the existing image-file path.
 */
describe('useChatTextareaLogic — dragKind detection + drop routing', () => {
  type DragInit = {
    readonly types: readonly string[];
    readonly data?: Readonly<Record<string, string>>;
    readonly files?: readonly File[];
  };

  const buildDragEvent = (init: DragInit): React.DragEvent => {
    const data = init.data ?? {};
    const dataTransfer = {
      types: init.types,
      files: init.files ?? [],
      getData: (mime: string): string => data[mime] ?? '',
    } as unknown as DataTransfer;
    return {
      preventDefault: vi.fn(),
      dataTransfer,
    } as unknown as React.DragEvent;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveModel = stableModel;
  });

  it('sets dragKind to "viewer" when the viewer panel mime is present', () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    act(() => {
      result.current.handleDragOver(buildDragEvent({ types: [tauViewerPanelDragMime] }));
    });

    expect(result.current.dragKind).toBe('viewer');
    expect(result.current.isDragging).toBe(true);
  });

  it.each([
    ['editor panel', tauEditorPanelDragMime],
    ['file tree', tauFileDragMime],
  ])('sets dragKind to "reference" when the %s mime is present', (_label, mime) => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    act(() => {
      result.current.handleDragOver(buildDragEvent({ types: [mime] }));
    });

    expect(result.current.dragKind).toBe('reference');
  });

  it('falls back to "image" for unknown / OS file drags', () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    act(() => {
      result.current.handleDragOver(buildDragEvent({ types: ['Files', 'application/x-moz-file'] }));
    });

    expect(result.current.dragKind).toBe('image');
  });

  it('clears dragKind on drag leave', () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    act(() => {
      result.current.handleDragOver(buildDragEvent({ types: [tauViewerPanelDragMime] }));
    });
    expect(result.current.dragKind).toBe('viewer');

    act(() => {
      result.current.handleDragLeave();
    });
    expect(result.current.dragKind).toBeUndefined();
  });

  it('routes a viewer drop to onViewerScreenshotDrop with the entryFile', () => {
    const onViewerScreenshotDrop = vi.fn();
    const onAddContextChips = vi.fn();
    const { result } = renderHook(() =>
      useChatTextareaLogic({
        ref: undefined,
        onSubmit: vi.fn(async () => undefined),
        onViewerScreenshotDrop,
        onAddContextChips,
      }),
    );

    act(() => {
      void result.current.handleDrop(
        buildDragEvent({
          types: [tauViewerPanelDragMime],
          data: { [tauViewerPanelDragMime]: JSON.stringify({ entryFile: 'models/part.scad' }) },
        }),
      );
    });

    expect(onViewerScreenshotDrop).toHaveBeenCalledExactlyOnceWith('models/part.scad');
    expect(onAddContextChips).not.toHaveBeenCalled();
  });

  it('routes an editor panel drop to onAddContextChips with one path', () => {
    const onViewerScreenshotDrop = vi.fn();
    const onAddContextChips = vi.fn();
    const { result } = renderHook(() =>
      useChatTextareaLogic({
        ref: undefined,
        onSubmit: vi.fn(async () => undefined),
        onViewerScreenshotDrop,
        onAddContextChips,
      }),
    );

    act(() => {
      void result.current.handleDrop(
        buildDragEvent({
          types: [tauEditorPanelDragMime],
          data: { [tauEditorPanelDragMime]: JSON.stringify({ filePath: 'lib/head.scad' }) },
        }),
      );
    });

    expect(onAddContextChips).toHaveBeenCalledExactlyOnceWith(['lib/head.scad']);
    expect(onViewerScreenshotDrop).not.toHaveBeenCalled();
  });

  it('routes a file-tree drop (JSON array payload) to onAddContextChips', () => {
    const onAddContextChips = vi.fn();
    const { result } = renderHook(() =>
      useChatTextareaLogic({
        ref: undefined,
        onSubmit: vi.fn(async () => undefined),
        onAddContextChips,
      }),
    );

    act(() => {
      void result.current.handleDrop(
        buildDragEvent({
          types: [tauFileDragMime],
          data: { [tauFileDragMime]: JSON.stringify(['a/one.ts', 'b/two.ts']) },
        }),
      );
    });

    expect(onAddContextChips).toHaveBeenCalledExactlyOnceWith(['a/one.ts', 'b/two.ts']);
  });

  it('does not call any drop callback when only OS files are present (image branch handles them)', () => {
    const onViewerScreenshotDrop = vi.fn();
    const onAddContextChips = vi.fn();
    const { result } = renderHook(() =>
      useChatTextareaLogic({
        ref: undefined,
        onSubmit: vi.fn(async () => undefined),
        onViewerScreenshotDrop,
        onAddContextChips,
      }),
    );

    act(() => {
      void result.current.handleDrop(buildDragEvent({ types: ['Files'], files: [] }));
    });

    expect(onViewerScreenshotDrop).not.toHaveBeenCalled();
    expect(onAddContextChips).not.toHaveBeenCalled();
  });
});

/**
 * Multi-image OS drag-drop integration. Locks the call sequence and arguments
 * observable from the hook's perspective: each dropped image is read
 * sequentially and dispatched synchronously into `addDraftImage` with the
 * **raw** (un-resized) data URL. The downstream `draftMachine.imageProcessing`
 * chokepoint is responsible for resizing — these tests make sure the hook
 * never re-introduces an inline `resizeImageForChat` step that would silently
 * break per-file ordering.
 */
describe('useChatTextareaLogic — multi-image OS drag-drop dispatch', () => {
  const buildDataTransfer = (files: readonly File[]): DataTransfer =>
    ({
      types: ['Files'],
      files,
      getData: () => '',
    }) as unknown as DataTransfer;

  const buildDragEvent = (files: readonly File[]): React.DragEvent =>
    ({
      preventDefault: vi.fn(),
      dataTransfer: buildDataTransfer(files),
    }) as unknown as React.DragEvent;

  const makeFile = (name: string, type = 'image/png'): File => {
    return Object.assign(new File([new Blob(['stub'])], name, { type }), { __taggedAs: name });
  };

  let originalFileReader: typeof FileReader;
  let readerOutcomes: ReadonlyMap<string, 'ok' | 'error'>;

  beforeEach(() => {
    vi.clearAllMocks();
    chatActionsMock.addDraftImage.mockReset();
    chatActionsMock.addEditDraftImage.mockReset();
    toastErrorMock.mockReset();
    mockActiveModel = stableModel;
    originalFileReader = globalThis.FileReader;
    readerOutcomes = new Map<string, 'ok' | 'error'>();
    class StubReader {
      public result: string | undefined = undefined;
      private readonly listeners = new Map<string, Array<(event: unknown) => void>>();
      public addEventListener(name: string, listener: (event: unknown) => void) {
        const list = this.listeners.get(name) ?? [];
        list.push(listener);
        this.listeners.set(name, list);
      }
      // oxlint-disable-next-line no-empty-function -- jsdom FileReader stub satisfies interface but has no teardown semantics
      public removeEventListener(): void {}
      public readAsDataURL(file: File) {
        const { name } = file;
        const outcome = readerOutcomes.get(name) ?? 'ok';
        queueMicrotask(() => {
          if (outcome === 'error') {
            for (const listener of this.listeners.get('error') ?? []) {
              listener(new Error(`reader-fail-${name}`));
            }
            return;
          }
          this.result = `data:image/png;base64,RAW_${name}`;
          for (const listener of this.listeners.get('load') ?? []) {
            listener({ target: { result: this.result } });
          }
        });
      }
    }
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- jsdom FileReader stub
    globalThis.FileReader = StubReader as unknown as typeof FileReader;
  });

  afterEach(() => {
    globalThis.FileReader = originalFileReader;
  });

  it('should dispatch addDraftImage once per dropped image, in drop order, with raw data URLs', async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    const files = ['A.png', 'B.png', 'C.png', 'D.png', 'E.png'].map((n) => makeFile(n));

    await act(async () => {
      await result.current.handleDrop(buildDragEvent(files));
    });

    expect(chatActionsMock.addDraftImage).toHaveBeenCalledTimes(5);
    const args = chatActionsMock.addDraftImage.mock.calls.map((c) => c[0]);
    expect(args).toEqual([
      'data:image/png;base64,RAW_A.png',
      'data:image/png;base64,RAW_B.png',
      'data:image/png;base64,RAW_C.png',
      'data:image/png;base64,RAW_D.png',
      'data:image/png;base64,RAW_E.png',
    ]);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('should continue dispatching subsequent images when one FileReader fails mid-batch', async () => {
    readerOutcomes = new Map<string, 'ok' | 'error'>([['B.png', 'error']]);

    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    const files = ['A.png', 'B.png', 'C.png', 'D.png', 'E.png'].map((n) => makeFile(n));

    await act(async () => {
      await result.current.handleDrop(buildDragEvent(files));
    });

    expect(chatActionsMock.addDraftImage).toHaveBeenCalledTimes(4);
    const args = chatActionsMock.addDraftImage.mock.calls.map((c) => c[0]);
    expect(args).toEqual([
      'data:image/png;base64,RAW_A.png',
      'data:image/png;base64,RAW_C.png',
      'data:image/png;base64,RAW_D.png',
      'data:image/png;base64,RAW_E.png',
    ]);
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith('Failed to read image');
  });

  it("should toast 'Only images are supported' for non-image files in a mixed batch but still dispatch the images", async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    const files = [makeFile('A.png'), makeFile('doc.pdf', 'application/pdf'), makeFile('C.png')];

    await act(async () => {
      await result.current.handleDrop(buildDragEvent(files));
    });

    expect(chatActionsMock.addDraftImage).toHaveBeenCalledTimes(2);
    const args = chatActionsMock.addDraftImage.mock.calls.map((c) => c[0]);
    expect(args).toEqual(['data:image/png;base64,RAW_A.png', 'data:image/png;base64,RAW_C.png']);
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith('Only images are supported');
  });

  it('should never pre-resize: dispatched URLs are exactly the FileReader-returned data URLs (no shrink)', async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    const files = [makeFile('A.png')];

    await act(async () => {
      await result.current.handleDrop(buildDragEvent(files));
    });

    const dispatched = chatActionsMock.addDraftImage.mock.calls[0]?.[0];
    expect(dispatched).toBe('data:image/png;base64,RAW_A.png');
    expect(dispatched?.startsWith('data:image/png;base64,RAW_')).toBe(true);
  });
});
