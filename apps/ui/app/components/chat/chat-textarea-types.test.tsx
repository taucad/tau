// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ChatAttachmentDirectoriesContext, chatAttachmentDirectories } from '#components/chat/attachment-preview.js';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { render, renderHook, act, waitFor } from '@testing-library/react';
import { mock } from 'vitest-mock-extended';
import {
  resolveKernel,
  tauEditorPanelDragMime,
  tauFileDragMime,
  tauViewerPanelDragMime,
} from '@taucad/types/constants';
import type { CadAgentExecution } from '@taucad/chat';
import type { ResolvedModel } from '#hooks/use-models.js';
import type { ChatComposerContextValue } from '#hooks/active-chat-provider.js';
import type { DraftAttachmentOptions } from '#hooks/use-chat.js';
import type { DraftAttachment, DraftAttachmentSource, PendingDraftImage } from '@taucad/chat-ui/hooks/draft.machine';
import type { ChatTextareaSubmitPayload } from '#components/chat/chat-textarea-types.js';
import { storedRef } from '@taucad/chat-ui/utils/attachment.test-utils';

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
    isNamePending: false,
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
let mockExecution: CadAgentExecution | undefined;
let mockResume: (() => void) | undefined;
let mockStatus: ChatComposerContextValue['status'] = 'ready';
const mockStop = vi.fn<ChatComposerContextValue['stop']>();
let cancelShortcut: (() => void) | undefined;

const chatActionsMock = {
  stop: vi.fn<() => void>(),
  setDraftText: vi.fn<(text: string) => void>(),
  addDraftAttachment: vi.fn<(source: DraftAttachmentSource, options: DraftAttachmentOptions) => void>(),
  removeDraftAttachment: vi.fn<(index: number) => void>(),
  setDraftToolChoice: vi.fn<(choice: string | string[]) => void>(),
  setEditDraftText: vi.fn<(text: string) => void>(),
  addEditDraftAttachment: vi.fn<(source: DraftAttachmentSource, options: DraftAttachmentOptions) => void>(),
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
  attachingMain: false,
  attachingEdit: false,
  pendingMain: [] as PendingDraftImage[],
  pendingEdit: [] as PendingDraftImage[],
};

let draftState = defaultDraftState;

const mockUseChatSelector = vi.fn((selector: (state: unknown) => unknown) => selector(draftState));

const storedPdf: DraftAttachment = storedRef({
  hash: 'b'.repeat(64),
  mediaType: 'application/pdf',
  filename: 'spec.pdf',
});

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
        execution: mockExecution ?? { kind: 'tau', model: mockActiveModel.id },
        setActiveExecution: vi.fn(),
      },
      kernel: {
        kernelId: 'openscad',
        kernel: resolveKernel('openscad'),
        setActiveKernel: vi.fn(),
        preference: 'openscad',
        setActivePreference: vi.fn(),
      },
      status: mockStatus,
      agentActivity: 'ready',
      stop: mockStop,
      resume: mockResume,
      contextUsage: undefined,
      session: undefined,
    }) as unknown as ChatComposerContextValue,
}));

vi.mock('@taucad/ui/components/keyboard', () => ({
  useKeybinding: (_combination: unknown, callback: () => void) => {
    cancelShortcut = callback;
    return { formattedKeyCombination: 'Ctrl+Backspace' };
  },
}));

const toastErrorMock = vi.fn();

vi.mock('@taucad/ui/components/sonner', () => ({
  toast: { error: toastErrorMock },
}));

/** The conversion runtime's derived sources, without loading its definition in jsdom. */
const rasterSources: readonly string[] = ['jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tiff', 'heic', 'heif'];
vi.mock('#services/attachment-transcode-sources-store.js', () => ({
  loadAttachmentTranscodeSources: async () => rasterSources,
  subscribeAttachmentTranscodeSources: () => () => undefined,
  attachmentTranscodeSourcesSnapshot: () => rasterSources,
  noAttachmentTranscodeSources: () => rasterSources,
}));

const { useChatTextareaLogic } = await import('#components/chat/chat-textarea-types.js');

