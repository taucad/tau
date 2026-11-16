import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextSuggestionItem } from '@taucad/chat-ui/components/tiptap/suggestion-types';
import { toast } from '@taucad/ui/components/sonner';
import { captureCadImages } from '#services/headless-capture.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import { readDraftHint } from '#lib/frame-hint-draft.js';
import { EarlyInputHandoverContext } from '#components/chat/chat-early-input-field.js';
import type { EarlyChatInput, EarlyInputHandover } from '#components/chat/chat-early-input-field.js';

const mocks = vi.hoisted(() => {
  const cadRef = { getSnapshot: () => ({ context: { geometry: { format: 'gltf' } } }) };
  const secondaryCadRef = { getSnapshot: () => ({ context: { geometry: { format: 'gltf' } } }) };
  const viewSettings: Record<string, { entryPath: string }> = { view: { entryPath: 'main.ts' } };
  return {
    cadRef,
    secondaryCadRef,
    geometryUnits: new Map([['main.ts', cadRef]]),
    viewSettings,
    viewRecords: new Map(Object.entries(viewSettings)),
    viewEntryPaths: new Map([['view', 'main.ts']]),
    graphicsRef: { id: 'graphics' },
    handleAddImage: vi.fn(),
    onScreenshotAction: undefined as ((item: ContextSuggestionItem) => void) | undefined,
    actionItems: [] as ContextSuggestionItem[],
    notice: 'Section cutaways narrower than 180° are not shown in captures.',
    logicOptions: undefined as { readonly isSubmitDisabled?: boolean } | undefined,
    runElsewhere: undefined as { readonly runId: string } | undefined,
    inputText: '',
    earlyInput: undefined as unknown,
    activeChatId: undefined as string | undefined,
  };
});

