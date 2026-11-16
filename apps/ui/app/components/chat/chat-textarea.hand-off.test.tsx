import { act, render, screen, within } from '@testing-library/react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';
import { HandOffSlot } from '#components/hand-off/hand-off-slot.js';
import {
  handOffRevealContext,
  resetHandOffStoreForTest,
  useHandOffAdopted,
} from '#components/hand-off/hand-off-store.js';
import type { HandOffTarget } from '#components/hand-off/hand-off-store.js';

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

const target: HandOffTarget = { surface: 'project-composer', scope: 'home/one' };
const slot = <HandOffSlot surface='project-composer' scope='home/one' label='Chat message' placeholder='Ask Tau' />;

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

    render(<ChatTextarea mode='main' onSubmit={vi.fn()} handOff={target} />);

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

    render(<ChatTextarea mode='main' onSubmit={vi.fn()} handOff={target} />);

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

    render(<ChatTextarea mode='main' onSubmit={vi.fn()} handOff={target} />);

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.desktopMounts).toEqual([expect.objectContaining({ edited: false })]);
  });

  /* A client navigation before adoption: the next project's composer never takes the last project's text. */
  it("should not adopt another project's native input", () => {
    const placeholder = render(<section aria-label='Placeholder'>{slot}</section>);
    const input = within(placeholder.container).getByRole<HTMLTextAreaElement>('textbox');
    input.value = 'For project one';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));

    render(<ChatTextarea mode='main' onSubmit={vi.fn()} handOff={{ ...target, scope: 'home/two' }} />);

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.desktopMounts).toEqual([undefined]);
  });

  it('should adopt nothing without a surface, or once the surface has been adopted', () => {
    render(<section aria-label='Placeholder'>{slot}</section>);

    render(<ChatTextarea mode='edit' onSubmit={vi.fn()} />);
    render(<ChatTextarea mode='main' onSubmit={vi.fn()} handOff={target} />);
    render(<ChatTextarea mode='main' onSubmit={vi.fn()} handOff={target} />);

    expect(mocks.desktopMounts).toEqual([undefined, expect.objectContaining({ edited: false }), undefined]);
  });

  /* A15b: the live composer mounts in panes the split view has not laid out yet (`content-visibility: hidden`), where
   * nothing can be typed into or seen. While the frame still shows, its input stays the one to type in. */
  describe('behind a workspace that is not shown yet', () => {
    const composer = (isShown: boolean, handOff = target): React.JSX.Element => (
      <handOffRevealContext.Provider value={isShown}>
        <ChatTextarea mode='main' onSubmit={vi.fn()} handOff={handOff} />
      </handOffRevealContext.Provider>
    );
    const typeInto = (container: HTMLElement, text: string): HTMLTextAreaElement => {
      const input = within(container).getByRole<HTMLTextAreaElement>('textbox');
      input.focus();
      input.value = text;
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      return input;
    };

    it('should leave the native input in place until the reveal, then adopt it in the reveal commit', () => {
      const placeholder = render(<section aria-label='Placeholder'>{slot}</section>);
      const input = typeInto(placeholder.container, 'Make a hinge');
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      /* The frame's composer box, which leaves on the adoption (review r4586677545): it must leave in the same commit. */
      function FrameBox(): React.JSX.Element {
        return useHandOffAdopted(target) ? <i>no box</i> : <b>frame box</b>;
      }
      const page = (isShown: boolean): React.JSX.Element => (
        <>
          <FrameBox />
          {composer(isShown)}
        </>
      );
      act(() => {
        root.render(page(false));
      });

      expect(mocks.desktopMounts).toEqual([]);
      expect(host).toHaveTextContent('frame box');
      expect(within(placeholder.container).getByRole('textbox')).toBe(input);
      typeInto(placeholder.container, 'Make a hinge.');

      /* Outside `act`, so what the commit leaves is what the browser would paint: the layout phase of the reveal
       * commit adopts, and its re-render lands before paint. */
      const previous = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
      try {
        flushSync(() => {
          root.render(page(true));
        });
        expect(mocks.desktopMounts).toEqual([expect.objectContaining({ text: 'Make a hinge.', edited: true })]);
        expect(host).toHaveTextContent('no box');
        expect(placeholder.container.querySelector('textarea')).toBeNull();
      } finally {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previous;
        act(() => {
          root.unmount();
        });
        host.remove();
      }
    });

    /* A chat lane remembered closed serves no input: the composer has nothing to wait for and mounts empty. */
    it('should mount the composer empty at once when no input was served', () => {
      render(composer(false));

      expect(mocks.desktopMounts).toEqual([undefined]);
      expect(screen.queryByText('Composer skeleton')).toBeNull();
    });

    /* A client move from one project to the next with the same composer mounted: each project's input is its own. */
    it("should adopt the next project's input at its own reveal, never the last one's", () => {
      const first = render(<section aria-label='First'>{slot}</section>);
      typeInto(first.container, 'For project one');
      const view = render(composer(true));
      expect(mocks.desktopMounts).toEqual([expect.objectContaining({ text: 'For project one' })]);

      first.rerender(
        <section aria-label='First'>
          <HandOffSlot surface='project-composer' scope='home/two' label='Chat message' placeholder='Ask Tau' />
        </section>,
      );
      const input = within(first.container).getByRole<HTMLTextAreaElement>('textbox');
      expect(input).toHaveValue('');
      typeInto(first.container, 'For project two');
      view.rerender(composer(false, { ...target, scope: 'home/two' }));
      expect(within(first.container).getByRole('textbox')).toBe(input);

      view.rerender(composer(true, { ...target, scope: 'home/two' }));

      expect(mocks.desktopMounts.at(-1)).toEqual(expect.objectContaining({ text: 'For project two' }));
      expect(first.container.querySelector('textarea')).toBeNull();
    });
  });
});