describe('useChatTextareaLogic — onSubmit surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveModel = stableModel;
    mockExecution = undefined;
    mockResume = undefined;
    mockStatus = 'ready';
    draftState = defaultDraftState;
  });

  it('should name the Stop button and the Stop shortcut as different origins', () => {
    mockStatus = 'streaming';
    const { result } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn() }));

    act(() => {
      result.current.handleCancelClick();
      cancelShortcut?.();
    });
    expect(mockStop.mock.calls).toEqual([['stop-button'], ['stop-shortcut']]);
  });

  it('should resume an empty main draft through both submit and Enter without sending a new message', async () => {
    mockResume = vi.fn();
    draftState = { ...defaultDraftState, draftText: '  ' };
    const onSubmit = vi.fn(async () => undefined);
    const { result } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit }));

    expect(result.current.canResume).toBe(true);
    await act(async () => result.current.handleSubmit());
    act(() => {
      result.current.handleTextareaKeyDown(mock<React.KeyboardEvent>({ key: 'Enter', shiftKey: false }));
    });
    expect(mockResume).toHaveBeenCalledTimes(2);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(chatActionsMock.setDraftText).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'text', draftText: 'Keep this draft', draftAttachments: [] },
    {
      name: 'attachment',
      draftText: '',
      draftAttachments: [storedRef({ hash: 'a'.repeat(64), mediaType: 'image/png' })],
    },
  ])('should send a new $name draft instead of resuming the interrupted turn', async (draft) => {
    mockResume = vi.fn();
    draftState = { ...defaultDraftState, ...draft };
    const onSubmit = vi.fn(async () => undefined);
    const { result } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit }));

    expect(result.current.canResume).toBe(false);
    await act(async () => result.current.handleSubmit());
    expect(mockResume).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith({ content: draft.draftText, attachments: draft.draftAttachments });
  });

  it.each(['edit', 'attaching', 'unavailable', 'submitted', 'streaming'] as const)(
    'should not offer or activate Resume while %s',
    async (state) => {
      mockResume = vi.fn();
      mockStatus = state === 'submitted' || state === 'streaming' ? state : 'ready';
      draftState = { ...defaultDraftState, draftText: '', attachingMain: state === 'attaching' };
      const onSubmit = vi.fn(async () => undefined);
      const { result } = renderHook(() =>
        useChatTextareaLogic({
          ref: undefined,
          onSubmit,
          mode: state === 'edit' ? 'edit' : 'main',
          isSubmitDisabled: state === 'unavailable',
        }),
      );

      expect(result.current.canResume).toBe(false);
      await act(async () => result.current.handleSubmit());
      expect(mockResume).not.toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('should stop offering Resume when the session withdraws the action', async () => {
    const resume = vi.fn();
    mockResume = resume;
    draftState = { ...defaultDraftState, draftText: '' };
    const onSubmit = vi.fn(async () => undefined);
    const { result, rerender } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit }));
    expect(result.current.canResume).toBe(true);

    mockResume = undefined;
    rerender();
    expect(result.current.canResume).toBe(false);
    await act(async () => result.current.handleSubmit());
    expect(resume).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
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

  it('should admit ACP images and PDFs offline without using the stale Tau model', () => {
    mockActiveModel = { ...makeResolvedModel('anthropic-claude-haiku-5.5'), isResolved: false, model: undefined };
    draftState = {
      ...defaultDraftState,
      draftAttachments: [storedRef({ hash: 'a'.repeat(64), mediaType: 'image/png' })],
    };

    const { result, rerender } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    expect(result.current.imageInputSupported).toBe(false);
    mockExecution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };
    rerender();

    expect(result.current.imageInputSupported).toBe(true);
    expect(result.current.attachmentInputSupported).toBe(true);
    expect(result.current.attachmentAccept).toContain('image/png');
    expect(result.current.attachmentAccept).toContain('application/pdf');
    expect(result.current.sendBlockReason).toBeUndefined();
    act(() => {
      result.current.handleAddImage('data:image/png;base64,AAA');
    });
    expect(chatActionsMock.addDraftAttachment).toHaveBeenCalledWith('data:image/png;base64,AAA', {
      model: { name: 'codex', support: { modalities: { input: ['text', 'image', 'pdf'], output: ['text'] } } },
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
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

  /* A child acts on the values this hook returns in its own effects, which run before this hook's: the submit it
   * makes as soon as sending is permitted must see the state it was rendered with (P4: a queued submit). */
  it('should accept a submit made from a child effect in the render that permits it', async () => {
    const onSubmit = vi.fn(async () => undefined);
    function Sender({
      submit,
      isDisabled,
    }: {
      readonly submit: () => Promise<void>;
      readonly isDisabled: boolean;
    }): React.ReactNode {
      useEffect(() => {
        if (!isDisabled) {
          void submit();
        }
      }, [isDisabled, submit]);
      return undefined;
    }
    function Composer({ isDisabled }: { readonly isDisabled: boolean }): React.JSX.Element {
      const logic = useChatTextareaLogic({ ref: undefined, onSubmit, isSubmitDisabled: isDisabled });
      return <Sender submit={logic.handleSubmit} isDisabled={logic.isSubmitDisabled} />;
    }
    const view = render(<Composer isDisabled />);
    expect(onSubmit).not.toHaveBeenCalled();
    view.rerender(<Composer isDisabled={false} />);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });
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

  it('should hold Send while an attachment is still being stored, so it is not left behind (F4)', async () => {
    draftState = { ...defaultDraftState, attachingMain: true };
    const onSubmit = vi.fn(async () => undefined);
    const { result } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit }));

    expect(result.current.isAttaching).toBe(true);
    await act(async () => result.current.handleSubmit());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should hand the rail its own draft's images still converting, the main one's or the edit's", () => {
    const converting = [{ isConverting: true }];
    const adding = [{ isConverting: false }];
    draftState = { ...defaultDraftState, attachingMain: true, pendingMain: converting, pendingEdit: adding };

    const main = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn() }));
    const edit = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(), mode: 'edit' }));

    expect(main.result.current.pendingImages).toBe(converting);
    expect(edit.result.current.pendingImages).toBe(adding);
  });

  it('should send the stored PDF reference when the model reads PDFs', async () => {
    mockActiveModel = makeResolvedModel('pdf-model', ['text', 'image', 'pdf']);
    draftState = { ...defaultDraftState, draftAttachments: [storedPdf] };
    const onSubmit = vi.fn(async () => undefined);
    const { result } = renderHook(() => useChatTextareaLogic({ ref: undefined, onSubmit }));

    expect(result.current.sendBlockReason).toBeUndefined();
    expect(result.current.attachmentAccept).toBe(
      'image/jpeg,image/png,image/webp,image/gif,application/pdf,image/avif,.avif,image/bmp,.bmp,.dib,image/tiff,.tif,.tiff,image/heic,.heic,.heif,image/heif',
    );
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
 * sequentially and dispatched synchronously into `addDraftAttachment` with the
 * **raw** (un-resized) data URL. The downstream `draftMachine.imageProcessing`
 * chokepoint is responsible for resizing — these tests make sure the hook
 * never re-introduces an inline conversion step that would silently
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

  // Intake labels a file from its bytes (I1), so each fixture holds the header of what it claims to be.
  const stubBytes = new TextEncoder().encode('%PDF-1.7\n');
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
    0x30, 0x00, 0x00, 0x00, 0x20, 0x08, 0x02, 0x00, 0x00, 0x00,
  ]);
  const jpegBytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x30, 0x03, 0x01, 0x22, 0x00,
  ]);
  const webpBytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 0x0d, 0x00, 0x00,
    0x00, 0x2f, 0x2f, 0xc0, 0x07, 0x00,
  ]);

  const makeFile = (name: string, type = 'image/png', bytes?: Uint8Array<ArrayBuffer>): File => {
    const content =
      bytes ?? (type === 'application/pdf' ? stubBytes : type.startsWith('image/') ? pngBytes : stubBytes);
    // The jsdom File has no `arrayBuffer`; every browser the app supports does.
    return Object.assign(new File([new Blob(['stub'])], name, { type }), {
      __taggedAs: name,
      arrayBuffer: async () => new Uint8Array(content).buffer,
    });
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

  it('should read every dropped file after the browser empties the live FileList', async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    // A live `FileList` the browser empties once the drop handler yields, as Chromium and WebKit do.
    const liveFiles = ['A.png', 'B.png'].map((n) => makeFile(n));

    await act(async () => {
      const dropped = result.current.handleDrop(buildDragEvent(liveFiles));
      liveFiles.length = 0;
      await dropped;
    });

    expect(chatActionsMock.addDraftAttachment.mock.calls.map((c) => c[0])).toEqual([
      'data:image/png;base64,RAW_A.png',
      'data:image/png;base64,RAW_B.png',
    ]);
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

  it('should dispatch images and PDFs in drop order with the selected model, and refuse the rest by name', async () => {
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
      ['data:image/png;base64,RAW_A.png', { filename: 'A.png', declaredType: 'image/png', model }],
      [
        { bytes: stubBytes, mediaType: 'application/pdf' },
        { filename: 'doc.pdf', declaredType: 'application/pdf', model },
      ],
      ['data:image/png;base64,RAW_C.png', { filename: 'C.png', declaredType: 'image/png', model }],
    ]);
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith("Couldn't attach this file", {
      description: 'Only images and PDFs can be attached.',
    });
  });

  it('should resolve a project chat rail against its composer directory, then its transcript (F5)', () => {
    const directories = chatAttachmentDirectories('p1', 'c1');
    const { result } = renderHook(
      () => useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
      {
        wrapper: ({ children }: { readonly children: React.ReactNode }) => (
          <ChatAttachmentDirectoriesContext.Provider value={directories}>
            {children}
          </ChatAttachmentDirectoriesContext.Provider>
        ),
      },
    );

    expect(result.current.attachmentDirectory).toEqual([directories.composer, directories.transcript]);
  });

  it('should add the PDF of a mixed drop on a model that reads no images (S13)', async () => {
    mockActiveModel = makeResolvedModel('pdf-reader', ['text', 'pdf']);
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    await act(async () => {
      await result.current.handleDrop(buildDragEvent([makeFile('A.png'), makeFile('doc.pdf', 'application/pdf')]));
    });

    // The image is refused on its own; the PDF still lands.
    expect(chatActionsMock.addDraftAttachment.mock.calls.map(([source]) => source)).toEqual([
      { bytes: stubBytes, mediaType: 'application/pdf' },
    ]);
  });

  it('should hand a picked PDF to the draft machine, which owns the refusal for a model without PDF input', async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );
    const input = { files: [makeFile('doc.pdf', 'application/pdf')], value: 'C:\\fakepath\\doc.pdf' };

    expect(result.current.attachmentAccept).toBe(
      'image/jpeg,image/png,image/webp,image/gif,image/avif,.avif,image/bmp,.bmp,.dib,image/tiff,.tif,.tiff,image/heic,.heic,.heif,image/heif',
    );
    act(() => {
      result.current.handleFileChange({ target: input } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    await waitFor(() => {
      expect(chatActionsMock.addDraftAttachment).toHaveBeenCalledOnce();
    });
    // A document is handed over as its bytes, never re-encoded as a data URL (S7).
    expect(chatActionsMock.addDraftAttachment).toHaveBeenCalledWith(
      { bytes: stubBytes, mediaType: 'application/pdf' },
      {
        filename: 'doc.pdf',
        declaredType: 'application/pdf',
        model: { name: 'chat-scoped-model', support: stableModel.model?.support },
      },
    );
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
    expect(typeof dispatched === 'string' && dispatched.startsWith('data:image/png;base64,RAW_')).toBe(true);
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

  it('should attach a picked JPEG whose declared type is empty, labelled image/jpeg', async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );
    const input = { files: [makeFile('small.jpg', '', jpegBytes)], value: 'C:\\fakepath\\small.jpg' };

    act(() => {
      result.current.handleFileChange({ target: input } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    await waitFor(() => {
      expect(chatActionsMock.addDraftAttachment).toHaveBeenCalledOnce();
    });
    expect(chatActionsMock.addDraftAttachment.mock.calls[0]?.[0]).toBe('data:image/jpeg;base64,RAW_small.jpg');
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('should attach a pasted JPEG whose declared type is empty, labelled image/jpeg', async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );
    const event = buildClipboardEvent([makeFile('small.jpg', '', jpegBytes)]);

    act(() => {
      expect(result.current.handlePaste(event)).toBe(true);
    });

    await waitFor(() => {
      expect(chatActionsMock.addDraftAttachment).toHaveBeenCalledOnce();
    });
    expect(chatActionsMock.addDraftAttachment.mock.calls[0]?.[0]).toBe('data:image/jpeg;base64,RAW_small.jpg');
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('should label a dropped WebP named .jpg and typed image/jpeg as image/webp', async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    await act(async () => {
      await result.current.handleDrop(buildDragEvent([makeFile('photo.jpg', 'image/jpeg', webpBytes)]));
    });

    expect(chatActionsMock.addDraftAttachment.mock.calls.map(([source]) => source)).toEqual([
      'data:image/webp;base64,RAW_photo.jpg',
    ]);
  });

  it('should refuse a dropped file whose bytes are not an image, whatever its declared type', async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    await act(async () => {
      await result.current.handleDrop(
        buildDragEvent([makeFile('IMG_0001.jpg', 'image/jpeg', new TextEncoder().encode('....ftypheic'))]),
      );
    });

    expect(chatActionsMock.addDraftAttachment).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Couldn't attach this file", {
      description: 'Only images and PDFs can be attached.',
    });
  });

  it('should refuse a dropped image no edge converts, naming its format and the next step', async () => {
    // A Photoshop header: 2 channels, 32×48, 8-bit; PSD is probed but never converted.
    const psd = new Uint8Array(26);
    const view = new DataView(psd.buffer);
    psd.set(new TextEncoder().encode('8BPS'));
    view.setUint16(4, 1);
    view.setUint16(12, 3);
    view.setUint32(14, 32);
    view.setUint32(18, 48);
    view.setUint16(22, 8);
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );

    await act(async () => {
      await result.current.handleDrop(buildDragEvent([makeFile('layout.psd', '', psd)]));
    });

    expect(chatActionsMock.addDraftAttachment).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Couldn't attach this image", {
      description: "Photoshop (PSD) images can't be attached. Save it as JPEG or PNG and attach it again.",
    });
  });

  describe('a file typed application/octet-stream, by pick, drop and paste', () => {
    const octet = 'application/octet-stream';
    // A real HEIC photo, and a 32×48, 8-bit Photoshop header: both read from their bytes, not their declared type.
    const heicBytes = new Uint8Array(
      readFileSync(path.join(import.meta.dirname, '../../../../../libs/utils/src/image-probe.fixtures/small.heic')),
    );
    const psdBytes = (() => {
      const bytes = new Uint8Array(26);
      const view = new DataView(bytes.buffer);
      bytes.set(new TextEncoder().encode('8BPS'));
      view.setUint16(4, 1);
      view.setUint16(12, 3);
      view.setUint32(14, 32);
      view.setUint32(18, 48);
      view.setUint16(22, 8);
      return bytes;
    })();
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

    type Route = 'pick' | 'drop' | 'paste';
    const routes: readonly Route[] = ['pick', 'drop', 'paste'];

    const attach = async (route: Route, file: File): Promise<void> => {
      const { result } = renderHook(() =>
        useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
      );
      if (route === 'pick') {
        act(() => {
          result.current.handleFileChange({
            target: { files: [file], value: '' },
          } as unknown as React.ChangeEvent<HTMLInputElement>);
        });
      } else if (route === 'drop') {
        await act(async () => {
          await result.current.handleDrop(buildDragEvent([file]));
        });
      } else {
        act(() => {
          expect(result.current.handlePaste(buildClipboardEvent([file]))).toBe(true);
        });
      }
    };

    it.each(routes)('should convert a HEIC typed application/octet-stream (%s)', async (route) => {
      await attach(route, makeFile('IMG_0001.HEIC', octet, heicBytes));

      await waitFor(() => {
        expect(chatActionsMock.addDraftAttachment).toHaveBeenCalledOnce();
      });
      expect(chatActionsMock.addDraftAttachment.mock.calls[0]?.[0]).toBe('data:image/heic;base64,RAW_IMG_0001.HEIC');
      expect(toastErrorMock).not.toHaveBeenCalled();
    });

    it.each(routes)('should refuse a PSD typed application/octet-stream by its format (%s)', async (route) => {
      await attach(route, makeFile('layout.psd', octet, psdBytes));

      await waitFor(() => {
        expect(toastErrorMock).toHaveBeenCalledWith("Couldn't attach this image", {
          description: "Photoshop (PSD) images can't be attached. Save it as JPEG or PNG and attach it again.",
        });
      });
      expect(chatActionsMock.addDraftAttachment).not.toHaveBeenCalled();
    });

    it.each(
      routes.flatMap((route) => [
        [route, 'models.zip', zipBytes],
        [route, 'notes.txt', new TextEncoder().encode('just some notes')],
      ]) as ReadonlyArray<readonly [Route, string, Uint8Array<ArrayBuffer>]>,
    )(
      'should refuse non-image bytes typed application/octet-stream as any file (%s %s)',
      async (route, name, bytes) => {
        await attach(route, makeFile(name, octet, bytes));

        await waitFor(() => {
          expect(toastErrorMock).toHaveBeenCalledWith("Couldn't attach this file", {
            description: 'Only images and PDFs can be attached.',
          });
        });
        expect(chatActionsMock.addDraftAttachment).not.toHaveBeenCalled();
      },
    );
  });

  it('should admit a dropped image an edge converts, under the type its bytes hold', async () => {
    const { result } = renderHook(() =>
      useChatTextareaLogic({ ref: undefined, onSubmit: vi.fn(async () => undefined) }),
    );
    // A 48×32, 24-bit BMP header: converted by the raster edge, never stored as is.
    const bmp = new Uint8Array(58);
    const view = new DataView(bmp.buffer);
    bmp.set(new TextEncoder().encode('BM'));
    view.setUint32(2, 58, true);
    view.setUint32(10, 54, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, 48, true);
    view.setInt32(22, 32, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);

    await act(async () => {
      await result.current.handleDrop(buildDragEvent([makeFile('scan.bmp', 'image/bmp', bmp)]));
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(
      chatActionsMock.addDraftAttachment.mock.calls.map(([source, options]) => [source, options.declaredType]),
    ).toEqual([['data:image/bmp;base64,RAW_scan.bmp', 'image/bmp']]);
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