const projectRef = {
  send: vi.fn((event: { type: string; entryPath?: string; claimId?: string }) => {
    if (event.type === 'claimGeometryUnit' && event.entryPath === 'other.ts') {
      mocks.geometryUnits.set('other.ts', mocks.secondaryCadRef);
    }
  }),
  getSnapshot: () => ({ context: { geometryUnits: mocks.geometryUnits } }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown } | undefined, selector: (state: unknown) => unknown) =>
    selector(actor?.getSnapshot()),
}));
vi.mock('#components/chat/chat-textarea-types.js', () => ({
  useChatTextareaLogic: (options: { readonly isSubmitDisabled?: boolean }) => {
    mocks.logicOptions = options;
    return {
      inputText: mocks.inputText,
      imageInputSupported: true,
      handleAddImage: mocks.handleAddImage,
      rejectUnsupportedImageInput: vi.fn(),
      focusInput: vi.fn(),
    };
  },
}));
vi.mock('#components/chat/chat-textarea-desktop.js', () => ({
  ChatTextareaDesktop: ({
    onScreenshotAction,
    actionItems,
    earlyInput,
  }: {
    readonly onScreenshotAction: (item: ContextSuggestionItem) => void;
    readonly actionItems: ContextSuggestionItem[];
    readonly earlyInput?: unknown;
  }) => {
    mocks.earlyInput = earlyInput;
    mocks.onScreenshotAction = onScreenshotAction;
    mocks.actionItems = actionItems;
    return null;
  },
}));
vi.mock('@taucad/ui/components/client-only', () => ({
  ClientOnly: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@taucad/chat-ui/components/chat-textarea-skeleton', () => ({ ChatTextareaSkeleton: () => null }));
vi.mock('#components/chat/chat-approval-banner.js', () => ({ ChatApprovalBanner: () => null }));
vi.mock('#components/chat/chat-placement-notice.js', () => ({ ChatPlacementNotice: () => null }));
vi.mock('@taucad/chat-ui/components/tiptap/context-suggestion.utils', () => ({
  takeScreenshotGroup: 'Take Screenshot',
}));
vi.mock('@taucad/chat-ui/components/chat-context-insertion', () => ({
  useChatContextInsertion: () => ({ registerContextReferenceInserter: vi.fn() }),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectId: 'project',
    mainEntryPath: 'main.ts',
    geometryUnits: mocks.geometryUnits,
    viewGraphics: new Map([['view', mocks.graphicsRef]]),
    viewRecords: mocks.viewRecords,
    viewEntryPaths: mocks.viewEntryPaths,
    editorRef: { getSnapshot: () => ({ context: { viewSettings: mocks.viewSettings } }) },
    projectRef,
  }),
}));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => ({ treeService: undefined }) }));
vi.mock('#hooks/use-chat-records.js', () => ({ useChatRecords: () => ({ chats: [] }) }));
vi.mock('#hooks/use-chat.js', () => ({
  useDraftActions: () => ({ setDraftText: vi.fn(), setEditDraftText: vi.fn() }),
}));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    session: mocks.activeChatId === undefined ? undefined : { activeChatId: mocks.activeChatId },
    execution: { execution: { kind: 'native' } },
    runElsewhere: mocks.runElsewhere,
  }),
}));
vi.mock('#hooks/use-chat-session.js', () => ({ useChatSessionSnapshot: () => undefined }));
vi.mock('@taucad/chat-ui/services/agent-host-event-projection', () => ({ latestAcpSessionData: () => undefined }));
vi.mock('#providers/headless-image-provider.js', () => ({ useHeadlessImageService: () => ({ export: vi.fn() }) }));
vi.mock('#services/headless-capture.js', () => ({
  captureCadImages: vi.fn(),
  captureFilesToDataUrls: () => ['data:image/webp;base64,AQID'],
  omittedSectionCutsNotice: mocks.notice,
}));
vi.mock('@taucad/ui/components/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

const currentView: ContextSuggestionItem = {
  id: 'screenshot-current-view',
  label: 'Current view',
  chipType: 'screenshot',
  group: 'Take Screenshot',
  isAction: true,
  screenshotAction: { type: 'single' },
};

/** Takes a screenshot of the current view from the composer, as its screenshot menu does. */
const captureCurrentView = async (omittedSectionCutIds: readonly string[]): Promise<void> => {
  vi.mocked(captureCadImages).mockResolvedValue({
    files: [{ name: 'capture.webp', mimeType: 'image/webp', bytes: new Uint8Array([1, 2, 3]) }],
    omittedSectionCutIds,
  });
  render(<ChatTextarea onSubmit={vi.fn()} />);
  act(() => {
    mocks.onScreenshotAction?.(currentView);
  });
  await vi.waitFor(() => {
    expect(mocks.handleAddImage).toHaveBeenCalledWith('data:image/webp;base64,AQID', { preserveOriginal: true });
  });
};

describe('ChatTextarea screenshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.geometryUnits.delete('other.ts');
    delete mocks.viewSettings['parked'];
    mocks.viewRecords.delete('parked');
    mocks.viewEntryPaths.set('view', 'main.ts');
  });

  it('should say when a screenshot it adds leaves a section cut out', async () => {
    await captureCurrentView(['cutaway']);

    expect(captureCadImages).toHaveBeenCalledWith(
      expect.objectContaining({ cadRef: mocks.cadRef, graphicsRef: mocks.graphicsRef }),
    );
    expect(toast.warning).toHaveBeenCalledWith(mocks.notice);
  });

  it('should add a screenshot that leaves nothing out without a notice', async () => {
    await captureCurrentView([]);

    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('should not capture the graphics of an unrelated entry as the main view', async () => {
    mocks.viewEntryPaths.set('view', 'other.ts');
    await captureCurrentView([]);
    expect(captureCadImages).toHaveBeenCalledWith(expect.objectContaining({ graphicsRef: undefined }));
  });

  it('discovers a restored parked entry and captures only after claiming its actor', async () => {
    mocks.viewSettings['parked'] = { entryPath: 'other.ts' };
    mocks.viewRecords.set('parked', { entryPath: 'other.ts' });
    vi.mocked(captureCadImages).mockResolvedValue({ files: [], omittedSectionCutIds: [] });
    render(<ChatTextarea onSubmit={vi.fn()} />);
    const item = mocks.actionItems.find((action) => action.id === 'screenshot-view:other.ts');
    expect(item).toBeDefined();
    if (!item) {
      throw new Error('Missing restored entry action');
    }
    expect(mocks.geometryUnits.has('other.ts')).toBe(false);
    act(() => {
      mocks.onScreenshotAction?.(item);
    });
    await vi.waitFor(() => {
      expect(captureCadImages).toHaveBeenCalledWith(
        expect.objectContaining({
          cadRef: mocks.secondaryCadRef,
          recipe: { purpose: 'chat', mode: 'isometric' },
        }),
      );
    });
    const claim = projectRef.send.mock.calls.find(([event]) => event.type === 'claimGeometryUnit')?.[0];
    expect(claim).toMatchObject({ entryPath: 'other.ts' });
    expect(projectRef.send).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: claim?.claimId });
  });
});

