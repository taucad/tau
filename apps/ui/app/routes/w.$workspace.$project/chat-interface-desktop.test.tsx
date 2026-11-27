import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import type * as ProjectWorkspaceContext from '#routes/w.$workspace.$project/project-workspace-context.js';

const send = vi.fn();
const setWorkbenchOpen = vi.hoisted(() => vi.fn());
const sidebar = vi.hoisted(() => ({ open: true }));
const renderViewer = vi.hoisted(() => vi.fn());
/* Whether the mocked split view reports its first layout, as the native one does once it has measured. */
const splitView = vi.hoisted(() => ({
  laysOut: false,
  /* The panes' widths after the first layout, as the native split view's views measure. */
  sizes: undefined as readonly number[] | undefined,
  resize: vi.fn<(sizes: number[]) => void>(),
}));
const desktopLayout = {
  chatOpen: true,
  workbenchOpen: true,
  chatWidth: 320,
  workbenchWidth: 420,
  compactAuxiliary: 'chat' as 'chat' | 'workbench',
};
const editorState = { isReady: true };
const snapshot = {
  context: { panelState: { desktopLayout } },
  matches: () => editorState.isReady,
};

vi.mock('@xstate/react', () => ({
  useSelector: (_actor: unknown, selector: (value: typeof snapshot) => unknown) => selector(snapshot),
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ editorRef: { send } }) }));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectWorkspaceContext>()),
  useProjectWorkspace: () => ({ setChatOpen: vi.fn(), setWorkbenchOpen }),
}));
vi.mock('#routes/w.$workspace.$project/chat-history.js', async () => {
  const { useContext } = await import('react');
  const { handOffRevealContext } = await import('#components/hand-off/hand-off-store.js');
  return {
    ChatHistory: function ChatHistory({
      className,
      headerClassName,
      archiveClassName,
    }: {
      readonly className?: string;
      readonly headerClassName?: string;
      readonly archiveClassName?: string;
    }) {
      /* Whether the composer may adopt the frame's native input yet (PL6). */
      const isRevealed = useContext(handOffRevealContext);
      return (
        <div className={className} data-testid='chat-lane' data-hand-off-revealed={String(isRevealed)}>
          <div data-testid='chat-lane-header' className={headerClassName} />
          <div data-testid='chat-lane-archive' className={archiveClassName} />
          <textarea aria-label='Chat message' />
        </div>
      );
    },
  };
});
vi.mock('#routes/w.$workspace.$project/focused-chat-gate.js', () => ({
  ChatHistoryGate: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ChatInterfaceSessionGate: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/chat-viewer-dockview.js', () => ({
  ViewerDockview: () => {
    renderViewer();
    return <div data-testid='viewer-lane' />;
  },
}));
vi.mock('#routes/w.$workspace.$project/chat-workbench-dockview.js', () => ({
  WorkbenchDockview: () => <div data-testid='workbench-lane' />,
  getWorkbenchTabIcon: () => undefined,
}));
vi.mock('#components/panes/dockview-styles.js', () => ({
  DockviewStyles: () => <span data-testid='dockview-styles' />,
}));
vi.mock('#routes/w.$workspace.$project/project-unavailable-overlay.js', () => ({
  ProjectUnavailableOverlay: () => null,
}));
vi.mock('#components/ui/sidebar.js', () => ({ useSidebar: () => sidebar }));
vi.mock('@taucad/chat-ui/components/chat-context-insertion', () => ({
  ChatContextInsertionProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('allotment', async () => {
  const { Children, useImperativeHandle, useLayoutEffect } = await import('react');
  const Pane = ({
    children,
    visible = true,
    minSize,
  }: React.PropsWithChildren<{ readonly visible?: boolean; readonly minSize?: number }>) => (
    <div data-pane data-visible={visible} data-min-size={minSize}>
      {children}
    </div>
  );
  const Allotment = Object.assign(
    ({
      children,
      className,
      onChange,
      ref,
    }: React.PropsWithChildren<{
      readonly className?: string;
      readonly onChange?: (sizes: number[]) => void;
      readonly ref?: React.Ref<{ resize: (sizes: number[]) => void; reset: () => void }>;
    }>) => {
      useImperativeHandle(ref, () => ({ resize: splitView.resize, reset: () => undefined }));
      useLayoutEffect(() => {
        if (splitView.laysOut) {
          onChange?.([...(splitView.sizes ?? [320, 500, 420])]);
        }
      }, [onChange]);
      return (
        <div data-testid='allotment' className={className}>
          {splitView.sizes === undefined ? (
            children
          ) : (
            <div className='split-view-container'>
              {Children.map(children, (child, index) => (
                <div data-view-width={splitView.sizes?.[index]}>{child}</div>
              ))}
            </div>
          )}
        </div>
      );
    },
    { Pane },
  );
  return { Allotment, LayoutPriority: { Low: 0, High: 1 } };
});

const resizeCallbacks = new Set<ResizeObserverCallback>();
class ResizeObserverMock {
  readonly #callback: ResizeObserverCallback;

  public constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    resizeCallbacks.add(callback);
  }
  public observe(): void {
    return undefined;
  }
  public disconnect(): void {
    resizeCallbacks.delete(this.#callback);
  }
  public unobserve(): void {
    return undefined;
  }
}

const resizeObserver: ResizeObserver = {
  disconnect: () => undefined,
  observe: () => undefined,
  unobserve: () => undefined,
};

const { ChatInterfaceDesktop, compactWorkspaceWidth } = await import('./chat-interface-desktop.js');
const { panelMinSizeChat, panelMinSizeViewer, panelMinSizeViewerTight, panelMinSizeWorkbench, tightWorkspaceWidth } =
  await import('@taucad/ui-core/constants/editor.constants');
const { WorkspaceFrame } = await import('./workspace-frame.js');
const { MemoryRouter } = await import('react-router');

/* `mount` remounts the workspace below one frame, as the gates above it hand over. */
const desktopTree = (mount = 'first'): React.JSX.Element => (
  <MemoryRouter initialEntries={['/w/home/one']}>
    <KeyboardProvider>
      <TooltipProvider>
        <WorkspaceFrame>
          <ChatInterfaceDesktop key={mount} />
        </WorkspaceFrame>
      </TooltipProvider>
    </KeyboardProvider>
  </MemoryRouter>
);
const renderDesktop = () => render(desktopTree());

const resizeTo = (width: number): void => {
  act(() => {
    const entry: ResizeObserverEntry = {
      borderBoxSize: [{ inlineSize: width, blockSize: 800 }],
      contentBoxSize: [{ inlineSize: width, blockSize: 800 }],
      contentRect: DOMRect.fromRect({ width, height: 800 }),
      devicePixelContentBoxSize: [{ inlineSize: width, blockSize: 800 }],
      target: document.body,
    };
    for (const callback of resizeCallbacks) {
      callback([entry], resizeObserver);
    }
  });
};

describe('ChatInterfaceDesktop', () => {
  beforeEach(() => {
    resizeCallbacks.clear();
    desktopLayout.chatOpen = true;
    desktopLayout.workbenchOpen = true;
    desktopLayout.compactAuxiliary = 'chat';
    editorState.isReady = true;
    splitView.laysOut = false;
    splitView.sizes = undefined;
    sidebar.open = true;
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 1400 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should initialize the compact lanes before displaying the workspace', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 1119.5 }));
    renderDesktop();

    expect(screen.getByRole('button', { name: 'Toggle Workbench lane' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('should rerender the workspace only when resizing crosses the compact boundary', async () => {
    renderDesktop();
    await screen.findByRole('button', { name: 'Toggle Workbench lane' });
    resizeTo(1400);
    renderViewer.mockClear();

    resizeTo(1300);
    resizeTo(1200);
    resizeTo(compactWorkspaceWidth);
    expect(renderViewer).not.toHaveBeenCalled();

    resizeTo(compactWorkspaceWidth - 1);
    expect(renderViewer).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Toggle Workbench lane' })).toHaveAttribute('aria-pressed', 'false');
    renderViewer.mockClear();
    resizeTo(900);
    expect(renderViewer).not.toHaveBeenCalled();
  });

  it('uses the 1119/1120 workspace boundary and keeps all three pane children stable', async () => {
    renderDesktop();
    const viewer = await screen.findByTestId('viewer-lane');

    resizeTo(compactWorkspaceWidth - 1);
    expect(screen.getByTestId('chat-lane').closest('[data-pane]')).toHaveAttribute('data-visible', 'true');
    expect(screen.getByTestId('workbench-lane').closest('[data-pane]')).toHaveAttribute('data-visible', 'false');
    expect(screen.getByTestId('viewer-lane')).toBe(viewer);

    resizeTo(compactWorkspaceWidth);
    expect(screen.getByTestId('chat-lane').closest('[data-pane]')).toHaveAttribute('data-visible', 'true');
    expect(screen.getByTestId('workbench-lane').closest('[data-pane]')).toHaveAttribute('data-visible', 'true');
    expect(screen.getByTestId('viewer-lane')).toBe(viewer);
    expect(document.querySelectorAll('[data-pane]')).toHaveLength(3);
  });

  /* From 768px with the sidebar open (544px of workspace) or on a landscape phone, a lane beside the full viewer
   * minimum would run past the viewport's edge; the viewer's minimum drops instead, and wide desktop keeps it. */
  it('lowers the viewer minimum only where a lane cannot fit beside the full viewer', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 544 }));
    renderDesktop();
    const viewerLane = await screen.findByTestId('viewer-lane');
    const viewerPane = viewerLane.closest('[data-pane]');
    expect(viewerPane).toHaveAttribute('data-min-size', String(panelMinSizeViewerTight));
    expect(panelMinSizeChat + panelMinSizeViewerTight).toBeLessThanOrEqual(544);
    expect(panelMinSizeWorkbench + panelMinSizeViewerTight).toBeLessThanOrEqual(544);

    resizeTo(tightWorkspaceWidth);
    expect(screen.getByTestId('viewer-lane').closest('[data-pane]')).toHaveAttribute(
      'data-min-size',
      String(panelMinSizeViewer),
    );
    resizeTo(tightWorkspaceWidth - 1);
    expect(screen.getByTestId('viewer-lane').closest('[data-pane]')).toHaveAttribute(
      'data-min-size',
      String(panelMinSizeViewerTight),
    );
    resizeTo(1400);
    expect(screen.getByTestId('viewer-lane').closest('[data-pane]')).toHaveAttribute(
      'data-min-size',
      String(panelMinSizeViewer),
    );
  });

  /* The editor state loads from storage before the lanes can take their persisted widths. The workspace
   * draws nothing of its own meanwhile: the persistent frame's lanes show beneath, never a blank (A15b). */
  it('shows the workspace frame instead of a blank while the editor state loads', async () => {
    editorState.isReady = false;
    renderDesktop();

    const opening = await screen.findByRole('status', { name: 'Opening project' });
    expect(opening).toHaveAttribute('aria-busy', 'true');
    expect(opening).toHaveClass('sr-only');
    expect(screen.queryByTestId('allotment')).not.toBeInTheDocument();
    const frame = document.querySelector('[data-slot="workspace-frame"]');
    expect(frame).toHaveClass('bg-background');
    expect(frame?.querySelector('[data-testid="chat-lane-frame"]')).toBeInTheDocument();
    /* The workbench lane drops at the compact width through the frame's own container query, which jsdom
     * does not evaluate: the class is the assertion, the width is checked in a browser. */
    expect(frame?.querySelector('[data-lane="workbench"]')?.className).toContain(
      '@max-[1120px]:[display:var(--frame-workbench-compact-display,none)]',
    );
    expect(compactWorkspaceWidth).toBe(1120);
    /* No wait is held back and nothing eases in: the frame is at rest from its first paint (U15). */
    expect(frame?.innerHTML).not.toMatch(/animate-in|fade-in|animation-delay/u);
  });

  /* The frame belongs to the load, not to each gate: a gate that hands over to the next mounts nothing in the
   * frame's place, so there is no blink to spend and the lanes show at once at every handover. */
  it('keeps one frame across the hand-over from the editor state to the lanes', async () => {
    editorState.isReady = false;
    const view = renderDesktop();
    const frame = document.querySelector('[data-slot="workspace-frame"]');

    editorState.isReady = true;
    view.rerender(desktopTree('second'));
    await screen.findByTestId('allotment');
    expect(document.querySelector('[data-slot="workspace-frame"]')).toBe(frame);
  });

  // C4 (blueprint, § Red-first tests): the frame element before the lanes are laid out is the same element after;
  // no descendant draws a skeleton; no animation class on the lane container.
  it('C4: the frame before the lanes are laid out is the same element after, drawing its lanes’ shapes with no entrance', async () => {
    renderDesktop();
    const frame = document.querySelector('[data-slot="workspace-frame"]');
    const lanes = await screen.findByTestId('allotment');
    const workspace = document.querySelector('[data-project-workspace]');

    expect(workspace).not.toHaveAttribute('data-workspace-lanes');
    /* The frame's lanes draw their content's shape on the ladder (Progressive Loading Policy rule 15). */
    expect(
      frame?.querySelector('[data-slot=workspace-frame-lanes] .wait-skeleton [data-slot=skeleton]'),
    ).not.toBeNull();
    expect(workspace?.querySelector('[data-testid="workspace-skeleton"]')).toBeNull();
    expect(workspace?.innerHTML).not.toMatch(/animate-in|fade-in/u);
    expect(document.querySelector('[data-slot="workspace-frame"]')).toBe(frame);
    expect(lanes.className).not.toMatch(/animate-|fade-/u);
  });

  it('C4: the split view lays out under the same frame, which then marks the lanes ready and reveals the panes', async () => {
    splitView.laysOut = true;
    renderDesktop();
    const frame = document.querySelector('[data-slot="workspace-frame"]');
    const lanes = await screen.findByTestId('allotment');

    expect(document.querySelector('[data-project-workspace]')).toHaveAttribute('data-workspace-lanes', 'ready');
    expect(lanes.className).not.toContain('content-visibility');
    expect(document.querySelector('[data-slot="workspace-frame"]')).toBe(frame);
    expect(frame?.className).toContain(
      '[&:has([data-workspace-lanes=ready])>[data-slot=workspace-frame-lanes]]:hidden',
    );
  });

  /* Staging QA 2026-11-27: at 1280 px a new project opens compact on the Workbench lane, which the native split view's
   * first layout leaves at its 360 px minimum (the hidden chat lane took its preferred width first) while the frame
   * drew it at 420 px, so its edge moved 60 px at the hand-over. The first layout gives each shown lane its width. */
  it('gives the shown Workbench lane its preferred width back after the first layout, from the viewer', async () => {
    desktopLayout.compactAuxiliary = 'workbench';
    splitView.laysOut = true;
    splitView.sizes = [0, 696, panelMinSizeWorkbench];
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.dataset['viewWidth'];
      return DOMRect.fromRect({ width: width === undefined ? 1056 : Number(width) });
    });
    renderDesktop();
    await screen.findByTestId('allotment');

    expect(panelMinSizeWorkbench).toBeLessThan(desktopLayout.workbenchWidth);
    expect(splitView.resize).toHaveBeenCalledExactlyOnceWith([
      0,
      696 - (desktopLayout.workbenchWidth - panelMinSizeWorkbench),
      desktopLayout.workbenchWidth,
    ]);
  });

  /* PL6: the composer mounts in the unrendered panes, so it adopts the frame's native input only in the commit that
   * marks the lanes ready and reveals them. */
  it("lets the composer adopt the frame's native input only once the lanes are ready", async () => {
    const unrevealed = renderDesktop();
    expect(await screen.findByTestId('chat-lane')).toHaveAttribute('data-hand-off-revealed', 'false');
    unrevealed.unmount();

    splitView.laysOut = true;
    renderDesktop();

    expect(await screen.findByTestId('chat-lane')).toHaveAttribute('data-hand-off-revealed', 'true');
    expect(document.querySelector('[data-project-workspace]')).toHaveAttribute('data-workspace-lanes', 'ready');
  });

  /* Review (r4586677545): the frame's composer box stays, over the chat lane, until a composer adopts its input; the
   * live layout says when the chat lane is closed, where no composer can take it, so the box hides there. */
  it('marks whether the live chat lane is shown once the lanes are ready, and not before', async () => {
    const unrevealed = renderDesktop();
    await screen.findByTestId('chat-lane');
    expect(document.querySelector('[data-project-workspace]')).not.toHaveAttribute('data-chat-lane');
    unrevealed.unmount();

    splitView.laysOut = true;
    renderDesktop();
    await screen.findByTestId('chat-lane');

    expect(document.querySelector('[data-project-workspace]')).toHaveAttribute('data-chat-lane', 'shown');
  });

  it('marks the live chat lane hidden when it is closed', async () => {
    splitView.laysOut = true;
    desktopLayout.chatOpen = false;
    renderDesktop();
    await screen.findByTestId('allotment');

    expect(document.querySelector('[data-project-workspace]')).toHaveAttribute('data-chat-lane', 'hidden');
  });

  it('holds the panes unrendered until the split view has laid them out', async () => {
    renderDesktop();
    const lanes = await screen.findByTestId('allotment');

    expect(lanes.className).toContain('[&_.split-view-container]:[content-visibility:hidden]');
  });

  /* Review round 1: the chat lane's mount-time composer focus lands while the panes are unrendered, where nothing can
   * take focus, so it is given again when they are revealed. */
  it('gives a navigation-requested composer focus when the panes are revealed', async () => {
    splitView.laysOut = true;
    globalThis.history.replaceState({ usr: { focusChatComposer: true } }, '');
    try {
      renderDesktop();
      await screen.findByTestId('allotment');

      /* The live composer's, not the frame's, which the mocked composer never adopts. */
      expect(document.activeElement).toBe(
        within(screen.getByTestId('chat-lane')).getByRole('textbox', { name: 'Chat message' }),
      );
    } finally {
      globalThis.history.replaceState(null, '');
    }
  });

  /* Review round 2: the control that navigated (the sidebar's "New chat") still holds focus when the panes are
   * revealed; the requested focus still goes to the composer. */
  it('gives the requested composer focus even while the navigating control still holds focus', async () => {
    splitView.laysOut = true;
    const navigating = document.createElement('button');
    document.body.append(navigating);
    navigating.focus();
    globalThis.history.replaceState({ usr: { focusChatComposer: true } }, '');
    try {
      renderDesktop();
      await screen.findByTestId('allotment');

      /* The live composer's, not the frame's, which the mocked composer never adopts. */
      expect(document.activeElement).toBe(
        within(screen.getByTestId('chat-lane')).getByRole('textbox', { name: 'Chat message' }),
      );
    } finally {
      globalThis.history.replaceState(null, '');
      navigating.remove();
    }
  });

  it('leaves focus alone when the navigation asked for none', async () => {
    splitView.laysOut = true;
    renderDesktop();
    await screen.findByTestId('allotment');

    expect(document.activeElement).toBe(document.body);
  });

  it('reserves fixed-control space inside the chat header without shifting its border', async () => {
    sidebar.open = false;
    renderDesktop();
    expect(await screen.findByTestId('chat-lane-header')).toHaveClass(
      'pl-(--titlebar-controls-width)',
      '[app-region:no-drag]',
    );
    // The archived-chats view has no header row, so it starts below the controls' row instead.
    expect(screen.getByTestId('chat-lane-archive')).toHaveClass('pt-9');
  });

  it('leaves the chat header and archive at their own insets while the sidebar holds the controls', async () => {
    sidebar.open = true;
    renderDesktop();
    expect(await screen.findByTestId('chat-lane-header')).toHaveClass('pl-1');
    expect(screen.getByTestId('chat-lane-header')).not.toHaveClass('pl-(--titlebar-controls-width)');
    expect(screen.getByTestId('chat-lane-archive')).not.toHaveClass('pt-9');
  });

  it('reserves fixed-control space inside the viewer header without shifting its border', async () => {
    desktopLayout.chatOpen = false;
    sidebar.open = false;
    renderDesktop();
    const viewer = await screen.findByTestId('viewer-lane');
    // One spacing step short: the chat lane toggle leads the tab bar with `pl-1`.
    expect(viewer.parentElement).toHaveClass(
      '[&_.dv-tabs-and-actions-container:not(.dv-view:not(:first-child)_*)]:before:w-[calc(var(--titlebar-controls-width)-var(--spacing))]',
    );
  });

  it('keeps the Viewer mounted when both auxiliary lanes are closed', async () => {
    desktopLayout.chatOpen = false;
    desktopLayout.workbenchOpen = false;
    renderDesktop();
    const viewer = await screen.findByTestId('viewer-lane');

    resizeTo(compactWorkspaceWidth - 1);
    expect(screen.getByTestId('chat-lane').closest('[data-pane]')).toHaveAttribute('data-visible', 'false');
    expect(screen.getByTestId('workbench-lane').closest('[data-pane]')).toHaveAttribute('data-visible', 'false');
    expect(screen.getByTestId('viewer-lane')).toBe(viewer);
    expect(document.querySelectorAll('[data-pane]')).toHaveLength(3);
  });

  it('keeps one workbench toggle mounted at the workspace top-right across state changes', async () => {
    const user = userEvent.setup();
    renderDesktop();
    const toggle = await screen.findByRole('button', { name: 'Toggle Workbench lane' });

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    // The shared 28 px PaneButton; its data-slot names the popover trigger it also is.
    expect(toggle).toHaveClass('size-7');
    expect(toggle.parentElement).toHaveClass('absolute', 'top-1', 'right-1', 'z-10');
    expect(document.querySelector('[data-project-workspace]')).toHaveClass('relative');

    await user.click(toggle);
    expect(setWorkbenchOpen).toHaveBeenCalledExactlyOnceWith(false);

    desktopLayout.workbenchOpen = false;
    resizeTo(compactWorkspaceWidth - 1);

    const closedToggle = screen.getByRole('button', { name: 'Toggle Workbench lane' });
    expect(closedToggle).toBe(toggle);
    await waitFor(() => {
      expect(closedToggle).toHaveAttribute('aria-pressed', 'false');
    });

    await user.click(closedToggle);
    expect(setWorkbenchOpen).toHaveBeenLastCalledWith(true);
  });

  it('loads the docks’ stylesheet with the layout, not inside a lane', async () => {
    /* A stylesheet with a precedence suspends its nearest boundary until it loads. Inside a lane that boundary is the
     * split view's per-pane one, whose fallback replaced the frame's lanes with bare spinners (Progressive Loading
     * Policy rule 15). The layout loads it itself, so the sheet holds the layout's boundary, where the frame shows. */
    renderDesktop();
    await screen.findByTestId('viewer-lane');

    const sheet = screen.getByTestId('dockview-styles');
    expect(sheet.closest('[data-pane]')).toBeNull();
  });

  it('does not render a workspace-global Files toggle', async () => {
    renderDesktop();

    await screen.findByRole('button', { name: 'Toggle Workbench lane' });
    expect(screen.queryByRole('button', { name: /files pane/i })).not.toBeInTheDocument();
  });
});
