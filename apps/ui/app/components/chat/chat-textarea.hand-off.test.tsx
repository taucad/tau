import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';
import { HandOffSlot } from '#components/hand-off/hand-off-slot.js';
import { resetHandOffStoreForTest } from '#components/hand-off/hand-off-store.js';

/* PL6: the project composer adopts the native input the workspace placeholder served (P4). */
const mocks = vi.hoisted(() => {
  const cadRef = { getSnapshot: () => ({ context: { geometry: { format: 'gltf' } } }) };
  const viewSettings: Record<string, { entryPath: string }> = { view: { entryPath: 'main.ts' } };
  return {
    geometryUnits: new Map([['main.ts', cadRef]]),
    viewSettings,
    viewRecords: new Map(Object.entries(viewSettings)),
    viewEntryPaths: new Map([['view', 'main.ts']]),
    graphicsRef: { id: 'graphics' },
    handleAddImage: vi.fn(),
    send: vi.fn(),
    desktopMounts: [] as Array<EarlyChatInput | undefined>,
  };
});

const projectRef = {
  send: vi.fn(),
  getSnapshot: () => ({ context: { geometryUnits: mocks.geometryUnits } }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown } | undefined, selector: (state: unknown) => unknown) =>
    selector(actor?.getSnapshot()),
}));
vi.mock('#components/chat/chat-textarea-types.js', () => ({
  useChatTextareaLogic: () => {
    return {
      imageInputSupported: true,
      handleAddImage: mocks.handleAddImage,
      rejectUnsupportedImageInput: vi.fn(),
      focusInput: vi.fn(),
    };
  },
}));
vi.mock('#components/chat/chat-textarea-desktop.js', () => ({
  ChatTextareaDesktop: ({ earlyInput }: { readonly earlyInput?: EarlyChatInput }) => {
    mocks.desktopMounts.push(earlyInput);
    return <div>Rich composer</div>;
  },
}));
vi.mock('@taucad/ui/components/client-only', () => ({
  ClientOnly: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@taucad/chat-ui/components/chat-textarea-skeleton', () => ({
  ChatTextareaSkeleton: () => <div>Composer skeleton</div>,
}));
vi.mock('#components/chat/chat-approval-banner.js', () => ({ ChatApprovalBanner: () => null }));
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
    session: undefined,
    execution: { execution: { kind: 'native' } },
    runElsewhere: undefined,
    draftActorRef: { send: mocks.send },
  }),
}));
vi.mock('#hooks/use-chat-session.js', () => ({ useChatSessionSnapshot: () => undefined }));
vi.mock('@taucad/chat-ui/services/agent-host-event-projection', () => ({ latestAcpSessionData: () => undefined }));
vi.mock('#providers/headless-image-provider.js', () => ({ useHeadlessImageService: () => ({ export: vi.fn() }) }));
vi.mock('#services/headless-capture.js', () => ({
  captureCadImages: vi.fn(),
  captureFilesToDataUrls: () => ['data:image/webp;base64,AQID'],
  omittedSectionCutsNotice: '',
}));
vi.mock('@taucad/ui/components/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

const slot = <HandOffSlot surface='project-composer' label='Chat message' placeholder='Ask Tau' />;

describe('ChatTextarea hand-off (PL6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.desktopMounts = [];
    resetHandOffStoreForTest();
  });

  it('should move the native edit into the draft before the editor renders, and hand it the caret and focus', () => {
    const placeholder = render(<section aria-label='Placeholder'>{slot}</section>);
    const input = within(placeholder.container).getByRole<HTMLTextAreaElement>('textbox');
    input.focus();
    input.value = 'Make a hinge';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    input.setSelectionRange(4, 4);

    render(<ChatTextarea mode='main' onSubmit={vi.fn()} handOffSurface='project-composer' />);

    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({
      type: 'setDraftText',
      text: 'Make a hinge',
      adoptedEdit: true,
    });
    expect(mocks.desktopMounts).toEqual([
      expect.objectContaining({ text: 'Make a hinge', edited: true, focused: true, start: 4, end: 4 }),
    ]);
    expect(placeholder.container.querySelector('textarea')).toBeNull();
    expect(screen.queryByText('Composer skeleton')).toBeNull();
  });

  it('should hold the skeleton while a composition is open, and adopt once it closes', async () => {
    const placeholder = render(<section aria-label='Placeholder'>{slot}</section>);
    const input = within(placeholder.container).getByRole<HTMLTextAreaElement>('textbox');
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = 'に';

    render(<ChatTextarea mode='main' onSubmit={vi.fn()} handOffSurface='project-composer' />);

    expect(screen.getByText('Composer skeleton')).toBeInTheDocument();
    expect(mocks.desktopMounts).toEqual([]);
    await act(async () => {
      input.value = '日本';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      input.dispatchEvent(new CompositionEvent('compositionend'));
      await Promise.resolve();
    });
    expect(mocks.desktopMounts).toEqual([expect.objectContaining({ text: '日本' })]);
  });

  it('should leave the draft alone when the native input was never edited', () => {
    render(<section aria-label='Placeholder'>{slot}</section>);

    render(<ChatTextarea mode='main' onSubmit={vi.fn()} handOffSurface='project-composer' />);

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.desktopMounts).toEqual([expect.objectContaining({ edited: false })]);
  });

  it('should adopt nothing without a surface, or once the surface has been adopted', () => {
    render(<section aria-label='Placeholder'>{slot}</section>);

    render(<ChatTextarea mode='edit' onSubmit={vi.fn()} />);
    render(<ChatTextarea mode='main' onSubmit={vi.fn()} handOffSurface='project-composer' />);
    render(<ChatTextarea mode='main' onSubmit={vi.fn()} handOffSurface='project-composer' />);

    expect(mocks.desktopMounts).toEqual([undefined, expect.objectContaining({ edited: false }), undefined]);
  });
});