/* XD3: another device runs this chat, so its host would refuse a send; the composer holds it until that run ends. */
describe('ChatTextarea while another device runs the chat', () => {
  beforeEach(() => {
    mocks.runElsewhere = undefined;
  });

  it('should hold the send while another device runs the chat', () => {
    mocks.runElsewhere = { runId: 'run-desktop' };

    render(<ChatTextarea onSubmit={vi.fn()} />);

    expect(mocks.logicOptions?.isSubmitDisabled).toBe(true);
  });

  it('should leave the send to the caller otherwise', () => {
    render(<ChatTextarea onSubmit={vi.fn()} />);

    expect(mocks.logicOptions?.isSubmitDisabled).toBe(false);
  });
});

/* A15d review round 4: the project composer mirrors its draft under the project's URL key, with its chat. */
describe('ChatTextarea draft hint', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.history.replaceState(null, '', '/w/acme/bracket');
    mocks.activeChatId = 'chat-1';
  });

  it('writes the main draft under the URL key with its chat, removes it when the draft empties', () => {
    mocks.inputText = 'Fillet the edges';
    const view = render(<ChatTextarea onSubmit={vi.fn()} />);
    expect(readDraftHint({ kind: 'project', key: 'acme/bracket' })).toMatchObject({
      text: 'Fillet the edges',
      chatId: 'chat-1',
    });

    mocks.inputText = '';
    view.rerender(<ChatTextarea onSubmit={vi.fn()} />);
    expect(readDraftHint({ kind: 'project', key: 'acme/bracket' })).toBeUndefined();
    view.unmount();
    globalThis.history.replaceState(null, '', '/');
    mocks.inputText = '';
    mocks.activeChatId = undefined;
  });
});

/* A15d review round 5: the main composer claims the frame's input for its project and keeps it once taken. */
describe('ChatTextarea frame early input', () => {
  const input: EarlyChatInput = {
    text: 'abc',
    edited: true,
    focused: true,
    focusUnclaimed: false,
    start: 3,
    end: 3,
    direction: 'none',
    queuedSend: true,
    prefilled: false,
  };
  const handoverWith = (
    pending: EarlyChatInput | undefined,
    claim: EarlyInputHandover['claim'],
  ): EarlyInputHandover => ({
    pending,
    release: vi.fn(),
    claim,
    taken: vi.fn(),
    decline: vi.fn(),
  });

  it('claims for its project, takes the pending input, and keeps it after the frame forgets it', () => {
    const unclaim = vi.fn();
    const claim = vi.fn((_projectId: string) => unclaim);
    const pending = handoverWith(input, claim);
    const view = render(
      <EarlyInputHandoverContext.Provider value={pending}>
        <ChatTextarea onSubmit={vi.fn()} />
      </EarlyInputHandoverContext.Provider>,
    );
    expect(claim).toHaveBeenCalledWith('project');
    expect(mocks.earlyInput).toBe(input);
    const forgotten = handoverWith(undefined, claim);
    view.rerender(
      <EarlyInputHandoverContext.Provider value={forgotten}>
        <ChatTextarea onSubmit={vi.fn()} />
      </EarlyInputHandoverContext.Provider>,
    );
    expect(mocks.earlyInput).toBe(input);
    view.unmount();
    expect(unclaim).toHaveBeenCalled();
  });
});
