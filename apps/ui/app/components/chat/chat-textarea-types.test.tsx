// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  resolveKernel,
  tauEditorPanelDragMime,
  tauFileDragMime,
  tauViewerPanelDragMime,
} from '@taucad/types/constants';
import type { ResolvedModel } from '#hooks/use-models.js';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';
import type { DraftAttachmentOptions } from '#hooks/use-chat.js';
import type { DraftAttachment } from '#hooks/draft.machine.js';
import type { ChatTextareaSubmitPayload } from '#components/chat/chat-textarea-types.js';

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

const makeResolvedModel = (
  id = 'chat-scoped-model',
  input: Array<'text' | 'image' | 'pdf'> = ['text', 'image'],
): ResolvedModel =>
  ({
    id,
    name: id,
    family: 'gpt',
    provider: { id: 'openai', name: 'OpenAI' },
    isResolved: true,
    model: {
      support: {
        tools: true,
        toolChoice: true,
        modalities: { input, output: ['text'] },
      },
    } as unknown as NonNullable<ResolvedModel['model']>,
  }) satisfies ResolvedModel;

const stableModel = makeResolvedModel();

let mockActiveModel: ResolvedModel = stableModel;

const chatActionsMock = {
  stop: vi.fn<() => void>(),
  setDraftText: vi.fn<(text: string) => void>(),
  addDraftAttachment: vi.fn<(dataUrl: string, options: DraftAttachmentOptions) => void>(),
  removeDraftAttachment: vi.fn<(index: number) => void>(),
  setDraftToolChoice: vi.fn<(choice: string | string[]) => void>(),
  setEditDraftText: vi.fn<(text: string) => void>(),
  addEditDraftAttachment: vi.fn<(dataUrl: string, options: DraftAttachmentOptions) => void>(),
  removeEditDraftAttachment: vi.fn<(index: number) => void>(),
};

const defaultDraftState = {
  status: 'idle',
  draftText: 'hello world',
  draftAttachments: [] as DraftAttachment[],
  draftToolChoice: 'auto',
  draftMode: 'agent',
  editDraftText: '',
  editDraftAttachments: [] as DraftAttachment[],
};

let draftState = defaultDraftState;

const mockUseChatSelector = vi.fn((selector: (state: unknown) => unknown) => selector(draftState));

