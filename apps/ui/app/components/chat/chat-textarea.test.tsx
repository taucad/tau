import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextSuggestionItem } from '#components/chat/tiptap/suggestion-types.js';
import { toast } from '#components/ui/sonner.js';
import { captureCadImages } from '#services/headless-capture.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';

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
  useChatTextareaLogic: () => ({
    imageInputSupported: true,
    handleAddImage: mocks.handleAddImage,
    rejectUnsupportedImageInput: vi.fn(),
    focusInput: vi.fn(),
  }),
}));
vi.mock('#components/chat/chat-textarea-desktop.js', () => ({
  ChatTextareaDesktop: ({
    onScreenshotAction,
    actionItems,
  }: {
    readonly onScreenshotAction: (item: ContextSuggestionItem) => void;
    readonly actionItems: ContextSuggestionItem[];
  }) => {
    mocks.onScreenshotAction = onScreenshotAction;
    mocks.actionItems = actionItems;
    return null;
  },
}));
vi.mock('#components/ui/utils/client-only.js', () => ({
  ClientOnly: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('#components/chat/chat-textarea-skeleton.js', () => ({ ChatTextareaSkeleton: () => null }));
vi.mock('#components/chat/chat-approval-banner.js', () => ({ ChatApprovalBanner: () => null }));
vi.mock('#components/chat/tiptap/context-suggestion.utils.js', () => ({ takeScreenshotGroup: 'Take Screenshot' }));
vi.mock('#components/chat/chat-context-insertion.js', () => ({
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
  useChatComposer: () => ({ session: undefined, execution: { execution: { kind: 'native' } } }),
}));
vi.mock('#hooks/use-chat-session.js', () => ({ useChatSessionSnapshot: () => undefined }));
vi.mock('#services/agent-host-event-projection.js', () => ({ latestAcpSessionData: () => undefined }));
vi.mock('#providers/headless-image-provider.js', () => ({ useHeadlessImageService: () => ({ export: vi.fn() }) }));
vi.mock('#services/headless-capture.js', () => ({
  captureCadImages: vi.fn(),
  captureFilesToDataUrls: () => ['data:image/webp;base64,AQID'],
  omittedSectionCutsNotice: mocks.notice,
}));
vi.mock('#components/ui/sonner.js', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

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
