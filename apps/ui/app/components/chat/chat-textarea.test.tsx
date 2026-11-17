import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { ContextSuggestionItem } from '@taucad/chat-ui/components/tiptap/suggestion-types';
import { toast } from '@taucad/ui/components/sonner';
import { captureCadImages } from '#services/headless-capture.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import { readDraftHint } from '#lib/frame-hint-draft.js';
import { HandOffSlot } from '#components/hand-off/hand-off-slot.js';
import { resetHandOffStoreForTest } from '#components/hand-off/hand-off-store.js';
import type { HandOffElement } from '#components/hand-off/hand-off.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';

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
    onEarlyInputAdopted: undefined as (() => boolean) | undefined,
    draftSend: vi.fn(),
    isRecordUnread: true,
    isHome: false,
    recordDraft: undefined as string | undefined,
    recordDraftFile: false,
    paintedSendVerdict: undefined as unknown,
    cloudIntent: undefined as 'open' | undefined,
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
    onEarlyInputAdopted,
    paintedSendVerdict,
  }: {
    readonly onScreenshotAction: (item: ContextSuggestionItem) => void;
    readonly actionItems: ContextSuggestionItem[];
    readonly earlyInput?: unknown;
    readonly onEarlyInputAdopted?: () => boolean;
    readonly paintedSendVerdict?: unknown;
  }) => {
    mocks.earlyInput = earlyInput;
    mocks.paintedSendVerdict = paintedSendVerdict;
    mocks.onEarlyInputAdopted = onEarlyInputAdopted;
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
vi.mock('#hooks/use-cloud-projects.js', () => ({ useTauCloudIntent: () => mocks.cloudIntent }));
vi.mock('#hooks/use-chat-records.js', () => ({ useChatRecords: () => ({ chats: [] }) }));
vi.mock('#hooks/use-chat.js', () => ({
  useDraftActions: () => ({ setDraftText: vi.fn(), setEditDraftText: vi.fn() }),
}));
/** The composer record the mock serves: a chat's under a session, or Home's own. */
const recordRefMock = {
  getSnapshot: () => ({
    matches: () => mocks.isRecordUnread,
    context: {
      record:
        mocks.recordDraft === undefined
          ? undefined
          : {
              version: 1,
              draft: {
                id: 'd',
                role: 'user',
                parts: [
                  { type: 'text', text: mocks.recordDraft },
                  ...(mocks.recordDraftFile
                    ? [{ type: 'file', mediaType: 'image/png', url: 'tau-attachment://photo' }]
                    : []),
                ],
              },
            },
    },
  }),
};
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    session:
      mocks.activeChatId === undefined
        ? undefined
        : { activeChatId: mocks.activeChatId, composerRecordRef: recordRefMock },
    homeRecordRef: mocks.isHome ? recordRefMock : undefined,
    execution: { execution: { kind: 'native' } },
    runElsewhere: mocks.runElsewhere,
    draftActorRef: { send: mocks.draftSend, getSnapshot: () => ({ context: { draftText: mocks.inputText } }) },
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

/* A15d on PL6's hand-off: a painted draft nobody edited is the draft only while the chat's record is unread and the
 * draft holds nothing (`hydrateDraft`, so the record still wins), and only for its own chat. */
describe('ChatTextarea painted draft hand-off', () => {
  beforeEach(() => {
    resetHandOffStoreForTest();
    mocks.draftSend.mockClear();
  });

  /** Serve the project's native input, painted with a stored draft as the served recorder paints one. */
  const servePainted = (text: string, chatId?: string): void => {
    render(<HandOffSlot surface='project-composer' scope='acme/bracket' label='Chat message' placeholder='Ask Tau' />);
    const input = document.querySelector<HandOffElement>('textarea[aria-label="Chat message"]')!;
    input.value = text;
    Object.assign(input.tauHandOff!, { prefill: text, ...(chatId === undefined ? {} : { prefillChat: chatId }) });
  };

  it.each([
    { draftText: '', isRecordUnread: true, chatId: undefined, isHydrated: true },
    { draftText: '', isRecordUnread: true, chatId: 'c1', isHydrated: true },
    /* The record is read already and holds a draft, which wins. */
    { draftText: 'from the record', isRecordUnread: false, chatId: undefined, isHydrated: false },
    /* The record is read already and holds no draft (sent on another device): the hint is older. */
    { draftText: '', isRecordUnread: false, chatId: undefined, isHydrated: false },
    /* Another chat's draft is not this chat's. */
    { draftText: '', isRecordUnread: true, chatId: 'c2', isHydrated: false },
  ])(
    'takes a painted draft nobody edited as the draft while the draft holds "$draftText", the record is unread: $isRecordUnread, for chat $chatId (hydrated: $isHydrated)',
    ({ draftText, isRecordUnread, chatId, isHydrated }) => {
      mocks.inputText = draftText;
      mocks.isRecordUnread = isRecordUnread;
      mocks.activeChatId = 'c1';
      servePainted('Fillet it', chatId);
      render(<ChatTextarea onSubmit={vi.fn()} handOff={{ surface: 'project-composer', scope: 'acme/bracket' }} />);
      expect(mocks.earlyInput).toMatchObject({ text: 'Fillet it', edited: false, prefilled: true });
      let isTaken: boolean | undefined;
      act(() => {
        isTaken = mocks.onEarlyInputAdopted?.();
      });
      /* The editor keeps the painted text only where the draft takes it. */
      expect(isTaken).toBe(isHydrated);
      if (isHydrated) {
        expect(mocks.draftSend).toHaveBeenCalledOnce();
        const [event] = mocks.draftSend.mock.calls[0] as [{ type: string; draft: { parts: unknown[] } }];
        expect(event.type).toBe('hydrateDraft');
        expect(event.draft.parts).toEqual([{ type: 'text', text: 'Fillet it' }]);
      } else {
        expect(mocks.draftSend).not.toHaveBeenCalled();
      }
      mocks.inputText = '';
      mocks.isRecordUnread = true;
      mocks.activeChatId = undefined;
    },
  );
});

/* Ruling 2026-11-17T03:28Z: an Enter on a painted draft nobody edited is replayed only when the chat's record holds that
 * text, and cancelled with the record's text otherwise. */
describe('ChatTextarea Enter queued on a painted draft', () => {
  beforeEach(() => {
    resetHandOffStoreForTest();
    mocks.draftSend.mockClear();
    mocks.activeChatId = 'c1';
    onTestFinished(() => {
      mocks.activeChatId = undefined;
      mocks.isRecordUnread = true;
      mocks.recordDraft = undefined;
      mocks.recordDraftFile = false;
    });
  });

  const serveQueued = (text: string, chatId?: string): void => {
    render(<HandOffSlot surface='project-composer' scope='acme/bracket' label='Chat message' placeholder='Ask Tau' />);
    const input = document.querySelector<HandOffElement>('textarea[aria-label="Chat message"]')!;
    input.value = text;
    Object.assign(input.tauHandOff!, {
      prefill: text,
      submitQueued: true,
      ...(chatId === undefined ? {} : { prefillChat: chatId }),
    });
  };

  it.each([
    {
      name: 'the record is unread',
      isRecordUnread: true,
      recordDraft: undefined,
      chatId: 'c1',
      verdict: { kind: 'wait' },
    },
    {
      name: 'the record holds the same text',
      isRecordUnread: false,
      recordDraft: 'Fillet it',
      chatId: 'c1',
      verdict: { kind: 'send' },
    },
    {
      name: 'the record holds another text',
      isRecordUnread: false,
      recordDraft: 'Chamfer it',
      chatId: 'c1',
      verdict: { kind: 'cancel', recordText: 'Chamfer it' },
    },
    {
      name: 'the record holds no draft',
      isRecordUnread: false,
      recordDraft: undefined,
      chatId: 'c1',
      verdict: { kind: 'cancel', recordText: '' },
    },
    /* The hint holds text only: a draft that also holds an attachment is not what the box showed (review round 20). */
    {
      name: 'the record holds the same text with an attachment',
      isRecordUnread: false,
      recordDraft: 'Fillet it',
      recordDraftFile: true,
      chatId: 'c1',
      verdict: { kind: 'cancel', recordText: 'Fillet it' },
    },
    {
      name: 'the painted draft was another chat’s',
      isRecordUnread: false,
      recordDraft: 'Fillet it',
      chatId: 'c2',
      verdict: { kind: 'cancel', recordText: 'Fillet it' },
    },
  ])(
    'should decide the queued send when $name',
    ({ isRecordUnread, recordDraft, recordDraftFile = false, chatId, verdict }) => {
      mocks.isRecordUnread = isRecordUnread;
      mocks.recordDraft = recordDraft;
      mocks.recordDraftFile = recordDraftFile;
      serveQueued('Fillet it', chatId);
      render(<ChatTextarea onSubmit={vi.fn()} handOff={{ surface: 'project-composer', scope: 'acme/bracket' }} />);
      expect(mocks.earlyInput).toMatchObject({ text: 'Fillet it', prefilled: true, submitQueued: true });
      expect(mocks.paintedSendVerdict).toEqual(verdict);
    },
  );

  /* Ruling 2026-11-17T03:43Z: Home's painted draft is decided from Home's record the same way (review round 22: a
   * record read with no draft, or one still unread, let the Enter send the painted text). */
  it.each([
    { name: 'the record is unread', isRecordUnread: true, recordDraft: undefined, verdict: { kind: 'wait' } },
    {
      name: 'the record holds no draft',
      isRecordUnread: false,
      recordDraft: undefined,
      verdict: { kind: 'cancel', recordText: '' },
    },
    {
      name: 'the record holds the same text',
      isRecordUnread: false,
      recordDraft: 'Fillet it',
      verdict: { kind: 'send' },
    },
    {
      name: 'the record holds another text',
      isRecordUnread: false,
      recordDraft: 'Chamfer it',
      verdict: { kind: 'cancel', recordText: 'Chamfer it' },
    },
  ])('should decide a queued send on Home’s painted draft when $name', ({ isRecordUnread, recordDraft, verdict }) => {
    mocks.activeChatId = undefined;
    mocks.isHome = true;
    mocks.isRecordUnread = isRecordUnread;
    mocks.recordDraft = recordDraft;
    onTestFinished(() => {
      mocks.isHome = false;
    });
    const adopted: EarlyChatInput = {
      text: 'Fillet it',
      edited: false,
      focused: true,
      focusUnclaimed: false,
      start: 9,
      end: 9,
      direction: 'none',
      scrollTop: 0,
      submitQueued: true,
      prefilled: true,
    };
    render(<ChatTextarea onSubmit={vi.fn()} adoptedEarlyInput={adopted} />);
    expect(mocks.paintedSendVerdict).toEqual(verdict);
  });

  it('should leave an edited Enter to the composer', () => {
    render(<HandOffSlot surface='project-composer' scope='acme/bracket' label='Chat message' placeholder='Ask Tau' />);
    const input = document.querySelector<HandOffElement>('textarea[aria-label="Chat message"]')!;
    input.value = 'Typed';
    Object.assign(input.tauHandOff!, { edited: true, submitQueued: true });
    render(<ChatTextarea onSubmit={vi.fn()} handOff={{ surface: 'project-composer', scope: 'acme/bracket' }} />);
    expect(mocks.paintedSendVerdict).toBeUndefined();
  });
});

/* SP2h: the chats open while a Tau Cloud open still writes the files; a turn in this checkout waits for them. */
describe('ChatTextarea while a Tau Cloud open writes the files', () => {
  beforeEach(() => {
    mocks.runElsewhere = undefined;
    mocks.cloudIntent = undefined;
  });

  it('should hold a send this document would run until the files have landed', () => {
    mocks.cloudIntent = 'open';

    render(<ChatTextarea onSubmit={vi.fn()} />);

    expect(mocks.logicOptions?.isSubmitDisabled).toBe(true);
  });
});