const storedPdf: DraftAttachment = { hash: 'b'.repeat(64), mediaType: 'application/pdf', filename: 'spec.pdf' };

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
      execution: {
        execution: { kind: 'tau', model: mockActiveModel.id },
        setActiveExecution: vi.fn(),
      },
      kernel: { kernelId: 'openscad', kernel: resolveKernel('openscad'), setActiveKernel: vi.fn() },
      status: 'ready',
      agentActivity: 'ready',
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
    draftState = defaultDraftState;
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

  it('should invoke onSubmit with ONLY content and attachments when handleSubmit fires (no model / no metadata)', async () => {
    const onSubmit = vi.fn<(payload: ChatTextareaSubmitPayload) => Promise<void>>(async () => undefined);
    const { result } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit }));

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledOnce();
    const submittedPayload = onSubmit.mock.calls[0]?.[0];
    expect(submittedPayload).toEqual({ content: 'hello world', attachments: [] });
  });

  it('should admit only one submit before React commits the submitting state', async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmit = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const { result } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit }));

    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    act(() => {
      first = result.current.handleSubmit();
      second = result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledOnce();
    await act(async () => {
      resolveSubmit?.();
      await Promise.all([first, second]);
    });
  });

  it('should release the synchronous submit guard after rejection', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit }));

    await act(async () => {
      await expect(result.current.handleSubmit()).rejects.toThrow('failed');
    });
    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('should never thread model or metadata to onSubmit even when the chat-scoped model changes between submits', async () => {
    const onSubmit = vi.fn<(payload: ChatTextareaSubmitPayload) => Promise<void>>(async () => undefined);
    const { result, rerender } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit }));

    await act(async () => {
      await result.current.handleSubmit();
    });

    mockActiveModel = makeResolvedModel('next-chat-scoped-model');
    rerender();

    await act(async () => {
      await result.current.handleSubmit();
    });

    for (const call of onSubmit.mock.calls) {
      const submittedPayload = call[0] as Record<string, unknown>;
      expect(submittedPayload).not.toHaveProperty('model');
      expect(submittedPayload).not.toHaveProperty('metadata');
      expect(Object.keys(submittedPayload).sort()).toEqual(['attachments', 'content']);
    }
  });

  it('blocks programmatic and Enter submission while an external prerequisite is unresolved', async () => {
    const onSubmit = vi.fn(async () => undefined);
    const { result } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit, isSubmitDisabled: true }));

    await act(async () => result.current.handleSubmit());
    act(() => {
      result.current.handleTextareaKeyDown({
        key: 'Enter',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('should block Send with the reason when a PDF is in the draft and the model reads only text and images', async () => {
    draftState = { ...defaultDraftState, draftAttachments: [storedPdf] };
    const onSubmit = vi.fn(async () => undefined);
    const { result } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit }));

    expect(result.current.sendBlockReason).toBe(
      "chat-scoped-model can't read PDFs. Remove the PDF or pick another model.",
    );
    await act(async () => result.current.handleSubmit());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('should send the stored PDF reference when the model reads PDFs', async () => {
    mockActiveModel = makeResolvedModel('pdf-model', ['text', 'image', 'pdf']);
    draftState = { ...defaultDraftState, draftAttachments: [storedPdf] };
    const onSubmit = vi.fn(async () => undefined);
    const { result } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit }));

    expect(result.current.sendBlockReason).toBeUndefined();
    expect(result.current.attachmentAccept).toBe('image/jpeg,image/png,image/webp,image/gif,application/pdf');
    await act(async () => result.current.handleSubmit());
    expect(onSubmit).toHaveBeenCalledWith({ content: 'hello world', attachments: [storedPdf] });
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

  it('routes a viewer drop to onViewerScreenshotDrop with the entryPath', () => {
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
          data: { [tauViewerPanelDragMime]: JSON.stringify({ entryPath: 'models/part.scad' }) },
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

  const buildClipboardEvent = (files: readonly File[]) => {
    return {
      preventDefault: vi.fn(),
      clipboardData: buildDataTransfer(files),
    };
  };

  const makeFile = (name: string, type = 'image/png'): File => {
    return Object.assign(new File([new Blob(['stub'])], name, { type }), { __taggedAs: name });
  };

  let originalFileReader: typeof FileReader;
  let readerOutcomes: ReadonlyMap<string, 'ok' | 'error'>;

  beforeEach(() => {
    vi.clearAllMocks();
    chatActionsMock.addDraftAttachment.mockReset();
    chatActionsMock.addEditDraftAttachment.mockReset();
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
          this.result = `data:${file.type};base64,RAW_${name}`;
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

  it('should dispatch addDraftAttachment once per dropped image, in drop order, with raw data URLs', async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    const files = ['A.png', 'B.png', 'C.png', 'D.png', 'E.png'].map((n) => makeFile(n));

    await act(async () => {
      await result.current.handleDrop(buildDragEvent(files));
    });

    expect(chatActionsMock.addDraftAttachment).toHaveBeenCalledTimes(5);
    const args = chatActionsMock.addDraftAttachment.mock.calls.map((c) => c[0]);
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

    expect(chatActionsMock.addDraftAttachment).toHaveBeenCalledTimes(4);
    const args = chatActionsMock.addDraftAttachment.mock.calls.map((c) => c[0]);
    expect(args).toEqual([
      'data:image/png;base64,RAW_A.png',
      'data:image/png;base64,RAW_C.png',
      'data:image/png;base64,RAW_D.png',
      'data:image/png;base64,RAW_E.png',
    ]);
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith('Failed to read image');
  });

  it("should dispatch images and PDFs in drop order with the selected model, and toast 'Only images and PDFs are supported' for the rest", async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    const files = [
      makeFile('A.png'),
      makeFile('doc.pdf', 'application/pdf'),
      makeFile('notes.txt', 'text/plain'),
      makeFile('C.png'),
    ];

    await act(async () => {
      await result.current.handleDrop(buildDragEvent(files));
    });

    const model = { name: 'chat-scoped-model', support: stableModel.model?.support };
    expect(chatActionsMock.addDraftAttachment.mock.calls).toEqual([
      ['data:image/png;base64,RAW_A.png', { filename: 'A.png', model }],
      ['data:application/pdf;base64,RAW_doc.pdf', { filename: 'doc.pdf', model }],
      ['data:image/png;base64,RAW_C.png', { filename: 'C.png', model }],
    ]);
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith('Only images and PDFs are supported');
  });

  it('should hand a picked PDF to the draft machine, which owns the refusal for a model without PDF input', async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );
    const input = { files: [makeFile('doc.pdf', 'application/pdf')], value: 'C:\\fakepath\\doc.pdf' };

    expect(result.current.attachmentAccept).toBe('image/jpeg,image/png,image/webp,image/gif');
    act(() => {
      result.current.handleFileChange({ target: input } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    await waitFor(() => {
      expect(chatActionsMock.addDraftAttachment).toHaveBeenCalledOnce();
    });
    expect(chatActionsMock.addDraftAttachment).toHaveBeenCalledWith('data:application/pdf;base64,RAW_doc.pdf', {
      filename: 'doc.pdf',
      model: { name: 'chat-scoped-model', support: stableModel.model?.support },
    });
    expect(input.value).toBe('');
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('should never pre-resize: dispatched URLs are exactly the FileReader-returned data URLs (no shrink)', async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    const files = [makeFile('A.png')];

    await act(async () => {
      await result.current.handleDrop(buildDragEvent(files));
    });

    const dispatched = chatActionsMock.addDraftAttachment.mock.calls[0]?.[0];
    expect(dispatched).toBe('data:image/png;base64,RAW_A.png');
    expect(dispatched?.startsWith('data:image/png;base64,RAW_')).toBe(true);
  });

  it('should dispatch addDraftAttachment once per pasted image, in paste order, with raw data URLs', async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    const files = ['A.png', 'B.png', 'C.png', 'D.png', 'E.png'].map((n) => makeFile(n));
    const event = buildClipboardEvent(files);

    act(() => {
      expect(result.current.handlePaste(event)).toBe(true);
    });

    await waitFor(() => {
      expect(chatActionsMock.addDraftAttachment).toHaveBeenCalledTimes(5);
    });
    const args = chatActionsMock.addDraftAttachment.mock.calls.map((c) => c[0]);
    expect(args).toEqual([
      'data:image/png;base64,RAW_A.png',
      'data:image/png;base64,RAW_B.png',
      'data:image/png;base64,RAW_C.png',
      'data:image/png;base64,RAW_D.png',
      'data:image/png;base64,RAW_E.png',
    ]);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('should reject direct image adds when the selected model is text-only', () => {
    mockActiveModel = makeResolvedModel('together-glm-5.2', ['text']);

    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    act(() => {
      result.current.handleAddImage('data:image/png;base64,AAA');
    });

    expect(chatActionsMock.addDraftAttachment).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('This model cannot read images', {
      description: 'Switch to a vision-capable model to attach images, or continue with text and GeoSpec.',
    });
  });

  it('should reject pasted images when the selected model is text-only', () => {
    mockActiveModel = makeResolvedModel('together-glm-5.2', ['text']);
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );
    const event = buildClipboardEvent([makeFile('A.png')]);

    act(() => {
      expect(result.current.handlePaste(event)).toBe(true);
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(chatActionsMock.addDraftAttachment).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('This model cannot read images', {
      description: 'Switch to a vision-capable model to attach images, or continue with text and GeoSpec.',
    });
  });

  it('should reject dropped image files when the selected model is text-only', async () => {
    mockActiveModel = makeResolvedModel('together-glm-5.2', ['text']);
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    await act(async () => {
      await result.current.handleDrop(buildDragEvent([makeFile('A.png')]));
    });

    expect(chatActionsMock.addDraftAttachment).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('This model cannot read images', {
      description: 'Switch to a vision-capable model to attach images, or continue with text and GeoSpec.',
    });
  });
});
